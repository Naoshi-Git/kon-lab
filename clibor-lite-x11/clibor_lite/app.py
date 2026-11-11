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

from .core import (Config, DoubleModifierDetector, History, choose_popup_position,
                   point_in_window, is_same_window, render_template, runtime_socket,
                   popup_activation_args, selected_modifier_codes, shortcut_label)

CSS = b"""
window.clibor-window { background-color: transparent; }
.clibor-popup { background-color: #101010; border: 1px solid #626262; border-radius: 7px; color: #f3f3f3; }
.clibor-header { background: #101010; border-top-left-radius: 7px; border-top-right-radius: 7px;
  color: #e4e4e4; padding: 3px 6px 1px 6px; font-size: 10px; }
.clibor-tab { background: #1d1d1d; color: #f2f2f2; border: 1px solid #777; border-radius: 2px;
  background-image: none; box-shadow: none; padding: 0 4px; min-height: 0; font-size: 10px; }
.clibor-tab.active { background: #464646; color: #fff; }
.clibor-tabs { background: #101010; padding: 1px 4px; }
.clibor-status { background: #101010; color: #ededed; padding: 1px 5px; font-size: 9px; }
.clibor-search { background: #bcbcbc; color: #090909; border: 0; border-radius: 1px;
  padding: 0 4px; min-height: 20px; font-size: 10px; }
.clibor-list { background: #0c0c0c; }
.clibor-row { background: #090909; border: 0; margin: 0; padding: 0; }
.clibor-row:nth-child(even) { background: #1c1c1c; }
.clibor-row:selected, .clibor-row:selected:focus { background: #19427a; }
.clibor-row:selected label { color: #fff; }
.clibor-rowbox { padding: 1px 4px; min-height: 19px; }
.clibor-number { color: #dddddd; font-size: 10px; font-weight: normal; }
.clibor-preview { color: #ededed; font-size: 10px; }
.clibor-subtle { color: #666; font-size: 12px; }
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
    def __init__(self, on_trigger, timeout_ms, on_button_press=None, get_hotkey_settings=None):
        super().__init__(name="xrecord-double-ctrl", daemon=True)
        self.on_trigger = on_trigger
        self.on_button_press = on_button_press
        self.get_hotkey_settings = get_hotkey_settings or (lambda: {})
        self.detector = DoubleModifierDetector(timeout_ms)
        self.error = None

    def run(self):
        from Xlib import X, XK, display
        from Xlib.ext import record
        from Xlib.protocol import rq
        control = display.Display()
        recorder = display.Display()
        if not control.has_extension("RECORD"):
            self.error = "XRecord 拡張が利用できません。ダブル修飾キーは無効です。"
            print(self.error, file=sys.stderr)
            return
        keycode_groups = {
            "ctrl": {control.keysym_to_keycode(ks) for ks in (XK.XK_Control_L, XK.XK_Control_R)},
            "alt": {control.keysym_to_keycode(ks) for ks in (
                XK.XK_Alt_L, XK.XK_Alt_R,
                # python-xlib omits this standard X11 keysym on some versions.
                getattr(XK, "XK_ISO_Level3_Shift", 0xFE03), getattr(XK, "XK_Mode_switch", 0))},
            "shift": {control.keysym_to_keycode(ks) for ks in (XK.XK_Shift_L, XK.XK_Shift_R)},
        }
        for codes in keycode_groups.values():
            codes.discard(0)

        def callback(reply):
            if reply.category != record.FromServer or reply.client_swapped or not reply.data:
                return
            data = reply.data
            while data:
                event, data = rq.EventField(None).parse_binary_value(data, recorder.display, None, None)
                if event.type == X.ButtonPress:
                    if self.on_button_press is not None and event.detail in (1, 2, 3):
                        GLib.idle_add(self.on_button_press, int(event.root_x), int(event.root_y))
                    continue
                if event.type not in (X.KeyPress, X.KeyRelease):
                    continue
                modifier_codes = selected_modifier_codes(keycode_groups, self.get_hotkey_settings())
                if self.detector.handle(event.type == X.KeyPress, event.detail, modifier_codes):
                    GLib.idle_add(self.on_trigger)

        context = recorder.record_create_context(0, [record.AllClients], [{
            "core_requests": (0, 0), "core_replies": (0, 0),
            "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0),
            "delivered_events": (0, 0), "device_events": (X.KeyPress, X.ButtonPress),
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
        self.set_name("clibor-window")
        self.get_style_context().add_class("clibor-window")
        self.set_app_paintable(True)
        screen = Gdk.Screen.get_default()
        if screen and screen.is_composited():
            visual = screen.get_rgba_visual()
            if visual:
                self.set_visual(visual)
        self.set_default_size(app.config.values["popup_width"], 510)
        self.position_save_source = None
        self._drag_started = False
        self.connect("focus-out-event", lambda *_: GLib.idle_add(self._hide_on_focus_loss))
        self.connect("configure-event", self.on_configure)
        self.connect("key-press-event", self.on_key)
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        outer.get_style_context().add_class("clibor-popup")
        self.add(outer)
        drag_area = Gtk.EventBox()
        drag_area.set_visible_window(False)
        drag_area.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
        drag_area.connect("button-press-event", self.on_drag_start)
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        header.get_style_context().add_class("clibor-header")
        title = Gtk.Label(label="Clibor Lite", xalign=0)
        header.pack_start(title, True, True, 0)
        self.header_summary = Gtk.Label(label="", xalign=1)
        header.pack_end(self.header_summary, False, False, 0)
        drag_area.add(header)
        outer.pack_start(drag_area, False, False, 0)
        tabs = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=2)
        tabs.get_style_context().add_class("clibor-tabs")
        tabs.set_size_request(-1, 23)
        self.tab_buttons = {}
        tab_widths = Gtk.SizeGroup(mode=Gtk.SizeGroupMode.HORIZONTAL)
        for key, title_text in (("history", "クリップボード"), ("templates", "定型文")):
            button = Gtk.Button(label=title_text)
            button.set_relief(Gtk.ReliefStyle.NONE)
            button.set_size_request(-1, 21)
            tab_widths.add_widget(button)
            button.get_style_context().add_class("clibor-tab")
            button.connect("clicked", lambda _b, k=key: self.select_tab(k))
            tabs.pack_start(button, True, True, 0)
            self.tab_buttons[key] = button
        setting_btn = Gtk.Button.new_from_icon_name("emblem-system-symbolic", Gtk.IconSize.MENU)
        setting_btn.set_relief(Gtk.ReliefStyle.NONE)
        setting_btn.set_size_request(21, 21)
        setting_btn.get_style_context().add_class("clibor-tab")
        setting_btn.set_tooltip_text("設定を開く")
        setting_btn.connect("clicked", lambda *_: (self.hide(), app.show_settings()))
        tabs.pack_end(setting_btn, False, False, 0)
        outer.pack_start(tabs, False, False, 0)
        self.status = Gtk.Label(label="", xalign=0)
        self.status.get_style_context().add_class("clibor-status")
        outer.pack_start(self.status, False, False, 0)
        self.search = Gtk.SearchEntry()
        self.search.set_placeholder_text("検索")
        self.search.get_style_context().add_class("clibor-search")
        self.search.set_margin_start(4)
        self.search.set_margin_end(4)
        self.search.set_margin_bottom(3)
        self.search.connect("search-changed", lambda *_: self.refresh())
        self.search.connect("key-press-event", self.on_search_key)
        outer.pack_start(self.search, False, False, 0)
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_min_content_height(60)
        scroll.set_max_content_height(670)
        self.list_box = Gtk.ListBox()
        self.list_box.get_style_context().add_class("clibor-list")
        self.list_box.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.list_box.set_activate_on_single_click(True)
        self.list_box.connect("row-activated", self.on_activated)
        scroll.add(self.list_box)
        outer.pack_start(scroll, True, True, 0)
        self.show_all()
        self.hide()

    def _hide_on_focus_loss(self):
        # The window can momentarily lose focus during the initial X11 map.
        if (self.get_visible() and not self.is_active()
                and not self.app.config.values["sticky_popup"]
                and GLib.get_monotonic_time() >= getattr(self, "_focus_grace_until", 0)):
            self.hide()
        return False

    def on_drag_start(self, _widget, event):
        if event.type == Gdk.EventType.BUTTON_PRESS and event.button == 1:
            self._drag_started = True
            self.begin_move_drag(event.button, int(event.x_root), int(event.y_root), event.time)
            return True
        return False

    def on_configure(self, _widget, event):
        if not self.get_visible() or not self._drag_started:
            return False
        self._pending_position = (int(event.x), int(event.y))
        if self.position_save_source is not None:
            GLib.source_remove(self.position_save_source)
        self.position_save_source = GLib.timeout_add(350, self.save_position)
        return False

    def save_position(self):
        self.position_save_source = None
        if not hasattr(self, "_pending_position"):
            return False
        x, y = self._pending_position
        values = self.app.config.values
        if (values.get("popup_x"), values.get("popup_y")) != (x, y):
            values["popup_x"], values["popup_y"] = x, y
            self.app.config.save()
        return False

    def dismiss_on_outside_click(self, root_x, root_y):
        if not self.get_visible() or self.app.config.values["sticky_popup"]:
            return False
        x, y = self.get_position()
        width, height = self.get_size()
        if not point_in_window(root_x, root_y, x, y, width, height):
            self.hide()
        return False

    def activate_after_map(self):
        # Let GTK and the window manager finish mapping before asking GNOME to
        # activate this utility window. Calling windowactivate in open() races
        # the map and can leave the popup unfocused (then hidden by focus-out).
        if self.get_visible() and self.get_window():
            call_xdotool(*popup_activation_args(self.get_window().get_xid()), timeout=0.5)
        return False

    def reposition_after_map(self, cursor_x, cursor_y, work_x, work_y, work_width, work_height):
        # GTK can allocate a different natural height from the estimate used
        # before mapping. Recompute corner placement with the mapped size.
        if not self.get_visible():
            return False
        width, height = self.get_size()
        if self.app.config.values["popup_follow_cursor"]:
            x, y = choose_popup_position(
                cursor_x, cursor_y, width, height,
                work_x, work_y, work_width, work_height)
        else:
            saved_x = self.app.config.values.get("popup_x")
            saved_y = self.app.config.values.get("popup_y")
            if saved_x is None or saved_y is None:
                x, y = choose_popup_position(
                    cursor_x, cursor_y, width, height,
                    work_x, work_y, work_width, work_height)
            else:
                x = max(work_x, min(saved_x, max(work_x, work_x + work_width - width)))
                y = max(work_y, min(saved_y, max(work_y, work_y + work_height - height)))
        self.move(x, y)
        return False

    def open(self, tab="history"):
        # Always reopen at the pointer by default; stored coordinates remain
        # available when users turn off "follow cursor" in Settings.
        self._drag_started = False
        self.set_size_request(self.app.config.values["popup_width"], -1)
        self.tab = tab
        self.search.set_text("")
        self.refresh()
        window_id = call_xdotool("getactivewindow")
        process_id = call_xdotool("getwindowpid", window_id) if window_id else None
        self.app.target_window = (window_id, process_id) if window_id and process_id else None
        # Derive placement before displaying the window to avoid a jump from
        # a previous position during GTK's initial map.
        self._focus_grace_until = GLib.get_monotonic_time() + 350000
        # Use the active monitor workarea and requested popup dimensions.
        display = Gdk.Display.get_default()
        seat = display.get_default_seat()
        pointer = seat.get_pointer()
        _screen, x, y = pointer.get_position()
        monitor = display.get_monitor_at_point(x, y)
        bounds = monitor.get_workarea()
        width = self.app.config.values["popup_width"]
        desired_height = min(bounds.height, 730, max(170, 85 + 21 * max(1, len(self.rows))))
        height = desired_height
        # A fixed Gtk.Window ignores resize() after its first map unless the
        # requested minimum size is updated as well. Set this before mapping
        # so 30 history rows are visible on the first frame.
        self.set_size_request(width, height)
        self.set_default_size(width, height)
        self.resize(width, height)
        if self.app.config.values["popup_follow_cursor"]:
            target_x, target_y = choose_popup_position(
                x, y, width, height,
                bounds.x, bounds.y, bounds.width, bounds.height)
        else:
            saved_x = self.app.config.values.get("popup_x")
            saved_y = self.app.config.values.get("popup_y")
            if saved_x is None or saved_y is None:
                target_x, target_y = choose_popup_position(
                    x, y, width, height,
                    bounds.x, bounds.y, bounds.width, bounds.height)
            else:
                target_x = max(bounds.x, min(saved_x, max(bounds.x, bounds.x + bounds.width - width)))
                target_y = max(bounds.y, min(saved_y, max(bounds.y, bounds.y + bounds.height - height)))
        self.move(target_x, target_y)
        self.show_all()
        self.present()
        GLib.timeout_add(50, self.reposition_after_map, x, y,
                         bounds.x, bounds.y, bounds.width, bounds.height)
        GLib.timeout_add(80, self.activate_after_map)
        self.list_box.grab_focus()
        row = self.list_box.get_row_at_index(0)
        if row:
            self.list_box.select_row(row)

    def select_tab(self, key):
        self.tab = key
        self.search.set_text("")
        self.refresh()
        # The templates list is often much shorter than history.
        if self.get_visible():
            _x, _y = self.get_position()
            display = Gdk.Display.get_default()
            bounds = display.get_monitor_at_point(_x, _y).get_workarea()
            target_height = min(bounds.height, 730, max(170, 85 + 21 * max(1, len(self.rows))))
            self.set_size_request(self.app.config.values["popup_width"], target_height)
            self.resize(self.app.config.values["popup_width"], target_height)
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
            total = self.app.history.count(self.search.get_text())
            self.status.set_text(f"履歴1 (1〜{len(entries)}件 / {total}件中)")
        else:
            for template in self.app.config.values["templates"]:
                expanded = render_template(template["body"])
                if query in (template["name"] + " " + expanded).casefold():
                    self.rows.append((template["name"], expanded, expanded, template["id"]))
            self.status.set_text(f"定型文 ({len(self.rows)}件)")
        self.header_summary.set_text(
            f"{self.app.config.values['visible_history']}件 / {self.app.config.values['max_history']}件")
        for index, (title, subtitle, _value, _id) in enumerate(self.rows):
            row = Gtk.ListBoxRow()
            row.get_style_context().add_class("clibor-row")
            line = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
            line.get_style_context().add_class("clibor-rowbox")
            row.add(line)
            number = Gtk.Label(label=f"{shortcut_label(index)}:", xalign=0)
            number.set_size_request(23, -1)
            number.get_style_context().add_class("clibor-number")
            line.pack_start(number, False, False, 0)
            label_text = title if self.tab == "history" else f"{title}  {subtitle}"
            main = Gtk.Label(label=" ".join(label_text.splitlines()), xalign=0)
            main.set_ellipsize(Pango.EllipsizeMode.END)
            main.set_max_width_chars(42)
            main.get_style_context().add_class("clibor-preview")
            line.pack_start(main, True, True, 0)
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
            if name.lower() in "1234567890abcdefghijklmnopqrstuvwxyz" and not event.state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.MOD1_MASK):
                row_index = "1234567890abcdefghijklmnopqrstuvwxyz".index(name.lower())
                if row_index < len(self.rows):
                    self.accept(row_index)
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
        self.switch(body, "外側をクリックしたら閉じる", "close_on_outside_click", "既定では外側クリックで閉じます")
        self.switch(body, "カーソル位置を基準に開く", "popup_follow_cursor", "ポップアップ左下をカーソルに合わせ、画面端では自動反転")
        self.section(body, "起動キー")
        hotkey_help = Gtk.Label(label="左右どちらのキーも選べます。同じキーを短く2回押すと起動します。", xalign=0)
        hotkey_help.set_line_wrap(True)
        hotkey_help.get_style_context().add_class("clibor-subtle")
        body.pack_start(hotkey_help, False, False, 0)
        self.switch(body, "Ctrlを2回押す", "hotkey_ctrl")
        self.switch(body, "Alt／AltGrを2回押す", "hotkey_alt")
        self.switch(body, "Shiftを2回押す", "hotkey_shift")
        self.number(body, "修飾キー2回の判定時間（ms）", "double_tap_ms", 200, 800, 25)
        self.number(body, "自動貼り付けの待機時間（ms）", "paste_delay_ms", 40, 1500, 20)
        self.section(body, "履歴と表示")
        self.number(body, "保存する最大件数", "max_history", 10, 10000, 10)
        self.number(body, "画面に表示する件数", "visible_history", 5, 50, 1)
        self.number(body, "ポップアップの横幅（px）", "popup_width", 260, 850, 10)
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
        sw.set_active(not self.app.config.values["sticky_popup"] if key == "close_on_outside_click"
                      else self.app.config.values[key])
        sw.connect("notify::active", lambda widget, _prop: self.set_value(
            "sticky_popup" if key == "close_on_outside_click" else key,
            not widget.get_active() if key == "close_on_outside_click" else widget.get_active()))
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
        self.key_listener = XRecordListener(
            self.toggle_popup, self.config.values["double_tap_ms"],
            self.popup.dismiss_on_outside_click, lambda: self.config.values)
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
                pid = call_xdotool("getwindowpid", active) if active else None
                target = (active, pid) if active and pid else None
                self.insert(render_template(template["body"]), target)
        return False

    def quit(self):
        self.ipc.close()
        self.history.close()
        Gtk.main_quit()


def main():
    help_text = """Clibor Lite (GNOME 46 / X11)
使用法: clibor-lite [run|show|templates|settings|paste-template ID|clear-history|stop]
既定: run (通常は自動起動)。 Ctrl / Alt / Shift × 2 で履歴を開きます。
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
