# VSCode拡張機能のテスト環境

このディレクトリには、VSCode拡張機能のheadlessテスト環境が整備されています。

## テスト環境の構成

- **test-config.jsonc**: テスト設定ファイル（JSONCフォーマット）
- **テストスイート**: 
  - `src/test/suite/extension.test.ts`: 拡張機能の基本機能テスト
  - `src/test/suite/languageServer.test.ts`: 言語サーバー機能のテスト

## テストの実行方法

### 1. 依存関係のインストール
```bash
npm install
```

### 2. TypeScriptのコンパイル
```bash
npm run test-compile
```

### 3. テストの実行

#### モック環境でのテスト（推奨）
```bash
npm run test:mock
```
- VSCodeの実際のインスタンスを起動せずにテストを実行
- CI/CD環境での実行に適している
- 高速で安定した実行が可能

#### VS Code環境でのテスト
```bash
npm run test:headless
```
- 実際のVS Codeインスタンスを使用してテストを実行
- 完全な統合テストが可能
- 注意: Linux環境では追加の依存関係（libnss3など）が必要

### 4. 個別のテストスイートの実行
環境変数`TEST_FILE_PATTERN`を使用して特定のテストファイルのみ実行：
```bash
TEST_FILE_PATTERN="**/extension.test.js" npm run test:mock
```

## テストの追加方法

1. `src/test/suite/`ディレクトリに新しいテストファイルを作成
2. ファイル名は`*.test.ts`の形式にする
3. Mochaのtdd形式でテストを記述：

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Test Suite', () => {
    test('My test case', async () => {
        // テストコード
        assert.ok(true);
    });
});
```

## トラブルシューティング

### "libnss3.so: cannot open shared object file"エラー
Linux環境でheadlessテストを実行する際に発生する場合があります。
以下のパッケージをインストールしてください：
```bash
sudo apt-get install libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1
```

### テストがタイムアウトする
`test-config.jsonc`の`testOptions.timeout`を増やすか、個別のテストで`this.timeout()`を使用：
```typescript
test('Long running test', async function() {
    this.timeout(10000); // 10秒のタイムアウト
    // テストコード
});
```