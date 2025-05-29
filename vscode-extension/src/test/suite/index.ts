import * as path from 'path';
import * as Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    // Mochaテストランナーを作成
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 60000,
        retries: 2
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise(async (resolve, reject) => {
        try {
            // テストファイルのパターン
            const testFilePattern = process.env.TEST_FILE_PATTERN || '**/**.test.js';
            
            // glob v10の新しいAPIを使用
            const files = await glob(testFilePattern, { cwd: testsRoot });

            // テストファイルをMochaに追加
            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            // テストを実行
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}