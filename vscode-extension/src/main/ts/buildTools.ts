import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export enum BuildToolType {
    Gradle = 'gradle',
    Maven = 'maven',
    None = 'none'
}

export interface BuildTool {
    type: BuildToolType;
    buildFile: string;
    projectRoot: string;
}

export class BuildToolDetector {
    static detectBuildTool(workspaceFolder: vscode.WorkspaceFolder): BuildTool | null {
        const workspacePath = workspaceFolder.uri.fsPath;
        
        // Check for Gradle
        const gradleFiles = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
        for (const gradleFile of gradleFiles) {
            const gradlePath = path.join(workspacePath, gradleFile);
            if (fs.existsSync(gradlePath)) {
                return {
                    type: BuildToolType.Gradle,
                    buildFile: gradlePath,
                    projectRoot: workspacePath
                };
            }
        }
        
        // Check for Maven
        const pomPath = path.join(workspacePath, 'pom.xml');
        if (fs.existsSync(pomPath)) {
            return {
                type: BuildToolType.Maven,
                buildFile: pomPath,
                projectRoot: workspacePath
            };
        }
        
        return null;
    }
}

export abstract class TaskProvider {
    protected workspaceFolder: vscode.WorkspaceFolder;
    protected buildTool: BuildTool;
    
    constructor(workspaceFolder: vscode.WorkspaceFolder, buildTool: BuildTool) {
        this.workspaceFolder = workspaceFolder;
        this.buildTool = buildTool;
    }
    
    abstract getTasks(): Promise<string[]>;
    abstract createTask(taskName: string): vscode.Task;
}

export class GradleTaskProvider extends TaskProvider {
    private static readonly TASK_TIMEOUT_MS = 30000; // 30 seconds
    
    async getTasks(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const gradleExecutable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
            const gradlewPath = path.join(this.buildTool.projectRoot, gradleExecutable);
            
            // Use gradlew if exists, otherwise use system gradle
            const command = fs.existsSync(gradlewPath) ? gradlewPath : 'gradle';
            const args = ['tasks', '--all'];
            
            // Security: use shell: false and absolute paths
            const options = {
                cwd: this.buildTool.projectRoot,
                shell: false,
                windowsHide: true
            };
            
            // For Windows, we need to handle .bat files differently
            let spawnCommand = command;
            let spawnArgs = args;
            if (process.platform === 'win32' && command.endsWith('.bat')) {
                spawnCommand = 'cmd.exe';
                spawnArgs = ['/c', command, ...args];
            }
            
            const gradleProcess = spawn(spawnCommand, spawnArgs, options);
            
            let output = '';
            let errorOutput = '';
            let timedOut = false;
            
            // Set timeout
            const timeoutId = setTimeout(() => {
                timedOut = true;
                gradleProcess.kill('SIGTERM');
                reject(new Error(`Gradle task discovery timed out after ${GradleTaskProvider.TASK_TIMEOUT_MS}ms`));
            }, GradleTaskProvider.TASK_TIMEOUT_MS);
            
            gradleProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            gradleProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            gradleProcess.on('close', (code) => {
                clearTimeout(timeoutId);
                
                if (timedOut) {
                    return;
                }
                
                if (code !== 0) {
                    const errorMessage = errorOutput || `Gradle process exited with code ${code}`;
                    reject(new Error(`Failed to get Gradle tasks: ${errorMessage}`));
                    return;
                }
                
                const tasks = this.parseGradleTasks(output);
                resolve(tasks);
            });
            
            gradleProcess.on('error', (error: any) => {
                clearTimeout(timeoutId);
                
                if (timedOut) {
                    return;
                }
                
                if (error.code === 'ENOENT') {
                    reject(new Error(`Gradle executable not found: ${command}. Please ensure Gradle is installed and available in PATH.`));
                } else if (error.code === 'EACCES') {
                    reject(new Error(`Permission denied to execute Gradle: ${command}`));
                } else {
                    reject(new Error(`Failed to execute Gradle: ${error.message}`));
                }
            });
        });
    }
    
    private parseGradleTasks(output: string): string[] {
        const tasks: string[] = [];
        const lines = output.split('\n');
        let inTaskSection = false;
        
        for (const line of lines) {
            // Look for various task section headers
            if (line.match(/^-+\s+Tasks\s+runnable\s+from\s+/) || 
                line.includes('All tasks runnable from') ||
                line.includes('Other tasks')) {
                inTaskSection = true;
                continue;
            }
            
            // End of task section
            if (inTaskSection && (line.trim() === '' || line.startsWith('BUILD SUCCESSFUL'))) {
                break;
            }
            
            if (inTaskSection) {
                // Match various task name patterns:
                // - Simple tasks: "build - Description"
                // - Subproject tasks: ":subproject:task - Description"
                // - Tasks with hyphens: "my-task - Description"
                const match = line.match(/^([\w:.-]+)\s+-\s+/);
                if (match) {
                    const taskName = match[1].trim();
                    // Filter out section headers that might match the pattern
                    if (!taskName.endsWith(':') && taskName !== 'task') {
                        tasks.push(taskName);
                    }
                }
            }
        }
        
        return tasks;
    }
    
    createTask(taskName: string): vscode.Task {
        const gradleExecutable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
        const gradlewPath = path.join(this.buildTool.projectRoot, gradleExecutable);
        const command = fs.existsSync(gradlewPath) ? gradlewPath : 'gradle';
        
        const taskDefinition: vscode.TaskDefinition = {
            type: 'gradle',
            task: taskName
        };
        
        // Use quoted execution for security
        const quotedCommand = process.platform === 'win32' ? `"${command}"` : command;
        
        const task = new vscode.Task(
            taskDefinition,
            this.workspaceFolder,
            taskName,
            'gradle',
            new vscode.ShellExecution(quotedCommand, [taskName], {
                cwd: this.buildTool.projectRoot
            }),
            '$gradle'
        );
        
        task.group = vscode.TaskGroup.Build;
        task.presentationOptions = {
            echo: true,
            reveal: vscode.TaskRevealKind.Always,
            focus: false,
            panel: vscode.TaskPanelKind.Shared,
            showReuseMessage: true,
            clear: false
        };
        return task;
    }
}

