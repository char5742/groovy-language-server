import * as vscode from 'vscode';
import * as path from 'path';
import findJava from './utils/findJava';

export class GroovyDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    
    async createDebugAdapterDescriptor(
        session: vscode.DebugSession, 
        executable: vscode.DebugAdapterExecutable | undefined
    ): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
        // We don't provide our own debug adapter
        // Instead, we'll transform the configuration to work with Java debugging
        return undefined;
    }
}

export class GroovyDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    
    async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | undefined> {
        
        // If launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'groovy') {
                config.type = 'groovy';
                config.request = 'launch';
                config.name = 'Launch Groovy';
                config.script = '${file}';
            }
        }

        if (config.type !== 'groovy') {
            return undefined;
        }

        // Find Java executable
        const javaPath = await this.findJavaExecutable();
        if (!javaPath) {
            vscode.window.showErrorMessage('Could not find Java runtime. Please set groovy.java.home in settings.');
            return undefined;
        }

        // Build the command line for launching Groovy
        const args: string[] = [];
        
        // Enable debug mode with a specific port
        const debugPort = await this.findFreePort();
        args.push(`-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${debugPort}`);
        
        // Add VM arguments
        if (config.vmArgs) {
            args.push(...config.vmArgs.split(' ').filter((arg: string) => arg));
        }

        // Set encoding
        if (config.encoding) {
            args.push(`-Dfile.encoding=${config.encoding}`);
        }

        // Build classpath
        const classpath = await this.buildClasspath(config);
        if (classpath.length > 0) {
            args.push('-cp', classpath.join(path.delimiter));
        }

        // Determine what to run
        if (config.script) {
            // For scripts, we need groovy on the classpath
            if (!classpath.some(cp => cp.includes('groovy'))) {
                vscode.window.showErrorMessage('Groovy runtime not found. Please ensure GROOVY_HOME is set or groovy jars are in the classpath.');
                return undefined;
            }
            args.push('groovy.ui.GroovyMain', this.resolveVariables(config.script));
        } else if (config.mainClass) {
            args.push(config.mainClass);
        } else {
            vscode.window.showErrorMessage('Either mainClass or script must be specified in launch configuration.');
            return undefined;
        }

        // Add program arguments
        if (config.args) {
            args.push(...config.args.split(' ').filter((arg: string) => arg));
        }

        // Create a compound launch configuration
        // First, we'll use a task to start the Groovy process
        const preLaunchTask = this.createPreLaunchTask(javaPath, args, folder);
        
        // Then, we'll attach the Java debugger
        const javaDebugConfig: vscode.DebugConfiguration = {
            type: 'java',
            name: 'Attach to Groovy Process',
            request: 'attach',
            hostName: 'localhost',
            port: debugPort,
            projectName: config.projectName,
            sourcePaths: config.sourcePaths || []
        };

        // Store the task name for cleanup
        config.preLaunchTask = preLaunchTask.name;
        
        // Return the Java debug configuration
        return javaDebugConfig;
    }

    private async findJavaExecutable(): Promise<string | null> {
        const config = vscode.workspace.getConfiguration('groovy');
        const javaHome = config.get<string>('java.home');
        
        if (javaHome) {
            return path.join(javaHome, 'bin', 'java');
        }

        return await findJava();
    }

    private async buildClasspath(config: vscode.DebugConfiguration): Promise<string[]> {
        const classpath: string[] = [];
        
        // Add current workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                // Common locations for compiled classes
                classpath.push(path.join(folder.uri.fsPath, 'build', 'classes'));
                classpath.push(path.join(folder.uri.fsPath, 'out'));
                classpath.push(path.join(folder.uri.fsPath, 'bin'));
                classpath.push(path.join(folder.uri.fsPath, 'target', 'classes'));
            }
        }
        
        // Add Groovy runtime from environment
        const groovyHome = process.env.GROOVY_HOME;
        if (groovyHome) {
            classpath.push(path.join(groovyHome, 'lib', '*'));
        }

        // Add user-specified classpath
        if (config.classpath && Array.isArray(config.classpath)) {
            classpath.push(...config.classpath);
        }

        // Add workspace classpath from settings
        const workspaceConfig = vscode.workspace.getConfiguration('groovy');
        const workspaceClasspath = workspaceConfig.get<string[]>('classpath');
        if (workspaceClasspath) {
            classpath.push(...workspaceClasspath);
        }

        return classpath;
    }

    private async findFreePort(): Promise<number> {
        const net = await import('net');
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.listen(0, () => {
                const port = (server.address() as any).port;
                server.close(() => resolve(port));
            });
            server.on('error', reject);
        });
    }

    private createPreLaunchTask(javaPath: string, args: string[], folder?: vscode.WorkspaceFolder): vscode.Task {
        const taskName = `Launch Groovy Debug Process`;
        
        const processExecution = new vscode.ProcessExecution(javaPath, args, {
            cwd: folder?.uri.fsPath || vscode.workspace.rootPath
        });

        const task = new vscode.Task(
            { type: 'groovy-debug-launch' },
            folder || vscode.TaskScope.Workspace,
            taskName,
            'groovy',
            processExecution
        );

        task.isBackground = true;
        task.problemMatchers = [];

        return task;
    }

    private resolveVariables(value: string): string {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return value;
        }

        return value
            .replace(/\$\{file\}/g, activeEditor.document.uri.fsPath)
            .replace(/\$\{fileBasename\}/g, path.basename(activeEditor.document.uri.fsPath))
            .replace(/\$\{fileBasenameNoExtension\}/g, path.basename(activeEditor.document.uri.fsPath, path.extname(activeEditor.document.uri.fsPath)))
            .replace(/\$\{fileDirname\}/g, path.dirname(activeEditor.document.uri.fsPath));
    }
}