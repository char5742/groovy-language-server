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
    async getTasks(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const gradleExecutable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
            const gradlewPath = path.join(this.buildTool.projectRoot, gradleExecutable);
            
            // Use gradlew if exists, otherwise use system gradle
            const command = fs.existsSync(gradlewPath) ? gradlewPath : 'gradle';
            
            const gradleProcess = spawn(command, ['tasks', '--all'], {
                cwd: this.buildTool.projectRoot,
                shell: true
            });
            
            let output = '';
            gradleProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            gradleProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Gradle process exited with code ${code}`));
                    return;
                }
                
                const tasks = this.parseGradleTasks(output);
                resolve(tasks);
            });
            
            gradleProcess.on('error', (error) => {
                reject(error);
            });
        });
    }
    
    private parseGradleTasks(output: string): string[] {
        const tasks: string[] = [];
        const lines = output.split('\n');
        let inTaskSection = false;
        
        for (const line of lines) {
            if (line.includes('tasks')) {
                inTaskSection = true;
                continue;
            }
            
            if (inTaskSection && line.trim() === '') {
                break;
            }
            
            if (inTaskSection) {
                const match = line.match(/^(\w+)\s+-/);
                if (match) {
                    tasks.push(match[1]);
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
        
        const task = new vscode.Task(
            taskDefinition,
            this.workspaceFolder,
            taskName,
            'gradle',
            new vscode.ShellExecution(command, [taskName], {
                cwd: this.buildTool.projectRoot
            }),
            '$gradle'
        );
        
        task.group = vscode.TaskGroup.Build;
        return task;
    }
}

export class MavenTaskProvider extends TaskProvider {
    async getTasks(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const mvnwPath = path.join(this.buildTool.projectRoot, process.platform === 'win32' ? 'mvnw.cmd' : './mvnw');
            const command = fs.existsSync(mvnwPath) ? mvnwPath : 'mvn';
            
            const mavenProcess = spawn(command, ['help:describe', '-Dcmd=compile'], {
                cwd: this.buildTool.projectRoot,
                shell: true
            });
            
            mavenProcess.on('close', () => {
                // Return common Maven goals
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
            
            mavenProcess.on('error', (error) => {
                reject(error);
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
        
        const task = new vscode.Task(
            taskDefinition,
            this.workspaceFolder,
            goalName,
            'maven',
            new vscode.ShellExecution(command, goalName.split(' '), {
                cwd: this.buildTool.projectRoot
            }),
            '$maven'
        );
        
        task.group = vscode.TaskGroup.Build;
        return task;
    }
}