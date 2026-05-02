# Chordwiki-AutoScroller

## 概要

Chordwiki-AutoScrollerは、[ChordWiki](https://ja.chordwiki.org/wiki/)の楽譜ページで自動スクロール機能を提供するChrome拡張です。手動スクロールやホイール操作と自動スクロールの両立、スムーズな再生体験を実現します。

## 主な機能

- ChordWiki楽譜ページでの自動スクロール
- 手動スクロール時は自動スクロールを一時停止し、即時同期
- ホイール操作でスクロール速度を調整
- ページ内に操作パネルを表示（速度調整・開始/停止）
- 楽曲の再生時間を自動取得（MusicBrainz/itunes連携）

## 使い方

1. Chrome拡張としてインストール
2. ChordWikiの楽譜ページを開くと自動でパネルが表示されます
3. パネルで自動スクロールの開始/停止や速度調整が可能
4. 手動でスクロールした場合は自動スクロールが一時停止し、260ms後に再開

## ファイル構成

- `manifest.json` : 拡張の定義ファイル（MV3対応）
- `content.js` : 自動スクロール本体・UI・手動/自動判定・duration取得
- `background.js` : duration API, メッセージリレー, UIトグル
- `popup.html`/`popup.js` : 速度・開始/停止UI（現状未接続）
- `options.html`/`options.js` : デバッグ用（URL表示ON/OFF）
- `styles.css` : UI/オプション/ポップアップ用スタイル
- `icons/` : 拡張アイコン

## 権限

- `ja.chordwiki.org/wiki/*` : ChordWiki楽譜ページへのアクセス
- `musicbrainz`, `itunes` : 楽曲情報取得用API

## ドメイン方針

- 対象ドメインは `ja.chordwiki.org` のみ
- ツールバーのアクションクリックは、ページ内のSong Controls表示/非表示トグル専用

## バージョン運用

- 形式は `Major.Minor.Revision`（各桁 `0..99`）
- コード変更を含むコミット時のみインクリメント（空コミット・ドキュメントのみ更新は対象外）
- 基本は `Revision +1`
- 単純繰り上がり: `Revision` が `99` の次は `Minor +1, Revision=0`、`Minor` が `99` の次は `Major +1, Minor=0, Revision=0`
- 上限は `99.99.99`（到達時はエラーで停止）
- `manifest.json` の `version` と `background.js` の User-Agentバージョンは常に同期

### 運用コマンド

- `node scripts/version-sync.js check` : 同期確認
- `node scripts/version-sync.js sync` : `manifest.json` に合わせて User-Agentを同期
- `node scripts/version-sync.js bump` : 単純繰り上がりでインクリメントし同期

### pre-commit 自動化（任意）

- `git config core.hooksPath .githooks`
- 以後、コード変更がステージされているコミット時のみ自動で `bump` 実行

## 注意事項

- popup/optionsは現状未接続またはデバッグ用です。オートスクロール機能自体には不要です。
- 参照実装（chordwiki_personal）の挙動を忠実に再現しています。
- コードやUIの詳細は今後変更される可能性があります。

## 開発・デバッグ

- `content.js`が自動スクロールの本体です。挙動の調整は主にこのファイルで行います。
- `background.js`はduration取得やUIトグル等の補助ロジックです。
- manifestやpopup/optionsの整理は任意です。

## ライセンス

MIT License
