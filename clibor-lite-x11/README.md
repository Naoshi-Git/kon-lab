# Clibor Lite X11 · v0.1.0（実機検証前）

Windows版 **Clibor** の主要な使用感を、Ubuntu GNOME / X11 向けの小さな単独アプリとして再現する実装です。Clibor本体のソースコードや商標・意匠は使用せず、機能・操作から独自実装しています。クラウド、ブラウザー、Electron、常駐トレイを使いません。

## 対象環境

- `kon-cryo-02` / `ubuntu:GNOME` / GNOME Shell 46.0 / `XDG_SESSION_TYPE=x11`
- Ubuntu 24.04 系を想定。**Wayland非対応**。
- 標準Ubuntuパッケージ: `python3-gi` / `gir1.2-gtk-3.0` / `python3-xlib` / `xdotool` / `x11-utils`
- 本体は Python 3 + GTK 3 + SQLite。追加pip・Node・Electronは不要。

## 1. インストール

デスクトップにログインしている通常ユーザー（例: `labadmin`）で、ZIPを展開したフォルダーを開き、次を実行してください。

```bash
cd ~/Downloads/clibor-lite-x11
bash install.sh
```

- `sudo` を要求するのは Ubuntu の標準パッケージ導入時だけです。
- アプリは `~/.local/share/clibor-lite/app/` に配置されます。
- コマンドは `~/.local/bin/clibor-lite` です（PATH未設定時はフルパスで実行）。
- GNOMEログイン時の自動起動は `~/.config/autostart/clibor-lite.desktop` に登録。
- ログは `~/.local/state/clibor-lite/app.log`。
- インストール済み環境でも更新インストール可能。ただしデータは維持。

最初は `Ctrl` を素早く2回押してください。ポップアップが現れます。

## 2. 操作

| 操作 | 動作 |
|---|---|
| 左Ctrl×2 / 右Ctrl×2 | 履歴の表示・非表示（初期判定350ms） |
| ↑ ↓ | 履歴項目の選択 |
| Enter / 数字1〜9 | 項目を選択して貼り付け |
| マウスで行を1回クリック | 同上 |
| ← → | 履歴 ↔ 定型文タブを切り替え |
| Esc | 閉じる |
| `/` または Ctrl+F | 絞り込み検索 |
| Delete | 選択履歴を削除（履歴タブ） |
| 右上の歯車 | 設定 |

履歴は標準で1,000件まで、一覧は25件。重複コピーは最新位置に移動します。**テキストのみ**対象で、画像やファイルは初期実装の対象外です。

### 日時定型文

最初から2件を登録しています。**選択時点のローカル時刻**で展開されます。

| 項目 | テンプレート | 2026年11月11日16:07の出力例 |
|---|---|---|
| 日付 | `{date:%y%m%d}` | `261111` |
| 日時 | `{date:%y%m%d-%H%M}` | `261111-1607` |

設定画面で定型文の追加・編集・削除が可能です。日時マクロはPythonの `strftime` 形式（`%Y`, `%m`, `%d`, `%H`, `%M` など）。普通の文字列も登録可能です。Windows版Clibor独自の `<$CLB_HDATE>` 構文とは互換ではありません。

### 直接ショートカット（任意）

`Ctrl×2 → 定型文 → 選択` に加えて、**Ctrl+Alt+1 / Ctrl+Alt+2** でその場に日付を貼り付けることもできます。GNOMEの正式なカスタムショートカット設定を利用します。**インストール時には既存ショートカットを勝手に変更しません。**

```bash
/usr/bin/python3 scripts/gnome-shortcuts.py status
/usr/bin/python3 scripts/gnome-shortcuts.py install
# やめる場合
/usr/bin/python3 scripts/gnome-shortcuts.py remove
```

既存のGNOMEカスタムショートカットとの競合は登録前に検出。GNOMEの標準ショートカットとの競合は、導入後に実機で検証してください。異なるキーにしたい場合はGNOME設定 → キーボード → キーボードショートカット → 独自のショートカットから変更可能です。

## 3. コマンド

```bash
~/.local/bin/clibor-lite --help
~/.local/bin/clibor-lite show
~/.local/bin/clibor-lite templates
~/.local/bin/clibor-lite settings
~/.local/bin/clibor-lite paste-template date-short
~/.local/bin/clibor-lite paste-template date-time
~/.local/bin/clibor-lite clear-history     # 警告なしで消去
~/.local/bin/clibor-lite stop
```

未起動時の `show`, `templates`, `settings` はそのままGUIを起動します。ターミナル占有を避けたい場合は、通常は自動起動から利用してください。

## 4. 設定・保存先

- 設定: `~/.config/clibor-lite/config.json`
- 履歴: `~/.local/share/clibor-lite/history.sqlite3`
- ソケット: `$XDG_RUNTIME_DIR/clibor-lite.sock`（同一ユーザーのみ）
- 設定・DBは0600、専用ディレクトリは0700で作成。
- 保存履歴は**暗号化していません**。パスワードなど機密テキストもコピーすると保存され得ます。設定で監視・ディスク保存をOFFにできます。OFFにしても既存DBは自動削除しないため、必要なら設定→履歴をすべて削除。