export class MavenTaskProvider extends TaskProvider {
    private static readonly TASK_TIMEOUT_MS = 30000; // 30 seconds
    
    async getTasks(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const mvnwPath = path.join(this.buildTool.projectRoot, process.platform === 'win32' ? 'mvnw.cmd' : './mvnw');
            const command = fs.existsSync(mvnwPath) ? mvnwPath : 'mvn';
            const args = ['help:describe', '-Dcmd=compile'];
            
            // Security: use shell: false and absolute paths
            const options = {
                cwd: this.buildTool.projectRoot,
                shell: false,
                windowsHide: true
            };
            
            // For Windows, we need to handle .cmd files differently
            let spawnCommand = command;
            let spawnArgs = args;
            if (process.platform === 'win32' && command.endsWith('.cmd')) {
                spawnCommand = 'cmd.exe';
                spawnArgs = ['/c', command, ...args];
            }
            
            const mavenProcess = spawn(spawnCommand, spawnArgs, options);
            
            let errorOutput = '';
            let timedOut = false;
            
            // Set timeout
            const timeoutId = setTimeout(() => {
                timedOut = true;
                mavenProcess.kill('SIGTERM');
                reject(new Error(`Maven task discovery timed out after ${MavenTaskProvider.TASK_TIMEOUT_MS}ms`));
            }, MavenTaskProvider.TASK_TIMEOUT_MS);
            
            mavenProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            mavenProcess.on('close', (code) => {
                clearTimeout(timeoutId);
                
                if (timedOut) {
                    return;
                }
                
                // Return common Maven goals regardless of the help command result
                // as Maven help:describe might fail in some configurations
                const commonGoals = [
                    'clean',
                    'validate',
                    'compile',
                    'test',
                    'package',
                    'verify',
                    'install',
                    'deploy',
                    'site',
                    'clean compile',
                    'clean test',
                    'clean package',
                    'clean install'
                ];
                resolve(commonGoals);
            });
            
            mavenProcess.on('error', (error: any) => {
                clearTimeout(timeoutId);
                
                if (timedOut) {
                    return;
                }
                
                if (error.code === 'ENOENT') {
                    // Maven not found, but we can still provide common goals
                    console.warn(`Maven executable not found: ${command}. Providing default goals.`);
                    const commonGoals = [
                        'clean',
                        'validate',
                        'compile',
                        'test',
                        'package',
                        'verify',
                        'install',
                        'deploy',
                        'site',
                        'clean compile',
                        'clean test',
                        'clean package',
                        'clean install'
                    ];
                    resolve(commonGoals);
                } else if (error.code === 'EACCES') {
                    reject(new Error(`Permission denied to execute Maven: ${command}`));
                } else {
                    reject(new Error(`Failed to execute Maven: ${error.message}`));
                }
            });
        });
    }
    
    createTask(goalName: string): vscode.Task {
        const mvnwPath = path.join(this.buildTool.projectRoot, process.platform === 'win32' ? 'mvnw.cmd' : './mvnw');
        const command = fs.existsSync(mvnwPath) ? mvnwPath : 'mvn';
        
        const taskDefinition: vscode.TaskDefinition = {
            type: 'maven',
            goal: goalName
        };
        
        // Use quoted execution for security
        const quotedCommand = process.platform === 'win32' ? `"${command}"` : command;
        
        const task = new vscode.Task(
            taskDefinition,
            this.workspaceFolder,
            goalName,
            'maven',
            new vscode.ShellExecution(quotedCommand, goalName.split(' '), {
                cwd: this.buildTool.projectRoot
            }),
            '$maven'
        );
        
        task.group = vscode.TaskGroup.Build;
        task.presentationOptions = {
            echo: true,
            reveal: vscode.TaskRevealKind.Always,
            focus: false,
            panel: vscode.TaskPanelKind.Shared,
            showReuseMessage: true,
            clear: false
        };
        return task;
    }
}