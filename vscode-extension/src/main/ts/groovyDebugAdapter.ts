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

        // Handle attach mode
        if (config.request === 'attach') {
            // For attach mode, we simply forward to the Java debugger
            const javaDebugConfig: vscode.DebugConfiguration = {
                type: 'java',
                name: 'Attach to Groovy Process',
                request: 'attach',
                hostName: config.hostName || 'localhost',
                port: config.port || 5005,
                projectName: config.projectName,
                sourcePaths: config.sourcePaths || []
            };
            return javaDebugConfig;
        }

        // Handle launch mode
        if (config.request !== 'launch') {
            vscode.window.showErrorMessage(`Unknown request type: ${config.request}`);
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
        
        // Enable debug mode with a specific port, bind to localhost only for security
        const debugPort = await this.findFreePort();
        args.push(`-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:${debugPort}`);
        
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

        // Create a task to start the Groovy process
        const preLaunchTask = this.createPreLaunchTask(javaPath, args, folder, debugPort);
        
        // Execute the task and wait for the debug port to be ready
        const taskExecution = await vscode.tasks.executeTask(preLaunchTask);
        
        // Wait for the debug port to be ready
        await this.waitForDebugPort(debugPort);
        
        // Create the Java debug configuration
        const javaDebugConfig: vscode.DebugConfiguration = {
            type: 'java',
            name: 'Attach to Groovy Process',
            request: 'attach',
            hostName: 'localhost',
            port: debugPort,
            projectName: config.projectName,
            sourcePaths: config.sourcePaths || []
        };
        
        // We don't need to store the task execution as VSCode will handle it
        
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
        const fs = await import('fs');
        
        // Add current workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                // Common locations for compiled classes - only add if they exist
                const potentialPaths = [
                    path.join(folder.uri.fsPath, 'build', 'classes'),
                    path.join(folder.uri.fsPath, 'out'),
                    path.join(folder.uri.fsPath, 'bin'),
                    path.join(folder.uri.fsPath, 'target', 'classes')
                ];
                
                for (const p of potentialPaths) {
                    if (fs.existsSync(p)) {
                        classpath.push(p);
                    }
                }
            }
        }
        
        // Add Groovy runtime from environment
        const groovyHome = process.env.GROOVY_HOME;
        if (groovyHome) {
            const groovyLib = path.join(groovyHome, 'lib');
            if (fs.existsSync(groovyLib)) {
                classpath.push(path.join(groovyLib, '*'));
            }
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

    private async findFreePort(retries: number = 3): Promise<number> {
        const net = await import('net');
        
        for (let i = 0; i < retries; i++) {
            try {
                const port = await new Promise<number>((resolve, reject) => {
                    const server = net.createServer();
                    server.listen(0, 'localhost', () => {
                        const address = server.address();
                        if (address && typeof address !== 'string') {
                            const port = address.port;
                            server.close(() => resolve(port));
                        } else {
                            server.close();
                            reject(new Error('Failed to get port from server address'));
                        }
                    });
                    server.on('error', reject);
                });
                return port;
            } catch (error) {
                if (i === retries - 1) {
                    throw new Error(`Failed to find free port after ${retries} attempts: ${error}`);
                }
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        throw new Error('Failed to find free port');
    }

    private createPreLaunchTask(javaPath: string, args: string[], folder: vscode.WorkspaceFolder | undefined, debugPort: number): vscode.Task {
        const taskName = `Launch Groovy Debug Process`;
        
        // Use the folder's URI or the first workspace folder
        const cwd = folder?.uri.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        const processExecution = new vscode.ProcessExecution(javaPath, args, {
            cwd: cwd
        });

        const task = new vscode.Task(
            { type: 'groovy-debug-launch', debugPort: debugPort },
            folder || vscode.TaskScope.Workspace,
            taskName,
            'groovy',
            processExecution
        );

        task.isBackground = true;
        // Problem matcher to detect when the debug port is ready
        task.problemMatchers = [];

        return task;
    }
    
    private async waitForDebugPort(port: number, timeout: number = 10000): Promise<void> {
        const net = await import('net');
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const client = net.createConnection({ port: port, host: 'localhost' }, () => {
                        client.end();
                        resolve();
                    });
                    client.on('error', reject);
                    client.setTimeout(1000);
                    client.on('timeout', () => {
                        client.destroy();
                        reject(new Error('Connection timeout'));
                    });
                });
                return; // Port is ready
            } catch (error) {
                // Port not ready yet, wait a bit and retry
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        throw new Error(`Timeout waiting for debug port ${port} to be ready`);
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