データは外部サーバーには送信されません。キー検出ではXRecordのキー種別のみを見て、打鍵内容の保存・送信はしません。

## 5. 検証・不具合調査

```bash
bash scripts/diagnose.sh
PYTHONPATH=. /usr/bin/python3 -m unittest discover -s tests -v
cat ~/.local/state/clibor-lite/app.log
```

[LOCAL_AGENT_VERIFICATION.md](LOCAL_AGENT_VERIFICATION.md) に、受け入れテスト・失敗時の診断・性能測定を記載しています。

### 既知の制約

- GNOME X11のキーボードフックはXRecord対応が必要です。未対応なら`Ctrl×2`が機能しません。
- X11 `xdotool` による貼り付けは、アプリのフォーカス仕様によって失敗することがあります。設定の貼付待機時間を160→300msなどへ延長して検証してください。
- 研究用リモートデスクトップや独立Xサーバーでは、イベント監視可否が異なります。
- GTK3の通知領域アイコン、画像履歴、ウィンドウ単位の監視除外、暗号化、複数PC同期、CliborのFIFO/LIFOはありません。
- 初回のUI・XRecord・自動貼り付けの実機受け入れテストは**未実施**で、v0.1.0は検証候補版です。

## 6. アンインストール

```bash
bash uninstall.sh
```

履歴と設定は誤消去防止のため残します。完全削除コマンドはスクリプトの末尾案内を確認してください。

## 参考

- Clibor公式: https://chigusa-web.com/clibor/howto/basic1/
- Cliborの履歴操作: https://chigusa-web.com/en/howto/basic2/
- Clibor設定: https://chigusa-web.com/clibor/howto/settings/
- デジタル庁デザインシステム: https://design.digital.go.jp/dads/
- デジタル庁 ローカルデザインシステム・アクセシビリティ: https://design.digital.go.jp/dads/guidance/local-design-system/

デジタル庁のデザインシステムは**参考**です。公式コンポーネントの移植やデザインシステム準拠認証を意味しません。設定画面では、明瞭なフォームラベル、適度な余白、フォーカス視認性、文字コントラスト、読みやすい情報階層を取り入れています。履歴ポップアップはCliborの密度を優先してコンパクトにしています。

## v0.2.0-draft（2026-11-11）— Windows Clibor実画面に寄せた改訂

ユーザー提供のClibor 2.2.2画面と設定XMLから、既定の幅300px、30件表示、1,000件保持、ダブルタップ判定500msを参考にしました。履歴ポップアップを黒基調・高密度・1行表示へ変更し、キー表示は 1〜9、0、a〜z を使用します。

Ctrl/Alt/Shift は、各左右の同一キーを短い間隔で2回押すと開閉します。通常のCtrl+C/V、Alt+Tab、Shift+文字の動作を妨げないことが最重要です。ポップアップ上部のタイトル帯をドラッグして移動でき、最後の表示位置を保存します。既定では他のウィンドウへ移っても自動では閉じません。Esc、再度のダブルタップ、選択・貼付で閉じます。

角丸外側の矩形背景を減らすためGTKのRGBA Visualを利用しますが、GNOME 46/X11での描画確認は未実施です。システムのテーマと合成マネージャーによって結果が変わる可能性があります。

**注意：このPRブランチが正本です。旧ZIPと個別の差分パッチでは、PRに追加済みの貼り付け先検証機能を上書きする可能性があるため、導入に使わないでください。** また、日時定型文の直接入力でも対象ウィンドウID/PIDを一組で管理するよう修正しました。実際のX11動作はLocal Agentによる確認が必要です。

## v0.2.1-draft（2026-11-11）— カーソルアンカー・外側クリック

- 毎回カーソル基準で開きます。ポップアップの左下角をカーソル位置とし、画面端では右下→左上→右上の順に収まる角へ自動反転。いずれも収まらない場合はworkarea内へクランプ。左モニターの負座標も考慮します。
- クリップボード / 定型文タブは履歴行（約21px）に近い高さへ圧縮。定型文が少ない時はポップアップ全体も縮小します。
- ポップアップ外をクリックすると閉じるのが新しい既定です。XRecordのButtonPressを利用するためデスクトップへのクリックも検出します。設定で「外側クリックで閉じる」をOFFにすると維持できます。
- Ctrl/Alt/Shiftの左右ダブルタップは前版からの実装を維持。右AltがAltGr（ISO_Level3_Shift）になるキーボードも対象に追加しました。
- 旧設定ファイルのsticky_popup=Trueは、新しい既定動作へ移行します。実行中の旧プロセスは終了して新しい本体を再起動してください。
- 手動ドラッグした位置は保存されますが、既定の「カーソル位置を基準に開く」がONなら次回表示はカーソル追従が優先されます。OFFなら固定位置を再利用できます。
- 今回のX11/GTK再検証は未実施です。
