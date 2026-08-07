# 阪大シャトル検索

大阪大学の豊中・箕面・吹田キャンパス間を走る学内連絡バスを、スマートフォンから検索する静的Webアプリです。

## 実装済み

- 現在時刻から次便を表示
- 出発時刻・到着時刻検索
- 豊中―吹田の直行便絞り込み
- 往復検索と滞在時間指定
- 運休日・土日祝日・最終便後の次運行日繰り越し
- 吹田キャンパスの乗降停留所指定
- 2026年度通常時刻表の方向別表示
- 位置情報を端末内で処理した最寄りキャンパス推定
- 最近使ったルートと保存ルート（`localStorage`）

## 対象外

- 購入・予約機能（学内連絡バスは無料）
- 混雑予測
- 車両位置・遅延・満席のリアルタイム反映
- ブラウザ通知

## データ正本

- [大阪大学 学内連絡バス](https://www.osaka-u.ac.jp/ja/access/bus)
- [2026年度 学内連絡バスの運休日](https://www.osaka-u.ac.jp/ja/access/files/2026bus/HP_r8bus_unkyuu.pdf/@@download/file)

通常ダイヤは2026年4月1日改正時刻表を転記しています。道路・気象状況等による当日の変更は、大学のKOAN掲示および公式案内を確認してください。

## PRをWebページとして確認する

PRごとの静的プレビューをGitHub Pagesへ自動配置します。

- PR #1のプレビュー: `https://naoshi-git.github.io/kon-lab/pr-preview/pr-1/`
- 一般形: `https://naoshi-git.github.io/kon-lab/pr-preview/pr-<PR番号>/`

`.github/workflows/pr-pages-preview.yml` が、PRの作成・更新時に次の処理を行います。

1. JavaScript構文チェックと検索エンジンのテスト
2. `campus-bus/` を `gh-pages/pr-preview/pr-<番号>/` へ配置
3. GitHub Pagesの再ビルドを要求
4. PRのDeployment URLとしてプレビューURLを表示
5. PRを閉じたときに該当プレビューを削除

### 初回のみ必要なリポジトリ設定

GitHubの `Settings > Pages` で以下を設定します。

- Source: `Deploy from a branch`
- Branch: `gh-pages`
- Folder: `/ (root)`

`gh-pages` ブランチは作成済みで、切り替え時点の本番ページ内容も複製済みです。本番は `.github/workflows/pages-production.yml` により、main更新時にPRプレビューを残したまま同期されます。

## ローカル確認

ES Modulesを使用するため、ファイルを直接開かずHTTPサーバーを使用します。

```bash
python -m http.server 8000
```

`http://localhost:8000/campus-bus/` を開きます。

## テスト

Node.js 20以降を推奨します。

```bash
node --test campus-bus/tests/search-engine.test.mjs
```
