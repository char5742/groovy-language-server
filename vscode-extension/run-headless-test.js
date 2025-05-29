const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// テスト設定ファイルの読み込み
const configPath = path.join(__dirname, 'tests', 'test-config.jsonc');
const configContent = fs.readFileSync(configPath, 'utf8');

// JSONCのコメントを削除
const jsonContent = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const config = JSON.parse(jsonContent);

// テストオプションの取得
const testOptions = config.testOptions || {};

// コマンドライン引数の処理
const args = process.argv.slice(2);
const testConfig = args.includes('--language-server') ? 
  config.configurations.find(c => c.name === 'Language Server Tests') :
  config.configurations.find(c => c.name === 'Extension Tests');

if (!testConfig) {
  console.error('Test configuration not found');
  process.exit(1);
}

// 環境変数の設定
const env = {
  ...process.env,
  ...testConfig.env,
  MOCHA_TIMEOUT: testOptions.timeout || 60000,
  MOCHA_RETRIES: testOptions.retries || 2,
  MOCHA_REPORTER: testOptions.reporter || 'spec'
};

// headlessモードの環境変数を追加
env.ELECTRON_RUN_AS_NODE = '1';
env.VSCODE_CLI = '1';
env.VSCODE_PORTABLE = __dirname;

console.log('Running headless tests...');
console.log(`Configuration: ${testConfig.name}`);
console.log(`Test path: ${testConfig.args.find(arg => arg.includes('extensionTestsPath'))}`);

// テストプロセスの起動
const testProcess = spawn('node', ['./out/test/runTest.js'], {
  env,
  stdio: 'inherit',
  cwd: __dirname
});

testProcess.on('close', (code) => {
  console.log(`Test process exited with code ${code}`);
  process.exit(code);
});

testProcess.on('error', (err) => {
  console.error('Failed to start test process:', err);
  process.exit(1);
});