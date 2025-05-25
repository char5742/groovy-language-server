# Groovy Language Server VSCode拡張機能

このリポジトリは[Groovy Language Server](https://github.com/prominic/groovy-language-server)のフォークで、**VSCode拡張機能の開発と強化**に特化しています。

## 概要

オリジナルのGroovy Language Serverプロジェクトがサンプル実装として提供していたVSCode拡張機能を、実用的な開発ツールとして機能拡張することを目的としています。

## 主な特徴

- Groovy言語のシンタックスハイライト
- Language Server Protocolを使用したインテリジェントなコード補完
- エラー診断とコード解析
- Java環境の自動検出

## インストール方法

### 前提条件

- Java 8以上のランタイム
- Node.js 14以上
- Visual Studio Code

### ビルド

```sh
# リポジトリのクローン
git clone https://github.com/[your-username]/groovy-language-server.git
cd groovy-language-server/vscode-extension

# 拡張機能のビルド
./gradlew build
```

ビルドが完了すると、`build/`ディレクトリに`groovy-0.0.0.vsix`ファイルが生成されます。

### VSCodeへのインストール

1. VSCodeを開く
2. 拡張機能ビューを開く（Ctrl+Shift+X）
3. メニューから「VSIXからインストール...」を選択
4. ビルドした`.vsix`ファイルを選択

## 設定

拡張機能は以下の設定をサポートしています：

- `groovy.java.home`: JDKのパスを手動で指定（自動検出に失敗した場合）
- `groovy.classpath`: クラスパスに追加するエントリの配列

## 開発

このプロジェクトへの貢献を歓迎します！機能追加や改善のアイデアがある場合は、Issueを作成するかPull Requestを送信してください。

## ライセンス

Apache License 2.0 - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

### サードパーティライセンス

#### Groovy TextMate Grammar

このプロジェクトは、Microsoft VSCodeリポジトリから取得したGroovy TextMate文法ファイル（`syntaxes/groovy.tmLanguage.json`）を使用しています。

- **取得元**: https://github.com/microsoft/vscode/blob/main/extensions/groovy/syntaxes/groovy.tmLanguage.json
- **元のソース**: https://github.com/textmate/groovy.tmbundle/
- **ライセンス**: 以下の条件で使用が許可されています：
  - Permission to copy, use, modify, sell and distribute this software is granted
  - This software is provided "as is" without express or implied warranty

文法ファイルの改善や修正を提案する場合は、まず元のTextMateリポジトリ（https://github.com/textmate/groovy.tmbundle/）にPull Requestを送信することをお勧めします。