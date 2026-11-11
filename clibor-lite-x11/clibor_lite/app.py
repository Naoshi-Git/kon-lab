"""Compact X11 / GNOME clipboard manager, inspired by Clibor's workflow."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib, Pango

from .core import Config, DoubleCtrlDetector, History, is_same_window, render_template, runtime_socket

CSS = b"""
.clibor-popup { background: #fff; border: 1px solid #aeb6c2; border-radius: 9px; }
.clibor-title { color: #1d2635; font-size: 17px; font-weight: 700; }
.clibor-subtle { color: #596579; font-size: 12px; }
.clibor-tab { background: transparent; color: #344456; border: 0; border-bottom: 3px solid transparent;
  border-radius: 0; padding: 11px 14px; font-weight: 600; }
.clibor-tab.active { color: #0059c7; border-bottom-color: #0059c7; }
.clibor-row { padding: 8px 13px; border-bottom: 1px solid #e7eaf0; }
.clibor-row:selected { background: #e8f1ff; color: #142a44; }
.clibor-row:selected label { color: #142a44; }
.clibor-number { color: #566579; font-size: 12px; font-weight: 700; }
.clibor-preview { font-size: 14px; color: #152539; }
.clibor-footer { padding: 8px 12px; background: #f5f7fa; }
.clibor-section { color: #202939; font-weight: bold; font-size: 16px; }
.clibor-settings { background: #fff; }
.clibor-settings label { color: #1d2939; font-size: 16px; }
.clibor-settings .clibor-subtle { font-size: 13px; }
.clibor-settings switch:checked { background: #0059c7; }
.clibor-settings button:focus, .clibor-popup button:focus { outline: 2px solid #0059c7; outline-offset: 2px; }
.clibor-primary { background: #0059c7; color: #fff; }
"""


def call_xdotool(*args, timeout=2.0):
    try:
        proc = subprocess.run(["xdotool", *map(str, args)], capture_output=True,
                              text=True, timeout=timeout, check=True)
        return proc.stdout.strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as err:
        print(f"xdotool: {err}", file=sys.stderr)
        return None


class IPC:
    """Only same-user local socket. All actions dispatch on GTK's main thread."""
    def __init__(self, callback):
        self.path = runtime_socket()
        self.callback = callback
        self.listener = None

    def start(self):
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.setblocking(False)
        try:
            self.listener.bind(str(self.path))
        except OSError:
            self.listener.close()
            raise
        os.chmod(self.path, 0o600)
        self.listener.listen(8)
        GLib.io_add_watch(self.listener.fileno(), GLib.IO_IN, self._on_accept)

    def _on_accept(self, _fd, _condition):
        try:
            conn, _ = self.listener.accept()
            conn.settimeout(0.2)
            with conn:
                try:
                    command = conn.recv(4096).decode("utf-8").strip()
                except (OSError, UnicodeDecodeError):
                    return True
                if command:
                    GLib.idle_add(self.callback, command)
                    try:
                        conn.sendall(b"OK\n")
                    except OSError:
                        pass
        except (BlockingIOError, OSError):
            pass
        return True

    def close(self):
        if self.listener:
            self.listener.close()
            self.listener = None
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            pass


def dispatch_to_existing(command):
    path = runtime_socket()
    if not path.exists():
        return False
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.8)
            sock.connect(str(path))
            sock.sendall(command.encode("utf-8"))
            return sock.recv(16).startswith(b"OK")
    except OSError:
        return False


class XRecordListener(threading.Thread):
    """Passive XRecord listener; does not grab, block or log actual keystrokes."""
    def __init__(self, on_trigger, timeout_ms):
        super().__init__(name="xrecord-double-ctrl", daemon=True)
        self.on_trigger = on_trigger
        self.detector = DoubleCtrlDetector(timeout_ms)
        self.error = None

    def run(self):
        from Xlib import X, XK, display
        from Xlib.ext import record
        from Xlib.protocol import rq
        control = display.Display()
        recorder = display.Display()
        if not control.has_extension("RECORD"):
            self.error = "XRecord 拡張が利用できません。Ctrl×2は無効です。"
            print(self.error, file=sys.stderr)
            return
        ctrl_codes = {control.keysym_to_keycode(XK.XK_Control_L),
                      control.keysym_to_keycode(XK.XK_Control_R)}
        ctrl_codes.discard(0)

        def callback(reply):
            if reply.category != record.FromServer or reply.client_swapped or not reply.data:
                return
            data = reply.data
            while data:
                event, data = rq.EventField(None).parse_binary_value(data, recorder.display, None, None)
                if event.type not in (X.KeyPress, X.KeyRelease):
                    continue
                if self.detector.handle(event.type == X.KeyPress, event.detail, ctrl_codes):
                    GLib.idle_add(self.on_trigger)

        context = recorder.record_create_context(0, [record.AllClients], [{
            "core_requests": (0, 0), "core_replies": (0, 0),
            "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0),
            "delivered_events": (0, 0), "device_events": (X.KeyPress, X.KeyRelease),
            "errors": (0, 0), "client_started": False, "client_died": False,
        }])
        try:
            recorder.record_enable_context(context, callback)
        except Exception as err:
            self.error = str(err)
            print(f"XRecord: {err}", file=sys.stderr)
        finally:
            try:
                recorder.record_free_context(context)
            except Exception:
                pass
            recorder.close()
            control.close()


class HistoryPopup(Gtk.Window):
    def __init__(self, app):
        super().__init__(title="Clibor Lite")
        self.app = app
        self.tab = "history"
        self.rows = []
        self.set_decorated(False)
        self.set_resizable(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)
        self.set_keep_above(True)
        self.set_default_size(app.config.values["popup_width"], 450)
        self.connect("focus-out-event", lambda *_: GLib.idle_add(self._hide_on_focus_loss))
        self.connect("key-press-event", self.on_key)
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        outer.get_style_context().add_class("clibor-popup")
        self.add(outer)
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        header.set_margin_start(14)
        header.set_margin_end(8)
        header.set_margin_top(10)
        header.set_margin_bottom(6)
        title = Gtk.Label(label="Clibor Lite", xalign=0)
        title.get_style_context().add_class("clibor-title")
        header.pack_start(title, True, True, 0)
        setting_btn = Gtk.Button.new_from_icon_name("emblem-system-symbolic", Gtk.IconSize.MENU)
        setting_btn.set_tooltip_text("設定を開く")
        setting_btn.set_relief(Gtk.ReliefStyle.NONE)
        setting_btn.connect("clicked", lambda *_: (self.hide(), app.show_settings()))
        header.pack_end(setting_btn, False, False, 0)
        outer.pack_start(header, False, False, 0)
        tabs = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        self.tab_buttons = {}
        for key, title in (("history", "履歴"), ("templates", "定型文")):
            button = Gtk.Button(label=title)
            button.get_style_context().add_class("clibor-tab")
            button.connect("clicked", lambda _b, k=key: self.select_tab(k))
            tabs.pack_start(button, True, True, 0)
            self.tab_buttons[key] = button
        outer.pack_start(tabs, False, False, 0)
        self.search = Gtk.SearchEntry()
        self.search.set_placeholder_text("検索（/ または Ctrl+F）")
        self.search.set_margin_start(12)
        self.search.set_margin_end(12)
        self.search.set_margin_top(9)
        self.search.set_margin_bottom(8)
        self.search.connect("search-changed", lambda *_: self.refresh())
        self.search.connect("key-press-event", self.on_search_key)
        outer.pack_start(self.search, False, False, 0)
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_min_content_height(210)
        scroll.set_max_content_height(470)
        self.list_box = Gtk.ListBox()
        self.list_box.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.list_box.set_activate_on_single_click(True)
        self.list_box.connect("row-activated", self.on_activated)
        scroll.add(self.list_box)
        outer.pack_start(scroll, True, True, 0)
        footer = Gtk.Box()
        footer.get_style_context().add_class("clibor-footer")
        hint = Gtk.Label(label="↑↓ 選択  Enter 貼り付け  ←→ タブ  Esc 閉じる", xalign=0)
        hint.get_style_context().add_class("clibor-subtle")
        footer.pack_start(hint, True, True, 0)
        outer.pack_end(footer, False, False, 0)
        self.show_all()
        self.hide()

    def _hide_on_focus_loss(self):
        if self.get_visible() and not self.is_active():
            self.hide()
        return False

    def open(self, tab="history"):
        self.set_size_request(self.app.config.values["popup_width"], -1)
        self.set_default_size(self.app.config.values["popup_width"], 440)
        self.tab = tab
        self.search.set_text("")
        self.refresh()
        window_id = call_xdotool("getactivewindow")
        process_id = call_xdotool("getwindowpid", window_id) if window_id else None
        self.app.target_window = (window_id, process_id) if window_id and process_id else None
        self.show_all()
        self.present()
        # Keep the top-left in the active monitor, near the mouse pointer.
        display = Gdk.Display.get_default()
        seat = display.get_default_seat()
        pointer = seat.get_pointer()
        _screen, x, y = pointer.get_position()
        monitor = display.get_monitor_at_point(x, y)
        bounds = monitor.get_workarea()
        width = self.app.config.values["popup_width"]
        height = max(350, min(545, self.get_allocated_height()))
        self.move(max(bounds.x, min(x + 12, bounds.x + bounds.width - width)),
                  max(bounds.y, min(y + 10, bounds.y + bounds.height - height)))
        self.list_box.grab_focus()
        row = self.list_box.get_row_at_index(0)
        if row:
            self.list_box.select_row(row)

    def select_tab(self, key):
        self.tab = key
        self.search.set_text("")
        self.refresh()
        self.list_box.grab_focus()

    def refresh(self):
        query = self.search.get_text().casefold()
        self.rows = []
        for widget in self.list_box.get_children():
            self.list_box.remove(widget)
        for key, button in self.tab_buttons.items():
            context = button.get_style_context()
            (context.add_class if key == self.tab else context.remove_class)("active")
        if self.tab == "history":
            entries = self.app.history.list(self.search.get_text(), self.app.config.values["visible_history"])
            self.rows = [(text, "履歴", text, None) for text, _date in entries]
        else:
            for template in self.app.config.values["templates"]:
                expanded = render_template(template["body"])
                if query in (template["name"] + " " + expanded).casefold():
                    self.rows.append((template["name"], expanded, expanded, template["id"]))
        for index, (title, subtitle, _value, _id) in enumerate(self.rows):
            row = Gtk.ListBoxRow()
            row.get_style_context().add_class("clibor-row")
            line = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            row.add(line)
            number = Gtk.Label(label=str(index + 1) if index < 9 else "·")
            number.set_size_request(20, -1)
            number.get_style_context().add_class("clibor-number")
            line.pack_start(number, False, False, 0)
            content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=1)
            main = Gtk.Label(label=" ".join(title.splitlines()), xalign=0)
            main.set_ellipsize(Pango.EllipsizeMode.END)
            main.set_max_width_chars(51)
            main.get_style_context().add_class("clibor-preview")
            content.pack_start(main, False, False, 0)
            if self.tab == "templates":
                detail = Gtk.Label(label=" ".join(subtitle.splitlines()), xalign=0)
                detail.set_ellipsize(Pango.EllipsizeMode.END)
                detail.set_max_width_chars(55)
                detail.get_style_context().add_class("clibor-subtle")
                content.pack_start(detail, False, False, 0)
            line.pack_start(content, True, True, 0)
            self.list_box.add(row)
        if not self.rows:
            row = Gtk.ListBoxRow()
            row.set_selectable(False)
            row.add(Gtk.Label(label="該当する項目がありません", margin_top=28, margin_bottom=28))
            self.list_box.add(row)
        self.list_box.show_all()
        first = self.list_box.get_row_at_index(0)
        if first and self.rows:
            self.list_box.select_row(first)

    def on_activated(self, _list, row):
        self.accept(row.get_index())

    def accept(self, index):
        if index < 0 or index >= len(self.rows):
            return
        value = self.rows[index][2]
        self.hide()
        self.app.insert(value, self.app.target_window)

    def on_search_key(self, _widget, event):
        key = Gdk.keyval_name(event.keyval)
        if key in ("Escape", "Left", "Right", "Down", "Up", "Return", "KP_Enter"):
            return self.on_key(self, event)
        return False

    def on_key(self, _widget, event):
        name = Gdk.keyval_name(event.keyval)
        if name == "Escape":
            self.hide()
            return True
        if name in ("Left", "Right"):
            self.select_tab("templates" if self.tab == "history" else "history")
            return True
        if name in ("slash",) or ((event.state & Gdk.ModifierType.CONTROL_MASK) and name.lower() == "f"):
            self.search.grab_focus()
            return True
        if name in ("Up", "Down"):
            chosen = self.list_box.get_selected_row()
            current = chosen.get_index() if chosen else -1
            next_index = (current + (1 if name == "Down" else -1)) % max(1, len(self.rows))
            row = self.list_box.get_row_at_index(next_index)
            if row and self.rows:
                self.list_box.select_row(row)
            return True
        if name in ("Return", "KP_Enter"):
            selected = self.list_box.get_selected_row()
            self.accept(selected.get_index() if selected else 0)
            return True
        if name == "Delete" and self.tab == "history" and not self.search.is_focus():
            chosen = self.list_box.get_selected_row()
            if chosen and chosen.get_index() < len(self.rows):
                self.app.history.remove(self.rows[chosen.get_index()][2])
                self.refresh()
            return True
        if not self.search.is_focus() and name and len(name) == 1:
            if "1" <= name <= "9" and not event.state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.MOD1_MASK):
                self.accept(int(name) - 1)
                return True
            if name.isprintable() and not event.state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.MOD1_MASK):
                self.search.grab_focus()
                self.search.set_text(name)
                self.search.set_position(-1)
                return True
        return False


class Settings(Gtk.Window):
    def __init__(self, app):
        super().__init__(title="Clibor Lite · 設定")
        self.app = app
        self.set_default_size(610, 640)
        self.get_style_context().add_class("clibor-settings")
        self.set_border_width(20)
        self.set_destroy_with_parent(False)
        scroller = Gtk.ScrolledWindow()
        scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.add(scroller)
        body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        scroller.add(body)
        title = Gtk.Label(label="設定", xalign=0)
        title.set_markup("<span size='x-large' weight='bold'>設定</span>")
        body.pack_start(title, False, False, 0)
        summary = Gtk.Label(label="日常操作を妨げない、最小限の設定。変更は自動保存されます。", xalign=0)
        summary.set_line_wrap(True)
        body.pack_start(summary, False, False, 0)
        self.section(body, "基本動作")
        self.switch(body, "選択後に自動貼り付け", "auto_paste", "無効時はクリップボードへのコピーのみ")
        self.switch(body, "クリップボード履歴を監視", "clipboard_monitor", "停止中は履歴を追加しません")
        self.switch(body, "履歴をディスクに保存", "save_history", "変更は次回起動時に反映。既存の保存データは自動削除されません")
        self.number(body, "Ctrl 2回の判定時間（ms）", "double_tap_ms", 200, 650, 25)
        self.number(body, "自動貼り付けの待機時間（ms）", "paste_delay_ms", 40, 1500, 20)
        self.section(body, "履歴と表示")
        self.number(body, "保存する最大件数", "max_history", 10, 10000, 10)
        self.number(body, "画面に表示する件数", "visible_history", 5, 50, 1)
        self.number(body, "ポップアップの横幅（px）", "popup_width", 340, 850, 10)
        self.section(body, "定型文・日時マクロ")
        helper = Gtk.Label(label="{date:%y%m%d} → 261111  /  {date:%y%m%d-%H%M} → 261111-1607 （例）", xalign=0)
        helper.set_line_wrap(True)
        body.pack_start(helper, False, False, 0)
        self.template_list = Gtk.ListBox()
        self.template_list.set_selection_mode(Gtk.SelectionMode.SINGLE)
        body.pack_start(self.template_list, False, False, 0)
        self.update_templates()
        buttons = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=7)
        for label, callback in (("追加", self.add_template), ("編集", self.edit_template), ("削除", self.delete_template)):
            btn = Gtk.Button(label=label)
            btn.connect("clicked", callback)
            buttons.pack_start(btn, False, False, 0)
        body.pack_start(buttons, False, False, 0)
        self.section(body, "履歴の削除")
        clear = Gtk.Button(label="履歴をすべて削除…")
        clear.set_halign(Gtk.Align.START)
        clear.connect("clicked", self.clear_history)
        body.pack_start(clear, False, False, 0)
        tail = Gtk.Label(label="X11専用 · 設定と履歴はローカル保存 · パスワード等のコピーに注意", xalign=0)
        tail.set_line_wrap(True)
        tail.get_style_context().add_class("clibor-subtle")
        body.pack_start(tail, False, False, 12)
        self.connect("delete-event", self._hide)

    def _hide(self, *_):
        self.hide()
        return True

    def section(self, parent, title):
        label = Gtk.Label(label=title, xalign=0)
        label.get_style_context().add_class("clibor-section")
        label.set_margin_top(7)
        parent.pack_start(label, False, False, 0)

    def line(self, parent, label, help_text=None):
        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        vertical = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        caption = Gtk.Label(label=label, xalign=0)
        caption.set_line_wrap(True)
        vertical.pack_start(caption, False, False, 0)
        if help_text:
            help_label = Gtk.Label(label=help_text, xalign=0)
            help_label.set_line_wrap(True)
            help_label.get_style_context().add_class("clibor-subtle")
            vertical.pack_start(help_label, False, False, 0)
        box.pack_start(vertical, True, True, 0)
        parent.pack_start(box, False, False, 0)
        return box

    def switch(self, parent, label, key, help_text=None):
        box = self.line(parent, label, help_text)
        sw = Gtk.Switch()
        sw.set_valign(Gtk.Align.CENTER)
        sw.set_active(self.app.config.values[key])
        sw.connect("notify::active", lambda widget, _prop: self.set_value(key, widget.get_active()))
        box.pack_end(sw, False, False, 0)

    def number(self, parent, label, key, lower, upper, step):
        box = self.line(parent, label)
        adjust = Gtk.Adjustment(value=self.app.config.values[key], lower=lower, upper=upper,
                                step_increment=step, page_increment=step, page_size=0)
        spin = Gtk.SpinButton(adjustment=adjust, climb_rate=1, digits=0)
        spin.set_size_request(120, -1)
        spin.connect("value-changed", lambda widget: self.set_value(key, widget.get_value_as_int()))
        box.pack_end(spin, False, False, 0)

    def set_value(self, key, value):
        self.app.config.values[key] = value
        self.app.config.save()
        if key == "double_tap_ms":
            self.app.key_listener.detector.timeout_ms = value
        if key == "max_history":
            self.app.history.limit = value
            with self.app.history.db:
                self.app.history.trim()

    def update_templates(self):
        for child in self.template_list.get_children():
            self.template_list.remove(child)
        for t in self.app.config.values["templates"]:
            row = Gtk.ListBoxRow()
            label = Gtk.Label(xalign=0, margin_top=8, margin_bottom=8, margin_start=7)
            label.set_text(f"{t['name']}     {t['body']}")
            label.set_ellipsize(Pango.EllipsizeMode.END)
            row.add(label)
            self.template_list.add(row)
        self.template_list.show_all()

    def selected_index(self):
        row = self.template_list.get_selected_row()
        return row.get_index() if row else None

    def template_dialog(self, current=None):
        dialog = Gtk.Dialog(title="定型文の編集" if current else "定型文の追加", transient_for=self,
                            flags=Gtk.DialogFlags.MODAL)
        dialog.add_button("キャンセル", Gtk.ResponseType.CANCEL)
        dialog.add_button("保存", Gtk.ResponseType.OK)
        content = dialog.get_content_area()
        content.set_spacing(12)
        content.set_border_width(15)
        name = Gtk.Entry()
        name.set_placeholder_text("名前（例：今日の日付）")
        name.set_text(current["name"] if current else "")
        body = Gtk.Entry()
        body.set_placeholder_text("本文（例：{date:%Y-%m-%d}）")
        body.set_text(current["body"] if current else "")
        for caption, entry in (("名前", name), ("本文・日時マクロ", body)):
            content.pack_start(Gtk.Label(label=caption, xalign=0), False, False, 0)
            content.pack_start(entry, False, False, 0)
        dialog.show_all()
        result = None
        if dialog.run() == Gtk.ResponseType.OK and name.get_text().strip() and body.get_text():
            result = {"id": current["id"] if current else uuid.uuid4().hex[:12],
                      "name": name.get_text().strip(), "body": body.get_text()}
        dialog.destroy()
        return result

    def add_template(self, *_):
        item = self.template_dialog()
        if item:
            self.app.config.values["templates"].append(item)
            self.app.config.save()
            self.update_templates()

    def edit_template(self, *_):
        index = self.selected_index()
        if index is None:
            return
        item = self.template_dialog(self.app.config.values["templates"][index])
        if item:
            self.app.config.values["templates"][index] = item
            self.app.config.save()
            self.update_templates()

    def delete_template(self, *_):
        index = self.selected_index()
        if index is not None:
            self.app.config.values["templates"].pop(index)
            self.app.config.save()
            self.update_templates()

    def clear_history(self, *_):
        dialog = Gtk.MessageDialog(transient_for=self, flags=Gtk.DialogFlags.MODAL,
                                   message_type=Gtk.MessageType.WARNING,
                                   buttons=Gtk.ButtonsType.OK_CANCEL,
                                   text="保存したクリップボード履歴をすべて削除しますか？")
        dialog.format_secondary_text("この操作は取り消せません。")
        result = dialog.run()
        dialog.destroy()
        if result == Gtk.ResponseType.OK:
            self.app.history.clear()


class Application:
    def __init__(self):
        self.config = Config()
        self.history = History(persist=self.config.values["save_history"], limit=self.config.values["max_history"])
        self.clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
        self.clipboard.connect("owner-change", self.on_clipboard_change)
        self.target_window = None
        provider = Gtk.CssProvider()
        provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider,
                                                 Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.popup = HistoryPopup(self)
        self.settings = None
        self.ipc = IPC(self.dispatch)
        self.ipc.start()
        self.key_listener = XRecordListener(self.toggle_popup, self.config.values["double_tap_ms"])
        self.key_listener.start()
        # Capture clipboard content already present when the app starts.
        GLib.idle_add(self.read_clipboard)

    def read_clipboard(self):
        if self.config.values["clipboard_monitor"]:
            self.clipboard.request_text(self.clipboard_received, None)
        return False

    def on_clipboard_change(self, _clipboard, _event):
        self.read_clipboard()

    def clipboard_received(self, _clipboard, text, _user_data):
        if self.config.values["clipboard_monitor"] and text:
            self.history.add(text, self.config.values["max_text_chars"])

    def toggle_popup(self):
        if self.popup.get_visible():
            self.popup.hide()
        else:
            self.popup.open()
        return False

    def show_settings(self):
        if self.settings is None:
            self.settings = Settings(self)
        self.settings.show_all()
        self.settings.present()

    def insert(self, value, target_window=None):
        self.clipboard.set_text(value, -1)
        self.clipboard.set_can_store(None)
        if self.config.values["auto_paste"] and target_window:
            GLib.timeout_add(self.config.values["paste_delay_ms"], self._paste, target_window)

    def _paste(self, target_window):
        # Fail closed if the original window was destroyed or its XID was reused.
        window_id, process_id = target_window
        if call_xdotool("getwindowpid", window_id) != process_id:
            return False
        if call_xdotool("windowactivate", "--sync", window_id, timeout=2.0) is None:
            return False
        active_id = call_xdotool("getactivewindow")
        active_pid = call_xdotool("getwindowpid", active_id) if active_id else None
        if is_same_window(window_id, process_id, active_id, active_pid):
            call_xdotool("key", "--clearmodifiers", "ctrl+v", timeout=2.0)
        return False

    def dispatch(self, command):
        if command in ("show", "history"):
            self.popup.open("history")
        elif command == "templates":
            self.popup.open("templates")
        elif command == "settings":
            self.show_settings()
        elif command == "clear-history":
            # Deliberately no IPC confirmation: this is an explicit CLI action.
            self.history.clear()
        elif command == "stop":
            self.quit()
        elif command.startswith("paste-template:"):
            tid = command.partition(":")[2]
            template = next((t for t in self.config.values["templates"] if t["id"] == tid), None)
            if template:
                active = call_xdotool("getactivewindow")
                self.insert(render_template(template["body"]), active)
        return False

    def quit(self):
        self.ipc.close()
        self.history.close()
        Gtk.main_quit()


def main():
    help_text = """Clibor Lite (GNOME 46 / X11)
使用法: clibor-lite [run|show|templates|settings|paste-template ID|clear-history|stop]
既定: run (通常は自動起動)。 Ctrl×2 で履歴を開きます。
日付直接貼付: clibor-lite paste-template date-short
日時直接貼付: clibor-lite paste-template date-time
"""
    if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h", "help"):
        print(help_text)
        return 0
    if os.environ.get("XDG_SESSION_TYPE") != "x11" or not os.environ.get("DISPLAY"):
        print("Clibor Lite は X11 セッション専用です。", file=sys.stderr)
        return 2
    args = sys.argv[1:]
    cmd = (args[0] if args else "run")
    allowed = {"run", "show", "history", "templates", "settings", "paste-template", "clear-history", "stop"}
    if cmd not in allowed or (cmd == "paste-template" and len(args) < 2):
        print(help_text, file=sys.stderr)
        return 2
    message = f"paste-template:{args[1]}" if cmd == "paste-template" else cmd
    if dispatch_to_existing(message):
        return 0
    if cmd in ("stop", "clear-history"):
        print("Clibor Lite は起動していません。", file=sys.stderr)
        return 1
    # Stale socket after crash: only unlink if owned by the current UID.
    path = runtime_socket()
    if path.exists() and path.stat().st_uid == os.getuid():
        path.unlink()
    app = Application()
    if cmd != "run":
        GLib.idle_add(app.dispatch, message)
    try:
        Gtk.main()
    except KeyboardInterrupt:
        pass
    finally:
        app.ipc.close()
        app.history.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
