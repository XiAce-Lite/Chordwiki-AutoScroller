# Chordwiki-AutoScroller

## 概要

Chordwiki-AutoScrollerは、[ChordWiki](https://ja.chordwiki.org/wiki/)の楽譜ページで自動スクロール機能を提供するChrome拡張です。手動スクロールやホイール操作と自動スクロールの両立、スムーズな再生体験を実現します。

## 主な機能

- ChordWiki楽譜ページでの自動スクロール
- 手動スクロール時は自動スクロールを一時停止し、即時同期
- ホイール操作でスクロール速度を調整
- ページ内に操作パネルを表示（速度調整・開始/停止）
- 楽曲の再生時間を自動取得（MusicBrainz/itunes連携）

## manifest.json（ローカルのみ）

リポジトリには **`manifest.example.json`** を置き、実際の **`manifest.json` は Git に含めません**（`.gitignore`）。公開したくない **Chrome 拡張の `key` などは `manifest.json` にだけ書いてください**。

### 初回セットアップ（クローン後）

1. `manifest.example.json` を `manifest.json` にコピーする。
2. 必要なら `manifest.json` に `key` を追加する。

### `manifest.example.json` を更新したいとき（Key 以外を Push したい）

ローカルで編集した **`manifest.json` を正とし**、`key` フィールドだけを除いた内容でテンプレを上書きします。

```bash
node scripts/sync-manifest-example.js
```

その後、`manifest.example.json` をコミットしてください。バージョン自動 bump の pre-commit でも同様に `manifest.example.json` が更新されます。

## 使い方

1. Chrome拡張としてインストール
2. ChordWikiの楽譜ページを開くと自動でパネルが表示されます
3. パネルで自動スクロールの開始/停止や速度調整が可能
4. 手動でスクロールした場合は自動スクロールが一時停止し、260ms後に再開

## 注意事項

- コードやUIの詳細は今後変更される可能性があります。

## ライセンス

MIT License
