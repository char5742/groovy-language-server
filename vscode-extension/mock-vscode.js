// VSCodeのAPIをモックする
const EventEmitter = require('events');

class MockTextDocument {
    constructor(options = {}) {
        this.languageId = options.language || 'plaintext';
        this._content = options.content || '';
        this.uri = { 
            scheme: 'file', 
            path: '/mock/document.txt',
            toString: () => 'file:///mock/document.txt'
        };
    }

    getText() {
        return this._content;
    }
}

class MockPosition {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class MockSelection {
    constructor(anchor, active) {
        this.anchor = anchor;
        this.active = active;
    }
}

class MockTextEditor {
    constructor(document) {
        this.document = document;
        this.selection = new MockSelection(
            new MockPosition(0, 0),
            new MockPosition(0, 0)
        );
    }
}

class MockExtensionContext {
    constructor() {
        this.subscriptions = [];
        this.workspaceState = new Map();
        this.globalState = new Map();
        this.extensionPath = '/mock/extension';
    }
}

const vscode = {
    // 定数
    SymbolKind: {
        Class: 5,
        Method: 6,
        Property: 7,
        Field: 8,
        Function: 12
    },

    // イベント
    EventEmitter,

    // ウィンドウAPI
    window: {
        showInformationMessage: (message) => {
            console.log(`INFO: ${message}`);
            return Promise.resolve();
        },
        showErrorMessage: (message) => {
            console.error(`ERROR: ${message}`);
            return Promise.resolve();
        },
        showTextDocument: (doc) => {
            return Promise.resolve(new MockTextEditor(doc));
        }
    },

    // ワークスペースAPI  
    workspace: {
        getConfiguration: (section) => {
            const config = {
                get: (key) => {
                    if (section === 'groovy') {
                        if (key === 'java.home') return null;
                        if (key === 'classpath') return null;
                    }
                    return undefined;
                }
            };
            return config;
        },
        openTextDocument: (options) => {
            return Promise.resolve(new MockTextDocument(options));
        }
    },

    // 言語API
    languages: {
        getLanguages: () => Promise.resolve(['groovy', 'javascript', 'typescript']),
        registerCompletionItemProvider: () => ({ dispose: () => {} }),
        registerHoverProvider: () => ({ dispose: () => {} }),
        registerDefinitionProvider: () => ({ dispose: () => {} }),
        registerDocumentSymbolProvider: () => ({ dispose: () => {} })
    },

    // 拡張機能API
    extensions: {
        getExtension: (id) => {
            if (id === 'publisher.groovy') {
                return {
                    id: 'publisher.groovy',
                    extensionPath: '/mock/extension',
                    isActive: false,
                    exports: {},
                    activate: function() {
                        this.isActive = true;
                        return Promise.resolve();
                    }
                };
            }
            return undefined;
        }
    },

    // コマンドAPI
    commands: {
        getCommands: () => Promise.resolve([
            'groovy.restartServer',
            'groovy.refreshGradleSettings', 
            'groovy.gradle.refresh',
            'groovy.gradle.runTask',
            'groovy.maven.refresh',
            'groovy.maven.runGoal'
        ]),
        executeCommand: (command, ...args) => {
            console.log(`Executing command: ${command}`);
            if (command === 'vscode.executeCompletionItemProvider') {
                return Promise.resolve({ 
                    items: [{ label: 'println', kind: 3 }] 
                });
            }
            if (command === 'vscode.executeHoverProvider') {
                return Promise.resolve([{
                    contents: ['Hover information']
                }]);
            }
            if (command === 'vscode.executeDefinitionProvider') {
                return Promise.resolve([{
                    uri: { toString: () => 'file:///mock/definition.txt' },
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
                }]);
            }
            if (command === 'vscode.executeDocumentSymbolProvider') {
                return Promise.resolve([{
                    name: 'TestClass',
                    kind: 5,
                    range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } }
                }]);
            }
            return Promise.resolve();
        }
    },

    // クラス
    Position: MockPosition,
    Selection: MockSelection,
    ExtensionContext: MockExtensionContext,

    // その他
    Uri: {
        file: (path) => ({ scheme: 'file', path, toString: () => `file://${path}` })
    }
};

// グローバルに登録
global.vscode = vscode;

module.exports = vscode;