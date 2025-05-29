import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient } from 'vscode-languageclient/node';

suite('Language Server Test Suite', () => {
    let client: LanguageClient | undefined;

    suiteSetup(async () => {
        // 拡張機能がアクティベートされるのを待つ
        const ext = vscode.extensions.getExtension('publisher.groovy');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        
        // Language Clientの取得（拡張機能のexportsから）
        if (ext && ext.exports && ext.exports.languageClient) {
            client = ext.exports.languageClient;
        }
    });

    test('Language Server should start', async function() {
        // モック環境では実際の言語サーバーは起動しないため、このテストはスキップ
        if (process.env.NODE_ENV === 'test' && !client) {
            this.skip();
            return;
        }
        
        // Groovyファイルを開いて言語サーバーを起動
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: 'class TestClass { }'
        });
        
        await vscode.window.showTextDocument(doc);
        
        // 少し待機して言語サーバーの起動を確認
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        assert.ok(client, 'Language client should be initialized');
    });

    test('Completion should work', async function() {
        this.timeout(10000); // タイムアウトを10秒に設定
        
        const content = `class TestClass {
    def testMethod() {
        prin
    }
}`;
        
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: content
        });
        
        const editor = await vscode.window.showTextDocument(doc);
        
        // カーソルを "prin" の後に移動
        const position = new vscode.Position(2, 12);
        editor.selection = new vscode.Selection(position, position);
        
        // 補完の実行
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            position
        );
        
        assert.ok(completions, 'Completions should be provided');
        assert.ok(completions.items.length > 0, 'Should have completion items');
        
        // printlnが補完候補に含まれているか確認
        const printlnCompletion = completions.items.find(item => 
            item.label === 'println' || 
            (typeof item.label === 'object' && item.label.label === 'println')
        );
        assert.ok(printlnCompletion, 'println should be in completion items');
    });

    test('Hover should provide information', async function() {
        this.timeout(10000);
        
        const content = `class TestClass {
    String message = "Hello"
}`;
        
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: content
        });
        
        await vscode.window.showTextDocument(doc);
        
        // "String" の上でホバー
        const position = new vscode.Position(1, 4);
        
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            doc.uri,
            position
        );
        
        assert.ok(hovers, 'Hover information should be provided');
        assert.ok(hovers.length > 0, 'Should have hover information');
    });

    test('Definition provider should work', async function() {
        this.timeout(10000);
        
        const content = `class TestClass {
    def myMethod() {
        return "test"
    }
    
    def callMethod() {
        myMethod()
    }
}`;
        
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: content
        });
        
        await vscode.window.showTextDocument(doc);
        
        // myMethod() の呼び出し位置
        const position = new vscode.Position(6, 8);
        
        const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            doc.uri,
            position
        );
        
        assert.ok(definitions, 'Definitions should be provided');
        assert.ok(definitions.length > 0, 'Should find definition');
    });

    test('Document symbols should be provided', async function() {
        this.timeout(10000);
        
        const content = `class TestClass {
    String field1
    int field2
    
    def method1() {
        // method implementation
    }
    
    void method2(String param) {
        // another method
    }
}`;
        
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: content
        });
        
        await vscode.window.showTextDocument(doc);
        
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            doc.uri
        );
        
        assert.ok(symbols, 'Document symbols should be provided');
        assert.ok(symbols.length > 0, 'Should have symbols');
        
        // クラスシンボルの確認
        const classSymbol = symbols.find(s => s.name === 'TestClass');
        assert.ok(classSymbol, 'Should find TestClass symbol');
        assert.strictEqual(classSymbol.kind, vscode.SymbolKind.Class);
    });
});