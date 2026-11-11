#!/usr/bin/python3
"""Opt-in shortcuts; preserves all unrelated GNOME custom keybindings."""
from __future__ import annotations
import os
import sys

try:
    import gi
    from gi.repository import Gio
except ImportError as err:
    raise SystemExit(f"python3-gi が必要です: {err}")

ROOT = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/"
SCHEMA = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding"
GENERAL = "org.gnome.settings-daemon.plugins.media-keys"
COMMAND = os.path.expanduser("~/.local/bin/clibor-lite")
SHORTCUTS = (
    (ROOT + "clibor-lite-date/", "Clibor Lite · 日付 YYMMDD", "<Control><Alt>1", "date-short"),
    (ROOT + "clibor-lite-datetime/", "Clibor Lite · 日時 YYMMDD-HHMM", "<Control><Alt>2", "date-time"),
)


def binding(path):
    return Gio.Settings.new_with_path(SCHEMA, path)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("install", "remove", "status"):
        print("使用法: /usr/bin/python3 scripts/gnome-shortcuts.py install|remove|status")
        return 2
    action = sys.argv[1]
    settings = Gio.Settings.new(GENERAL)
    paths = list(settings.get_strv("custom-keybindings"))
    owned = {path for path, *_ in SHORTCUTS}
    if action == "status":
        for path, name, default, _id in SHORTCUTS:
            if path in paths:
                print(f"登録済: {name}, {binding(path).get_string('binding')}")
            else:
                print(f"未登録: {name}, 推奨 {default}")
        return 0
    if action == "remove":
        paths = [p for p in paths if p not in owned]
        settings.set_strv("custom-keybindings", paths)
        print("Clibor Lite用の2件だけを解除しました。")
        return 0
    # Detect collisions with other GNOME *custom* shortcuts. GNOME built-in
    # bindings must also be checked by the local verification agent.
    for path, name, hotkey, _id in SHORTCUTS:
        for other in paths:
            if other not in owned and binding(other).get_string("binding") == hotkey:
                print(f"競合: {name} と {other} が {hotkey} を共有しています。変更せず終了。", file=sys.stderr)
                return 1
    for path, name, hotkey, tid in SHORTCUTS:
        item = binding(path)
        item.set_string("name", name)
        item.set_string("command", f"{COMMAND} paste-template {tid}")
        item.set_string("binding", hotkey)
        if path not in paths:
            paths.append(path)
    settings.set_strv("custom-keybindings", paths)
    print("登録しました: Ctrl+Alt+1 → YYMMDD / Ctrl+Alt+2 → YYMMDD-HHMM")
    print("不要になった場合: /usr/bin/python3 scripts/gnome-shortcuts.py remove")
    return 0


if __name__ == "__main__":
    sys.exit(main())
