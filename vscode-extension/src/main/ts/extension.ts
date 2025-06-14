////////////////////////////////////////////////////////////////////////////////
// Copyright 2022 Prominic.NET, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License
//
// Author: Prominic.NET, Inc.
// No warranty of merchantability or fitness of any kind.
// Use this software at your own risk.
////////////////////////////////////////////////////////////////////////////////
import findJava from "./utils/findJava";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  Executable,
} from "vscode-languageclient/node";
import { TaskExplorerProvider } from "./taskExplorer";
import { registerTaskProviders } from "./taskProvider";
import { GroovyDebugAdapterDescriptorFactory, GroovyDebugConfigurationProvider } from "./groovyDebugAdapter";
import { detectGradleSettings, getComputedClasspath, getComputedJavaHome, getCachedGradleInfo } from "./utils/gradleUtils";

const MISSING_JAVA_ERROR =
  "Could not locate valid JDK. To configure JDK manually, use the groovy.java.home setting.";
const INVALID_JAVA_ERROR =
  "The groovy.java.home setting does not point to a valid JDK.";
const INITIALIZING_MESSAGE = "Initializing Groovy language server...";
const RELOAD_WINDOW_MESSAGE =
  "To apply new settings for Groovy, please reload the window.";
const STARTUP_ERROR = "The Groovy extension failed to start.";
const LABEL_RELOAD_WINDOW = "Reload Window";
let extensionContext: vscode.ExtensionContext | null = null;
let languageClient: LanguageClient | null = null;
let javaPath: string | null = null;
let taskExplorerProvider: TaskExplorerProvider | null = null;

function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
  if (event.affectsConfiguration("groovy.java.home")) {
    javaPath = findJava();
    //we're going to try to kill the language server and then restart
    //it with the new settings
    restartLanguageServer();
  }
}

