# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に近づけています。

## [1.0.9] - 2026-05-25

### 修正

- 一部の環境で manifest の静的 `content_scripts` だけではページに接続されない問題に対し、`scripting` API による動的登録とフォールバック注入を追加
- ポップアップを開いたとき（`activeTab`）に ChordWiki タブへ content script を接続する処理を追加
- 拡張の ON/OFF 設定がページ側とずれる場合がある問題を修正（`storage` 同期・ポップアップ表示時の同期）
- 初回利用時に操作パネル・マーカーが非表示のままになることがある問題を修正（未設定時は UI を表示）
- 楽譜エリアのクリックで開始／停止が効かない、または一瞬だけ動いて止まる問題を修正（イベントリスナーの二重登録）

### 変更

- ページ注入は manifest 静的登録に加え、`https://ja.chordwiki.org/*` への動的登録に一本化（権限に `scripting` を追加）

## [1.0.8] - （Chrome ウェブストア公開版）

- 公開時点のベースライン
