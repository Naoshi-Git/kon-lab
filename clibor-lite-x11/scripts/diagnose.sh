#!/usr/bin/env bash
set -u
APP="$HOME/.local/bin/clibor-lite"
echo "USER=$(id -un) HOST=$(hostname) XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-<unset>} DISPLAY=${DISPLAY:-<unset>} DESKTOP=${XDG_CURRENT_DESKTOP:-<unset>}"
echo '--- components ---'
for binary in xdotool xdpyinfo /usr/bin/python3; do command -v "$binary" || echo "MISSING: $binary"; done
/usr/bin/python3 - <<'PY'
try:
    from Xlib import display
    import gi
    gi.require_version('Gtk','3.0')
    from gi.repository import Gtk
    print('python-xlib: OK; GTK:', Gtk.get_major_version(), Gtk.get_minor_version())
except Exception as err:
    print('Python dependency ERROR:', repr(err))
PY
if command -v xdpyinfo >/dev/null; then
  xdpyinfo -queryExtensions 2>&1 | grep -i 'RECORD\|XTEST' || echo 'MISSING XRecord or XTEST extension'
fi
if command -v xdotool >/dev/null; then
  printf 'Active X11 window: '
  xdotool getactivewindow 2>&1 || true
fi
if [[ -e "$APP" ]]; then
  "$APP" --help
else
  echo 'NOT INSTALLED'
fi
printf '%s\n' '--- startup & logs ---'
ls -l "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/clibor-lite.desktop" 2>&1 || true
pgrep -af 'clibor_lite.app' || true
tail -n 25 "${XDG_STATE_HOME:-$HOME/.local/state}/clibor-lite/app.log" 2>/dev/null || true
