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
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

let outputChannel: vscode.OutputChannel | null = null;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Groovy Gradle");
  }
  return outputChannel;
}

export interface GradleInfo {
  javaHome?: string;
  classpath?: string[];
}

export async function getGradleInfo(workspaceFolder: vscode.WorkspaceFolder): Promise<GradleInfo | null> {
  const channel = getOutputChannel();
  const gradleWrapper = path.join(workspaceFolder.uri.fsPath, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  const buildGradle = path.join(workspaceFolder.uri.fsPath, "build.gradle");
  const buildGradleKts = path.join(workspaceFolder.uri.fsPath, "build.gradle.kts");
  
  channel.appendLine(`Checking for Gradle in: ${workspaceFolder.uri.fsPath}`);
  channel.appendLine(`Gradle wrapper exists: ${fs.existsSync(gradleWrapper)}`);
  channel.appendLine(`build.gradle exists: ${fs.existsSync(buildGradle)}`);
  channel.appendLine(`build.gradle.kts exists: ${fs.existsSync(buildGradleKts)}`);
  
  if (!fs.existsSync(gradleWrapper) && !fs.existsSync(buildGradle) && !fs.existsSync(buildGradleKts)) {
    channel.appendLine("No Gradle project found");
    return null;
  }

  try {
    // First, let's try a simple test to see if Gradle works at all
    channel.appendLine("Testing basic Gradle functionality...");
    const gradleCommand = fs.existsSync(gradleWrapper) ? gradleWrapper : "gradle";
    
    try {
      const testOutput = execSync(`"${gradleCommand}" --version`, {
        cwd: workspaceFolder.uri.fsPath,
        encoding: "utf-8",
      });
      channel.appendLine("Gradle version output:");
      channel.appendLine(testOutput);
    } catch (testError) {
      channel.appendLine(`Failed to run gradle --version: ${testError}`);
    }

    // Create a temporary Gradle task to get classpath and Java home
    const initScript = `
allprojects {
  task groovyLSInfo {
    doLast {
      println "GROOVY_LS_DEBUG: Starting task"
      println "GROOVY_LS_DEBUG: Project name: " + project.name
      println "GROOVY_LS_DEBUG: Java home: " + System.getProperty('java.home')
      
      def classpath = []
      
      // Try to get configurations
      println "GROOVY_LS_DEBUG: Available configurations:"
      configurations.each { config ->
        println "GROOVY_LS_DEBUG:   - " + config.name
      }
      
      configurations.findAll { 
        it.name in ['compileClasspath', 'runtimeClasspath', 'testCompileClasspath', 'testRuntimeClasspath']
      }.each { config ->
        try {
          println "GROOVY_LS_DEBUG: Processing configuration: " + config.name
          config.files.each { file ->
            classpath.add(file.absolutePath)
          }
        } catch (Exception e) {
          println "GROOVY_LS_DEBUG: Error processing " + config.name + ": " + e.message
        }
      }
      
      
      // Add JAR files from build/libs
      def libsDir = new File(project.buildDir, 'libs')
      if (libsDir.exists() && libsDir.isDirectory()) {
        println "GROOVY_LS_DEBUG: Scanning libs directory: " + libsDir.absolutePath
        libsDir.listFiles().findAll { it.name.endsWith('.jar') }.each { jarFile ->
          println "GROOVY_LS_DEBUG: Adding JAR: " + jarFile.name
          classpath.add(jarFile.absolutePath)
        }
      }
      
      println "GROOVY_LS_CLASSPATH_START"
      classpath.unique().each { println it }
      println "GROOVY_LS_CLASSPATH_END"
      println "GROOVY_LS_JAVA_HOME:" + System.getProperty('java.home')
      println "GROOVY_LS_DEBUG: Task completed"
    }
  }
}
`;

    const tempInitFile = path.join(workspaceFolder.uri.fsPath, ".groovy-ls-init.gradle");
    fs.writeFileSync(tempInitFile, initScript);
    channel.appendLine(`Created init script: ${tempInitFile}`);

    try {
      // Remove -q flag to see all output for debugging
      channel.appendLine(`Running Gradle command: ${gradleCommand} --init-script "${tempInitFile}" groovyLSInfo`);
      
      const output = execSync(`"${gradleCommand}" --init-script "${tempInitFile}" groovyLSInfo`, {
        cwd: workspaceFolder.uri.fsPath,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      channel.appendLine("Gradle output:");
      channel.appendLine(output);

      const lines = output.split("\n");
      let inClasspath = false;
      const classpath: string[] = [];
      let javaHome: string | undefined;

      for (const line of lines) {
        if (line.trim() === "GROOVY_LS_CLASSPATH_START") {
          inClasspath = true;
        } else if (line.trim() === "GROOVY_LS_CLASSPATH_END") {
          inClasspath = false;
        } else if (inClasspath && line.trim()) {
          classpath.push(line.trim());
        } else if (line.startsWith("GROOVY_LS_JAVA_HOME:")) {
          javaHome = line.substring("GROOVY_LS_JAVA_HOME:".length).trim();
        }
      }

      channel.appendLine(`Found Java home: ${javaHome}`);
      channel.appendLine(`Found classpath entries: ${classpath.length}`);
      if (classpath.length > 0) {
        channel.appendLine("Classpath:");
        classpath.forEach(cp => channel.appendLine(`  - ${cp}`));
      }

      return {
        javaHome,
        classpath: classpath.length > 0 ? classpath : undefined,
      };
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempInitFile)) {
        fs.unlinkSync(tempInitFile);
      }
    }
  } catch (error) {
    channel.appendLine(`Error getting Gradle info: ${error}`);
    channel.show();
    return null;
  }
}

let cachedGradleInfo: GradleInfo | null = null;

export async function detectGradleSettings(): Promise<GradleInfo | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  for (const folder of workspaceFolders) {
    const gradleInfo = await getGradleInfo(folder);
    if (gradleInfo) {
      cachedGradleInfo = gradleInfo;
      return gradleInfo;
    }
  }
  
  return null;
}

export function getCachedGradleInfo(): GradleInfo | null {
  return cachedGradleInfo;
}

export function getComputedClasspath(): string | undefined {
  const channel = getOutputChannel();
  
  // First check if user has explicitly set classpath in settings
  const config = vscode.workspace.getConfiguration("groovy");
  const userClasspath = config.get<string>("classpath");
  
  channel.appendLine(`User classpath from settings: ${userClasspath || "none"}`);
  channel.appendLine(`Cached Gradle classpath entries: ${cachedGradleInfo?.classpath?.length || 0}`);
  
  if (userClasspath) {
    // If user has set classpath explicitly, merge with Gradle classpath
    const gradleClasspath = cachedGradleInfo?.classpath?.join(path.delimiter) || "";
    const merged = gradleClasspath ? `${userClasspath}${path.delimiter}${gradleClasspath}` : userClasspath;
    channel.appendLine(`Merged classpath: ${merged}`);
    return merged;
  }
  
  // Otherwise, use only Gradle classpath
  const gradleOnly = cachedGradleInfo?.classpath?.join(path.delimiter);
  channel.appendLine(`Using Gradle-only classpath: ${gradleOnly || "none"}`);
  return gradleOnly;
}

export function getComputedJavaHome(): string | undefined {
  // First check if user has explicitly set Java home in settings
  const config = vscode.workspace.getConfiguration("groovy");
  const userJavaHome = config.get<string>("java.home");
  
  // User setting takes precedence
  return userJavaHome || cachedGradleInfo?.javaHome;
}