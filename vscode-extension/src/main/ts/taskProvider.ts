import * as vscode from 'vscode';
import { BuildToolDetector, BuildToolType, GradleTaskProvider, MavenTaskProvider } from './buildTools';

export class GroovyTaskProvider implements vscode.TaskProvider {
    private tasks: vscode.Task[] | undefined;

    constructor(private workspaceRoot: string, private type: 'gradle' | 'maven') {}

    public provideTasks(): Thenable<vscode.Task[]> | undefined {
        if (!this.tasks) {
            this.tasks = this.getTasks();
        }
        return Promise.resolve(this.tasks);
    }

    public resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
    }

    private getTasks(): vscode.Task[] {
        const tasks: vscode.Task[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            return tasks;
        }

        const buildTool = BuildToolDetector.detectBuildTool(workspaceFolder);
        if (!buildTool || (this.type === 'gradle' && buildTool.type !== BuildToolType.Gradle) ||
            (this.type === 'maven' && buildTool.type !== BuildToolType.Maven)) {
            return tasks;
        }

        // Return empty array as actual tasks will be discovered dynamically
        // This is just to register the provider
        return tasks;
    }
}

export function registerTaskProviders(context: vscode.ExtensionContext): void {
    const workspaceRoot = vscode.workspace.rootPath;
    if (!workspaceRoot) {
        return;
    }

    const gradleTaskProvider = vscode.tasks.registerTaskProvider('gradle', 
        new GroovyTaskProvider(workspaceRoot, 'gradle'));
    const mavenTaskProvider = vscode.tasks.registerTaskProvider('maven', 
        new GroovyTaskProvider(workspaceRoot, 'maven'));

    context.subscriptions.push(gradleTaskProvider);
    context.subscriptions.push(mavenTaskProvider);
}