function restartLanguageServer() {
  if (!languageClient) {
    startLanguageServer();
    return;
  }
  let oldLanguageClient = languageClient;
  languageClient = null;
  oldLanguageClient.stop().then(
    () => {
      startLanguageServer();
    },
    () => {
      //something went wrong restarting the language server...
      //this shouldn't happen, but if it does, the user can manually restart
      vscode.window
        .showWarningMessage(RELOAD_WINDOW_MESSAGE, LABEL_RELOAD_WINDOW)
        .then((action) => {
          if (action === LABEL_RELOAD_WINDOW) {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
    }
  );
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  
  // Auto-detect Gradle settings
  await detectGradleSettings();
  
  javaPath = findJava();
  vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration);

  vscode.commands.registerCommand(
    "groovy.restartServer",
    restartLanguageServer
  );

  vscode.commands.registerCommand(
    "groovy.refreshGradleSettings",
    async () => {
      await detectGradleSettings();
      vscode.window.showInformationMessage("Gradle settings refreshed");
      restartLanguageServer();
    }
  );

  // Register task-related commands
  taskExplorerProvider = new TaskExplorerProvider();
  vscode.window.createTreeView('groovyTasksExplorer', {
    treeDataProvider: taskExplorerProvider,
    showCollapseAll: true
  });

  vscode.commands.registerCommand('groovy.gradle.refresh', () => {
    taskExplorerProvider?.refresh();
  });

  vscode.commands.registerCommand('groovy.maven.refresh', () => {
    taskExplorerProvider?.refresh();
  });

  vscode.commands.registerCommand('groovy.runTask', (key: string, taskName: string) => {
    taskExplorerProvider?.runTask(key, taskName);
  });

  vscode.commands.registerCommand('groovy.gradle.runTask', async () => {
    const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
    if (tasks.length > 0) {
      const taskNames = tasks.map(t => t.name);
      const selected = await vscode.window.showQuickPick(taskNames, {
        placeHolder: 'Select a Gradle task to run'
      });
      if (selected) {
        const task = tasks.find(t => t.name === selected);
        if (task) {
          await vscode.tasks.executeTask(task);
        }
      }
    } else {
      vscode.window.showInformationMessage('No Gradle tasks found');
    }
  });

  vscode.commands.registerCommand('groovy.maven.runGoal', async () => {
    const tasks = await vscode.tasks.fetchTasks({ type: 'maven' });
    if (tasks.length > 0) {
      const goalNames = tasks.map(t => t.name);
      const selected = await vscode.window.showQuickPick(goalNames, {
        placeHolder: 'Select a Maven goal to run'
      });
      if (selected) {
        const task = tasks.find(t => t.name === selected);
        if (task) {
          await vscode.tasks.executeTask(task);
        }
      }
    } else {
      vscode.window.showInformationMessage('No Maven goals found');
    }
  });

  // Register task providers
  registerTaskProviders(context);

  // Register debug adapter
  const debugAdapterFactory = new GroovyDebugAdapterDescriptorFactory();
  const debugConfigProvider = new GroovyDebugConfigurationProvider();
  
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('groovy', debugAdapterFactory),
    vscode.debug.registerDebugConfigurationProvider('groovy', debugConfigProvider)
  );

  startLanguageServer();
}

export function deactivate() {
  extensionContext = null;
}

function startLanguageServer() {
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window },
    (progress) => {
      return new Promise<void>(async (resolve, reject) => {
        if (!extensionContext) {
          //something very bad happened!
          resolve();
          vscode.window.showErrorMessage(STARTUP_ERROR);
          return;
        }
        if (!javaPath) {
          resolve();
          let settingsJavaHome = vscode.workspace
            .getConfiguration("groovy")
            .get("java.home") as string;
          if (settingsJavaHome) {
            vscode.window.showErrorMessage(INVALID_JAVA_ERROR);
          } else {
            vscode.window.showErrorMessage(MISSING_JAVA_ERROR);
          }
          return;
        }
        progress.report({ message: INITIALIZING_MESSAGE });
        
        // Debug: Log computed classpath
        const computedClasspath = getComputedClasspath();
        console.log("Computed classpath:", computedClasspath);
        
        let clientOptions: LanguageClientOptions = {
          documentSelector: [{ scheme: "file", language: "groovy" }],
          synchronize: {
            configurationSection: "groovy",
          },
          initializationOptions: {},
          middleware: {
            workspace: {
              configuration: async (params, token, next) => {
                console.log("Configuration request from language server:", JSON.stringify(params));
                const result = await next(params, token);
                console.log("Original configuration result:", JSON.stringify(result));
                
                if (Array.isArray(result)) {
                  for (let i = 0; i < result.length; i++) {
                    if (params.items[i].section === "groovy") {
                      // Inject computed classpath into the configuration
                      const computed = getComputedClasspath();
                      console.log("Computed classpath from Gradle:", computed);
                      
                      // Get Gradle info directly, not from computed string
                      const gradleInfo = getCachedGradleInfo();
                      if (gradleInfo && gradleInfo.classpath) {
                        // Ensure result[i] exists
                        if (!result[i]) {
                          result[i] = {};
                        }
                        
                        // Get user classpath (if any)
                        const userClasspath = result[i].classpath || [];
                        
                        // Merge arrays directly
                        const mergedClasspath = [...userClasspath, ...gradleInfo.classpath];
                        result[i].classpath = mergedClasspath;
                        
                        console.log("User classpath entries:", userClasspath.length);
                        console.log("Gradle classpath entries:", gradleInfo.classpath.length);
                        console.log("Merged classpath count:", mergedClasspath.length);
                        console.log("Sample classpath entries:", mergedClasspath.slice(0, 3));
                      } else {
                        console.log("No Gradle classpath available");
                      }
                    }
                  }
                }
                return result;
              }
            }
          },
          uriConverters: {
            code2Protocol: (value: vscode.Uri) => {
              if (/^win32/.test(process.platform)) {
                //drive letters on Windows are encoded with %3A instead of :
                //but Java doesn't treat them the same
                return value.toString().replace("%3A", ":");
              } else {
                return value.toString();
              }
            },
            //this is just the default behavior, but we need to define both
            protocol2Code: (value) => vscode.Uri.parse(value),
          },
        };
        let args = [
          "-jar",
          path.resolve(
            extensionContext.extensionPath,
            "bin",
            "groovy-language-server-all.jar"
          ),
        ];
        //uncomment to allow a debugger to attach to the language server
        //args.unshift("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005,quiet=y");
        
        // Enable debug logging for troubleshooting
        args.unshift("-Dgroovyls.debug=true");
        let executable: Executable = {
          command: javaPath,
          args: args,
          options: {
            env: {
              ...process.env,
              GROOVY_LS_DEBUG: "true"
            }
          }
        };
        languageClient = new LanguageClient(
          "groovy",
          "Groovy Language Server",
          executable,
          clientOptions
        );
        try {
          await languageClient.start();
          
          // Send classpath configuration after client is ready
          const gradleInfo = getCachedGradleInfo();
          if (gradleInfo && gradleInfo.classpath && gradleInfo.classpath.length > 0) {
            console.log("Sending Gradle classpath to language server:", gradleInfo.classpath.length, "entries");
            // Send configuration change notification
            languageClient.sendNotification("workspace/didChangeConfiguration", {
              settings: {
                groovy: {
                  classpath: gradleInfo.classpath
                }
              }
            });
          }
        } catch (e) {
          resolve();
          vscode.window.showErrorMessage(STARTUP_ERROR);
          return;
        }
        resolve();
      });
    }
  );
}
