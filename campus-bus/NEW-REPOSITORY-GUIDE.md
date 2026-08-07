# 専用Public Repository 作成ガイド

## 推奨Repository名

### 第一候補: `handai-shuttle`

推奨理由:

- 短く、覚えやすい
- 現在のサービス名「阪大シャトル」と一致する
- `osaka-u-*` より「大学公式サービス」と誤認されにくい
- GitHub Pages URLも比較的短い

想定URL:

- Repository: `https://github.com/Naoshi-Git/handai-shuttle`
- GitHub Pages: `https://naoshi-git.github.io/handai-shuttle/`

GitHub上で同名Repositoryは、2026-08-07時点の検索では確認できていません。

### 代替候補

1. `handai-campus-bus`
   - 何のアプリか最も分かりやすい
   - 少し長い
2. `handai-shuttle-web`
   - Webアプリであることが明確
   - 将来PWA以外へ展開すると名前がやや限定的
3. `ou-campus-bus`
   - 短い
   - `OU` だけでは大阪大学と分かりにくい
4. `osaka-u-shuttle`
   - 英語圏でも意味が分かりやすい
   - 大学公式Repositoryのように見えやすいため、現状は第一候補にしない

## 推奨する作成設定

GitHubで `New repository` を開き、以下の設定にします。

- Owner: `Naoshi-Git`
- Repository name: `handai-shuttle`
- Description: `Unofficial Osaka University inter-campus shuttle timetable and route search web app.`
- Visibility: `Public`
- Add a README file: **OFF**
- Add .gitignore: **None**
- Choose a license: **None**（移行後にコードと時刻表データの扱いを分けて決める）

空Repositoryとして作る理由は、現在の `campus-bus/` 配下をそのままrootへ移しやすくし、初回commitの衝突を避けるためです。

## Repositoryを作成した直後にやること

Repository作成後、このChatで以下のように指示してください。

> `Naoshi-Git/handai-shuttle` をPublicで作成しました。現在の `kon-lab` の `campus-bus/` を正本として移行してください。

その後はこちらで以下を実施できます。

1. 現在の `campus-bus/` のファイルを新Repository rootへ移行
2. `README.md` を公開用に再構成
3. GitHub Pages用workflowを新Repository向けに変更
4. PR Preview URLを新Repository用へ変更
5. 公式時刻表・運休日・位置情報座標の出典整理
6. 「大阪大学公式サービスではない」旨のDisclaimer追加
7. デバッグフォームへの導線を維持
8. `kon-lab` 側から新サイトへのリンクへ切替
9. 新サイトでの実機確認後、旧Previewを整理

## GitHub Pages構成

専用RepositoryではアプリをRepository rootに配置するのが最も単純です。

```text
handai-shuttle/
├── index.html
├── manifest.webmanifest
├── style.css
├── ui-v2.css
├── ui-v3.css
├── data/
├── src/
├── tests/
└── README.md
```

アプリ内部は相対パスで構成しているため、`campus-bus/` という1階層を外してrootへ移しても、基本的にアプリコード自体の変更は不要です。

## Pages公開方針

現在の `kon-lab` では複数ツールと共存するため `gh-pages/pr-preview/...` を使用していますが、専用Repositoryでは構成を簡略化できます。

推奨:

- 本番: `main` → GitHub Pages
- 開発: Pull RequestごとにPreview
- mainへのmerge前にNodeテストと構文チェック

公開URLは最終的に次の形になります。

```text
https://naoshi-git.github.io/handai-shuttle/
```

## 公開Repositoryとして追加したいREADME項目

最低限、以下は明記します。

- 非公式Webアプリであること
- 大阪大学公式「学内連絡バス」の時刻表を参照していること
- 遅延・臨時運休・車両位置は反映しないこと
- 学内連絡バスの利用条件は大阪大学公式案内を正本とすること
- 位置情報はブラウザ内で判定し、サーバー送信しないこと
- 時刻表データの更新日
- バグ・改善報告フォーム

## Licenseについて

Repository作成時点ではLicenseを付けず、移行時に以下を分離して検討するのを推奨します。

- アプリコード: MIT等のOSS Licenseを付ける候補
- 大阪大学公式時刻表を基にしたデータ: 出典・更新日を明記し、コードとは別に扱う
- 大阪大学ロゴそのもの: Repositoryへ再配布せず、現在のようにロゴ由来の配色のみ使用する方が安全

## 移行タイミング

現時点ではまだ `kon-lab` のDraft PRを開発正本として使い続けて問題ありません。

専用Repository化する目安は、以下が揃った時点です。

- iPhone実機で主要UIの崩れが解消
- 時刻表・位置情報・往復検索の仕様が安定
- PR Previewで重大なバグがなくなる
- READMEに公開上の注意事項を確定できる

その段階で `handai-shuttle` へ移すと、途中の試行錯誤をPublic Repositoryの履歴へ大量に持ち込まずに済みます。
