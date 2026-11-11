#!/usr/bin/env bash
set -euo pipefail

if [[ "${XDG_SESSION_TYPE:-}" != "x11" || -z "${DISPLAY:-}" ]]; then
  echo 'エラー: GNOMEのX11セッションから実行してください (echo "$XDG_SESSION_TYPE")。' >&2
  exit 2
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo 'エラー: rootではなく通常のデスクトップユーザーで実行してください。' >&2
  exit 2
fi
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/clibor-lite/app"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
mkdir -p "$APP_DIR" "$BIN_DIR" "$DESKTOP_DIR" "${XDG_STATE_HOME:-$HOME/.local/state}/clibor-lite"

echo '[1/4] Ubuntuの標準パッケージをインストール'
sudo apt-get update
sudo apt-get install -y python3-gi gir1.2-gtk-3.0 python3-xlib xdotool x11-utils

echo '[2/4] アプリ配置'
if [[ -x "$BIN_DIR/clibor-lite" ]]; then "$BIN_DIR/clibor-lite" stop || true; sleep 0.3; fi
mkdir -p "$APP_DIR/clibor_lite"
cp "$SOURCE"/clibor_lite/*.py "$APP_DIR/clibor_lite/"
cat > "$BIN_DIR/clibor-lite" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/clibor-lite/app"
export PYTHONPATH="$APP_ROOT${PYTHONPATH:+:$PYTHONPATH}"
exec /usr/bin/python3 -m clibor_lite.app "$@"
WRAPPER
chmod 755 "$BIN_DIR/clibor-lite"

printf '[3/4] ログイン時の自動起動を登録\n'
cat > "$DESKTOP_DIR/clibor-lite.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Clibor Lite
Comment=軽量クリップボード履歴と日時定型文
Exec=$BIN_DIR/clibor-lite run
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
OnlyShowIn=GNOME;
EOF

printf '[4/4] アプリを起動\n'
nohup "$BIN_DIR/clibor-lite" run > "${XDG_STATE_HOME:-$HOME/.local/state}/clibor-lite/app.log" 2>&1 </dev/null &
sleep 0.5
if grep -E 'Traceback|XRecord:' "${XDG_STATE_HOME:-$HOME/.local/state}/clibor-lite/app.log" >/dev/null 2>&1; then
  echo '警告: エラーログがあります。 scripts/diagnose.sh を実行してください。' >&2
fi
printf '\nインストール完了。Ctrlを素早く2回押すと履歴を表示します。\n'
printf '設定画面: %s/clibor-lite settings\n' "$BIN_DIR"
printf '診断コマンド: %s/scripts/diagnose.sh\n' "$SOURCE"
