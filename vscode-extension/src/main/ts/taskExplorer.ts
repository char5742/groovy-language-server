import * as vscode from 'vscode';
import { BuildToolDetector, BuildToolType, GradleTaskProvider, MavenTaskProvider, TaskProvider } from './buildTools';

interface TaskTreeItem extends vscode.TreeItem {
    task?: string;
    buildToolType?: BuildToolType;
    workspaceName?: string;
}

interface TaskProviderInfo {
    provider: TaskProvider;
    buildToolType: BuildToolType;
    workspaceName: string;
}

export class TaskExplorerProvider implements vscode.TreeDataProvider<TaskTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskTreeItem | undefined | null | void> = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private tasks: Map<string, string[]> = new Map();
    private taskProviders: Map<string, TaskProviderInfo> = new Map();
    
    constructor() {
        this.refresh();
    }
    
    refresh(): void {
        this.tasks.clear();
        this.taskProviders.clear();
        this.discoverTasks().then(() => {
            this._onDidChangeTreeData.fire();
        });
    }
    
    private async discoverTasks(): Promise<void> {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }
        
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const buildTool = BuildToolDetector.detectBuildTool(workspaceFolder);
            if (buildTool) {
                let provider: TaskProvider | null = null;
                
                switch (buildTool.type) {
                    case BuildToolType.Gradle:
                        provider = new GradleTaskProvider(workspaceFolder, buildTool);
                        break;
                    case BuildToolType.Maven:
                        provider = new MavenTaskProvider(workspaceFolder, buildTool);
                        break;
                }
                
                if (provider) {
                    try {
                        const tasks = await provider.getTasks();
                        const key = this.createKey(buildTool.type, workspaceFolder.name);
                        this.tasks.set(key, tasks);
                        this.taskProviders.set(key, {
                            provider,
                            buildToolType: buildTool.type,
                            workspaceName: workspaceFolder.name
                        });
                    } catch (error) {
                        console.error(`Failed to get tasks for ${workspaceFolder.name}:`, error);
                        vscode.window.showWarningMessage(
                            `Failed to load ${buildTool.type} tasks for ${workspaceFolder.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
                        );
                    }
                }
            }
        }
    }
    
    getTreeItem(element: TaskTreeItem): vscode.TreeItem {
        return element;
    }
    
    getChildren(element?: TaskTreeItem): Thenable<TaskTreeItem[]> {
        if (!element) {
            // Root level - show workspace folders with build tools
            const items: TaskTreeItem[] = [];
            
            for (const [key, providerInfo] of this.taskProviders) {
                const item: TaskTreeItem = {
                    label: `${providerInfo.workspaceName} (${providerInfo.buildToolType})`,
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                    contextValue: 'buildTool',
                    buildToolType: providerInfo.buildToolType,
                    workspaceName: providerInfo.workspaceName
                };
                items.push(item);
            }
            
            return Promise.resolve(items);
        } else if (element.contextValue === 'buildTool' && element.buildToolType && element.workspaceName) {
            // Show tasks for a specific build tool
            const key = this.createKey(element.buildToolType, element.workspaceName);
            const tasks = this.tasks.get(key) || [];
            
            const items: TaskTreeItem[] = tasks.map(task => ({
                label: task,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                contextValue: 'task',
                task: task,
                buildToolType: element.buildToolType,
                workspaceName: element.workspaceName,
                command: {
                    command: 'groovy.runTask',
                    title: 'Run Task',
                    arguments: [key, task]
                }
            }));
            
            return Promise.resolve(items);
        }
        
        return Promise.resolve([]);
    }
    
    runTask(key: string, taskName: string): void {
        const providerInfo = this.taskProviders.get(key);
        if (providerInfo) {
            const task = providerInfo.provider.createTask(taskName);
            vscode.tasks.executeTask(task).then(
                () => {
                    vscode.window.showInformationMessage(`Running ${providerInfo.buildToolType} task: ${taskName}`);
                },
                (error) => {
                    vscode.window.showErrorMessage(`Failed to run task: ${error.message}`);
                }
            );
        } else {
            vscode.window.showErrorMessage(`Task provider not found for: ${key}`);
        }
    }
    
    private createKey(buildToolType: BuildToolType, workspaceName: string): string {
        return `${buildToolType}:${workspaceName}`;
    }
}