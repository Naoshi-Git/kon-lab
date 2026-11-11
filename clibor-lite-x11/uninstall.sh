#!/usr/bin/env bash
set -euo pipefail
BIN_DIR="$HOME/.local/bin"
"$BIN_DIR/clibor-lite" stop 2>/dev/null || true
rm -f "$BIN_DIR/clibor-lite" "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/clibor-lite.desktop"
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/clibor-lite/app"
printf 'アプリと自動起動の設定を削除しました。\n'
printf '履歴と設定は残しました。消す場合は以下を手動実行してください。\n'
printf 'rm -rf %q %q\n' "${XDG_DATA_HOME:-$HOME/.local/share}/clibor-lite" "${XDG_CONFIG_HOME:-$HOME/.config}/clibor-lite"
