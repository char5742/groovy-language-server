#!/usr/bin/env node

const Module = require('module');
const originalRequire = Module.prototype.require;

// requireをオーバーライドしてvscodeモジュールをモックする
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return require('./mock-vscode');
    }
    // vscode-languageclient関連もモック
    if (id === 'vscode-languageclient/node') {
        return {
            LanguageClient: class MockLanguageClient {}
        };
    }
    return originalRequire.apply(this, arguments);
};

const Mocha = require('mocha');
const path = require('path');
const glob = require('glob');

// テスト環境変数を設定
process.env.NODE_ENV = 'test';

// Mochaインスタンスを作成
const mocha = new Mocha({
    ui: 'tdd',
    timeout: 60000,
    color: true
});

// テストファイルを検索
const testRoot = path.join(__dirname, 'out', 'test');
const testFiles = glob.sync('**/**.test.js', { cwd: testRoot });

// テストファイルを追加
testFiles.forEach(file => {
    mocha.addFile(path.join(testRoot, file));
});

console.log('Running tests in mock environment...');
console.log(`Found ${testFiles.length} test files`);

// テストを実行
mocha.run(failures => {
    if (failures > 0) {
        console.error(`\n${failures} tests failed.`);
        process.exit(1);
    } else {
        console.log('\nAll tests passed!');
        process.exit(0);
    }
});