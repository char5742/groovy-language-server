import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // 拡張機能の開発パス
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

        // テストの実行パス
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // テストワークスペース
        const testWorkspace = path.resolve(__dirname, '../../../test-workspace');

        // headlessモードの設定
        const launchArgs = [
            '--disable-extensions',
            '--disable-gpu',
            testWorkspace
        ];

        // 環境変数でheadlessモードを検出
        if (process.env.VSCODE_CLI || process.env.CI) {
            launchArgs.push('--no-sandbox');
            launchArgs.push('--disable-dev-shm-usage');
        }

        console.log('Extension Development Path:', extensionDevelopmentPath);
        console.log('Extension Tests Path:', extensionTestsPath);
        console.log('Launch Arguments:', launchArgs);

        // VS Code のダウンロードとテストの実行
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs,
            // テストに使用するVS Codeのバージョン（省略時は最新の安定版）
            version: 'stable'
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();