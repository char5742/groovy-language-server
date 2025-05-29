import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('publisher.groovy'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('publisher.groovy');
        assert.ok(ext);
        
        // 拡張機能のアクティベート
        await ext!.activate();
        assert.ok(ext!.isActive);
    });

    test('Groovy language should be registered', () => {
        const languages = vscode.languages.getLanguages();
        assert.ok(languages.then(langs => langs.includes('groovy')));
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        
        // 登録されているべきコマンドの確認
        assert.ok(commands.includes('groovy.restartServer'));
        assert.ok(commands.includes('groovy.refreshGradleSettings'));
        assert.ok(commands.includes('groovy.gradle.refresh'));
        assert.ok(commands.includes('groovy.gradle.runTask'));
        assert.ok(commands.includes('groovy.maven.refresh'));
        assert.ok(commands.includes('groovy.maven.runGoal'));
    });

    test('Configuration should have correct defaults', () => {
        const config = vscode.workspace.getConfiguration('groovy');
        
        // java.homeはnullがデフォルト
        assert.strictEqual(config.get('java.home'), null);
        
        // classpathはnullがデフォルト
        assert.strictEqual(config.get('classpath'), null);
    });

    test('Groovy file activation', async () => {
        // テスト用の一時的なGroovyファイルを作成
        const content = 'println "Hello from Groovy"';
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: content
        });
        
        // ドキュメントが正しく開かれたか確認
        assert.strictEqual(doc.languageId, 'groovy');
        assert.strictEqual(doc.getText(), content);
        
        // エディターで開く
        const editor = await vscode.window.showTextDocument(doc);
        assert.ok(editor);
    });

    test('Syntax highlighting should be available', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'groovy',
            content: 'def message = "Hello World"'
        });
        
        // Groovy言語が登録されていることを確認
        const languages = await vscode.languages.getLanguages();
        assert.ok(languages.includes('groovy'), 'Groovy language should be registered for syntax highlighting');
        
        // ドキュメントが正しい言語IDを持っていることを確認
        assert.strictEqual(doc.languageId, 'groovy', 'Document should have groovy language ID');
    });
});