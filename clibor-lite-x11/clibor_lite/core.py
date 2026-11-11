"""Clibor Lite: pure, dependency-free application logic."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import tempfile
import time
from datetime import datetime
from pathlib import Path

APP = "clibor-lite"
DEFAULT_TEMPLATES = [
    {"id": "date-short", "name": "日付 (YYMMDD)", "body": "{date:%y%m%d}"},
    {"id": "date-time", "name": "日時 (YYMMDD-HHMM)", "body": "{date:%y%m%d-%H%M}"},
]
DEFAULT_SETTINGS = {
    "auto_paste": True,
    "clipboard_monitor": True,
    "save_history": True,
    "double_tap_ms": 500,
    "max_history": 1000,
    "visible_history": 30,
    "max_text_chars": 200000,
    "popup_width": 300,
    "paste_delay_ms": 200,
    "sticky_popup": True,
    "popup_x": None,
    "popup_y": None,
    "templates": DEFAULT_TEMPLATES,
}
MACRO = re.compile(r"\{date:([^{}]+)\}")
SHORTCUT_KEYS = "1234567890abcdefghijklmnopqrstuvwxyz"


def shortcut_label(index):
    return SHORTCUT_KEYS[index] if 0 <= index < len(SHORTCUT_KEYS) else "·"


def is_same_window(window_id, process_id, active_window_id, active_process_id):
    """Return true only when the captured X11 window is still the active owner."""
    return bool(window_id and process_id and active_window_id and active_process_id
                and str(window_id) == str(active_window_id)
                and str(process_id) == str(active_process_id))


def config_dir():
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / APP


def data_dir():
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / APP


def runtime_socket():
    # Never use /tmp with a predictable socket owned by another user.
    root = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}"))
    if not root.exists():
        raise RuntimeError("XDG_RUNTIME_DIR が存在しません。GNOMEの通常ログインセッションで実行してください。")
    return root / f"{APP}.sock"


def private_dir(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)


def sanitize_settings(raw):
    cfg = dict(DEFAULT_SETTINGS)
    cfg["templates"] = [dict(t) for t in DEFAULT_TEMPLATES]
    if not isinstance(raw, dict):
        return cfg
    for key in ("auto_paste", "clipboard_monitor", "save_history", "sticky_popup"):
        if isinstance(raw.get(key), bool):
            cfg[key] = raw[key]
    for key, low, high in (("double_tap_ms", 200, 800), ("max_history", 10, 10000),
                           ("visible_history", 5, 50), ("max_text_chars", 100, 1000000),
                           ("popup_width", 260, 850), ("paste_delay_ms", 40, 1500)):
        if type(raw.get(key)) is int:
            cfg[key] = max(low, min(high, raw[key]))
    for key in ("popup_x", "popup_y"):
        if raw.get(key) is None or type(raw.get(key)) is int:
            cfg[key] = raw.get(key)
    ts = raw.get("templates")
    if isinstance(ts, list):
        seen = set()
        valid = []
        for item in ts[:100]:
            if not isinstance(item, dict):
                continue
            ident, name, body = item.get("id"), item.get("name"), item.get("body")
            if all(isinstance(x, str) for x in (ident, name, body)) and ident and ident not in seen and len(name) <= 150 and len(body) <= 10000:
                valid.append({"id": ident, "name": name, "body": body})
                seen.add(ident)
        cfg["templates"] = valid
    return cfg


class Config:
    def __init__(self, path=None):
        self.path = Path(path) if path else config_dir() / "config.json"
        try:
            self.values = sanitize_settings(json.loads(self.path.read_text(encoding="utf-8")))
        except (OSError, ValueError, UnicodeError):
            self.values = sanitize_settings({})

    def save(self):
        private_dir(self.path.parent)
        fd, temp = tempfile.mkstemp(prefix=".config-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                json.dump(self.values, file, ensure_ascii=False, indent=2)
                file.write("\n")
                file.flush()
                os.fsync(file.fileno())
            os.chmod(temp, 0o600)
            os.replace(temp, self.path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)


def render_template(body, now=None):
    now = now or datetime.now()
    def replacement(m):
        fmt = m.group(1)
        # No eval; allow Python strftime directives and ordinary printable text.
        if len(fmt) > 100 or '\\' in fmt or '\x00' in fmt:
            return m.group(0)
        try:
            return now.strftime(fmt)
        except ValueError:
            return m.group(0)
    return MACRO.sub(replacement, body)


class DoubleModifierDetector:
    """Recognize two clean press/release cycles of the same Ctrl/Alt/Shift key."""
    def __init__(self, timeout_ms=500):
        self.timeout_ms = timeout_ms
        self.last_release = None
        self.last_side = None
        self.pressed = set()
        self.other_down = set()
        self.chord = False
        self.modifier_start = 0.0
        self.active_side = None

    def handle(self, is_down, keycode, modifier_codes, when=None):
        when = time.monotonic() if when is None else when
        if keycode not in modifier_codes:
            if is_down:
                self.other_down.add(keycode)
                if self.pressed:
                    self.chord = True
                self.last_release = None
                self.last_side = None
            else:
                self.other_down.discard(keycode)
            return False
        if is_down:
            if keycode not in self.pressed:
                if self.pressed:
                    self.chord = True
                else:
                    self.chord = bool(self.other_down)
                    self.modifier_start = when
                    self.active_side = keycode
                self.pressed.add(keycode)
            return False
        if keycode not in self.pressed:
            return False
        self.pressed.remove(keycode)
        if self.pressed:
            return False
        clean = not self.chord and self.active_side == keycode and when - self.modifier_start < 0.6
        self.chord = False
        self.active_side = None
        if not clean:
            self.last_release = None
            self.last_side = None
            return False
        if self.last_release is not None and self.last_side == keycode and (when - self.last_release) * 1000 <= self.timeout_ms:
            self.last_release = None
            self.last_side = None
            return True
        self.last_release = when
        self.last_side = keycode
        return False


DoubleCtrlDetector = DoubleModifierDetector


class History:
    """SQLite-backed bounded MRU text history; optionally session-only."""
    def __init__(self, path=None, persist=True, limit=1000):
        self.path = Path(path) if path else data_dir() / "history.sqlite3"
        self.persist = persist
        if persist:
            private_dir(self.path.parent)
        self.db = sqlite3.connect(str(self.path) if persist else ":memory:")
        if persist:
            os.chmod(self.path, 0o600)
        self.db.execute("CREATE TABLE IF NOT EXISTS items (text TEXT PRIMARY KEY, copied REAL NOT NULL)")
        self.db.execute("CREATE INDEX IF NOT EXISTS idx_copied ON items(copied DESC)")
        self.db.commit()
        self.limit = limit

    def add(self, text, max_chars=200000):
        if not isinstance(text, str) or not text.strip() or len(text) > max_chars:
            return False
        with self.db:
            self.db.execute("DELETE FROM items WHERE text = ?", (text,))
            self.db.execute("INSERT INTO items(text,copied) VALUES (?,?)", (text, time.time()))
            self.trim()
        return True

    def trim(self):
        self.db.execute("DELETE FROM items WHERE text NOT IN "
                        "(SELECT text FROM items ORDER BY copied DESC, rowid DESC LIMIT ?)", (self.limit,))

    def count(self, query=""):
        if query:
            rows = self.db.execute("SELECT text FROM items").fetchall()
            q = query.casefold()
            return sum(1 for (text,) in rows if q in text.casefold())
        return self.db.execute("SELECT COUNT(*) FROM items").fetchone()[0]

    def list(self, query="", limit=25):
        if query:
            # Unicode-safe case-insensitive substring search in Python.
            rows = self.db.execute("SELECT text,copied FROM items ORDER BY copied DESC, rowid DESC").fetchall()
            q = query.casefold()
            return [(t, d) for t, d in rows if q in t.casefold()][:limit]
        return self.db.execute("SELECT text,copied FROM items ORDER BY copied DESC, rowid DESC LIMIT ?", (limit,)).fetchall()

    def remove(self, text):
        with self.db:
            self.db.execute("DELETE FROM items WHERE text = ?", (text,))

    def clear(self):
        with self.db:
            self.db.execute("DELETE FROM items")

    def close(self):
        self.db.close()
