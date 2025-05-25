import * as vscode from 'vscode';
import { BuildToolDetector, BuildToolType, GradleTaskProvider, MavenTaskProvider, TaskProvider } from './buildTools';

interface TaskTreeItem extends vscode.TreeItem {
    task?: string;
    buildToolType?: BuildToolType;
}

export class TaskExplorerProvider implements vscode.TreeDataProvider<TaskTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskTreeItem | undefined | null | void> = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private tasks: Map<string, string[]> = new Map();
    private taskProviders: Map<string, TaskProvider> = new Map();
    
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
                        const key = `${buildTool.type}:${workspaceFolder.name}`;
                        this.tasks.set(key, tasks);
                        this.taskProviders.set(key, provider);
                    } catch (error) {
                        console.error(`Failed to get tasks for ${workspaceFolder.name}:`, error);
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
            
            for (const [key, tasks] of this.tasks) {
                const [buildToolType, workspaceName] = key.split(':');
                const item: TaskTreeItem = {
                    label: `${workspaceName} (${buildToolType})`,
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                    contextValue: 'buildTool',
                    buildToolType: buildToolType as BuildToolType
                };
                items.push(item);
            }
            
            return Promise.resolve(items);
        } else if (element.contextValue === 'buildTool') {
            // Show tasks for a specific build tool
            const label = typeof element.label === 'string' ? element.label : element.label?.label || '';
            const key = `${element.buildToolType}:${label.split(' ')[0]}`;
            const tasks = this.tasks.get(key) || [];
            
            const items: TaskTreeItem[] = tasks.map(task => ({
                label: task,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                contextValue: 'task',
                task: task,
                buildToolType: element.buildToolType,
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
        const provider = this.taskProviders.get(key);
        if (provider) {
            const task = provider.createTask(taskName);
            vscode.tasks.executeTask(task);
        }
    }
}