# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code)へのガイダンスを提供します。

## リポジトリについて

このリポジトリは[Groovy Language Server](https://github.com/prominic/groovy-language-server)のフォークで、VSCode拡張機能の強化に特化しています。オリジナルのサンプル実装を基に、実用的なVSCode拡張機能として機能を拡張することを目的としています。
`char5742/groovy-language-server`

## ビルドコマンド

VSCode拡張機能のビルド:
```sh
./gradlew build
```

拡張機能は`build/`フォルダに.vsixファイルとして作成されます。

## アーキテクチャ概要

これはGroovy Language Server用のVisual Studio Code拡張機能です。拡張機能のアーキテクチャは以下で構成されています：

1. **Language Client** (`src/main/ts/extension.ts`): メインの拡張機能エントリーポイントで以下を行います：
   - Groovy Language Serverプロセスの起動と管理
   - `findJava.ts`を使用したJavaランタイムの検出
   - 設定変更とサーバー再起動の管理
   - Language Server Protocolを使用した言語サーバーとの通信

2. **ビルドシステム**: NodeプラグインでGradleを使用して以下を実行：
   - 親プロジェクトから言語サーバーJARをコピー (`../build/libs/groovy-language-server-all.jar`)
   - webpackでTypeScriptコードをバンドル
   - vsceを使用してVSIXとしてパッケージ化

3. **主要な依存関係**:
   - 拡張機能は親ディレクトリでビルドされたgroovy-language-server JARに依存
   - 言語サーバーの実行にJavaランタイムが必要
   - LSP通信にvscode-languageclientを使用

## 開発メモ

- この拡張機能はVS Code Marketplaceへのリリースを意図していないサンプル実装です
- 言語サーバーJARパス: `bin/groovy-language-server-all.jar` (ビルド時にコピー)
- `groovy.java.home`と`groovy.classpath`の設定をサポート
- `.groovy`ファイルで有効化
- 言語サーバーのデバッグは`extension.ts:145`のデバッグ引数のコメントを外してください