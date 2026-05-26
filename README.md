# Chordwiki-AutoScroller

## 概要

Chordwiki-AutoScrollerは、[ChordWiki](https://ja.chordwiki.org/wiki/)の楽譜ページで自動スクロール機能を提供する Chrome 拡張です。手動スクロールやホイール操作と自動スクロールの両立、スムーズな再生体験を実現します。

**対応ブラウザ:** **Google Chrome を推奨**します。Microsoft Edge（Chrome ウェブストア経由のインストール）ではページ側の機能が動作しない場合があります（未保証）。

## 主な機能

- ChordWiki楽譜ページでの自動スクロール
- 手動スクロール時は自動スクロールを一時停止し、即時同期
- ホイール操作でスクロール速度を調整
- ページ内に操作パネルを表示（速度調整・開始/停止）
- 楽曲の再生時間を自動取得（**iTunes** → **MusicBrainz** の順で参照）

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

バージョン番号の**唯一のソースは `manifest.json` の `version`**です。ポップアップ表示と MusicBrainz 向け User-Agent は実行時に `chrome.runtime.getManifest().version` を参照するため、`background.js` / `popup.html` に固定で書いておく必要はありません。

## 使い方

1. Chrome拡張としてインストール
2. ChordWikiの楽譜ページを開くと自動でパネルが表示されます
3. パネルで自動スクロールの開始/停止や速度調整が可能
4. 手動でスクロールした場合は自動スクロールが一時停止し、260ms後に再開

## バージョン番号（ストア公開）

- Chrome ウェブストアの公開版は **`1.0.8` → 次回 `1.0.9`** のように、**ユーザー向けは必要最小限の patch 番号だけ上げる**運用を推奨します。
- 開発中にローカルだけ `1.0.10` … と進めても、ストア提出時は **`manifest.json` の `version` を公開版に合わせてまとめる**（今回の互換修正はすべて `1.0.9` に集約）。
- 変更内容は [CHANGELOG.md](./CHANGELOG.md) に記載します。

## 注意事項

- コードやUIの詳細は今後変更される可能性があります。

## ライセンス

MIT License
