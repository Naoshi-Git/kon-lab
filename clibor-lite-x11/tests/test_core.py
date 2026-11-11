import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from clibor_lite.core import (Config, DoubleCtrlDetector, History, is_same_window, shortcut_label,
                              choose_popup_position, point_in_window, popup_activation_args,
                              render_template, sanitize_settings, selected_modifier_codes)


class DetectorTests(unittest.TestCase):
    def new(self):
        return DoubleCtrlDetector(350)

    def test_two_clean_taps(self):
        d = self.new()
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.0))
        self.assertFalse(d.handle(False, 37, {37, 105}, 1.05))
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.2))
        self.assertTrue(d.handle(False, 37, {37, 105}, 1.25))

    def test_two_clean_right_ctrl_taps(self):
        d = self.new()
        self.assertFalse(d.handle(True, 105, {37, 105}, 1.0))
        self.assertFalse(d.handle(False, 105, {37, 105}, 1.05))
        self.assertFalse(d.handle(True, 105, {37, 105}, 1.2))
        self.assertTrue(d.handle(False, 105, {37, 105}, 1.25))

    def test_holding_both_ctrl_keys_is_a_chord(self):
        d = self.new()
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.0))
        self.assertFalse(d.handle(True, 105, {37, 105}, 1.02))
        self.assertFalse(d.handle(False, 37, {37, 105}, 1.05))
        self.assertFalse(d.handle(False, 105, {37, 105}, 1.08))
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.2))
        self.assertFalse(d.handle(False, 37, {37, 105}, 1.25))

    def test_too_slow(self):
        d = self.new()
        for t in (1., 1.05, 1.6):
            self.assertFalse(d.handle(t in (1., 1.6), 37, {37}, t))
        self.assertFalse(d.handle(False, 37, {37}, 1.65))

    def test_ctrl_c_cannot_trigger(self):
        d = self.new()
        d.handle(True, 37, {37}, 1)
        d.handle(True, 54, {37}, 1.02)
        d.handle(False, 54, {37}, 1.05)
        d.handle(False, 37, {37}, 1.08)
        d.handle(True, 37, {37}, 1.2)
        self.assertFalse(d.handle(False, 37, {37}, 1.25))

    def test_switch_ctrl_sides_not_trigger(self):
        d = self.new()
        d.handle(True, 37, {37, 105}, 1)
        d.handle(False, 37, {37, 105}, 1.05)
        d.handle(True, 105, {37, 105}, 1.1)
        self.assertFalse(d.handle(False, 105, {37, 105}, 1.15))

    def test_other_key_resets_previous_tap(self):
        d = self.new()
        d.handle(True, 37, {37}, 1)
        d.handle(False, 37, {37}, 1.05)
        d.handle(True, 50, {37}, 1.1)
        d.handle(False, 50, {37}, 1.11)
        d.handle(True, 37, {37}, 1.2)
        self.assertFalse(d.handle(False, 37, {37}, 1.25))

    def test_ctrl_taps_while_shift_held_do_not_trigger(self):
        d = self.new()
        d.handle(True, 50, {37}, .9)  # Shift pressed before Ctrl
        d.handle(True, 37, {37}, 1)
        d.handle(False, 37, {37}, 1.05)
        d.handle(True, 37, {37}, 1.2)
        self.assertFalse(d.handle(False, 37, {37}, 1.25))
        d.handle(False, 50, {37}, 1.3)

    def test_alt_tab_cannot_trigger(self):
        d = self.new()
        keys = {64, 108}
        d.handle(True, 64, keys, 1.0)
        d.handle(True, 23, keys, 1.02)
        d.handle(False, 23, keys, 1.05)
        self.assertFalse(d.handle(False, 64, keys, 1.08))
        d.handle(True, 64, keys, 1.2)
        self.assertFalse(d.handle(False, 64, keys, 1.25))

    def test_shift_letter_cannot_trigger(self):
        d = self.new()
        keys = {50, 62}
        d.handle(True, 50, keys, 1.0)
        d.handle(True, 38, keys, 1.02)
        d.handle(False, 38, keys, 1.05)
        self.assertFalse(d.handle(False, 50, keys, 1.08))
        d.handle(True, 50, keys, 1.2)
        self.assertFalse(d.handle(False, 50, keys, 1.25))

    def test_repeat_press_not_accepted(self):
        d = self.new()
        d.handle(True, 37, {37}, 1)
        d.handle(True, 37, {37}, 1.01)
        d.handle(False, 37, {37}, 1.03)
        d.handle(True, 37, {37}, 1.15)
        self.assertTrue(d.handle(False, 37, {37}, 1.18))


class ModifierExpansionTests(unittest.TestCase):
    def test_modifier_double_tap_selection_defaults_to_ctrl_only(self):
        cfg = sanitize_settings({})
        groups = {"ctrl": {37, 105}, "alt": {64, 108, 92}, "shift": {50, 62}}
        self.assertEqual(selected_modifier_codes(groups, cfg), {37, 105})

    def test_modifier_double_tap_selection_is_configurable(self):
        cfg = sanitize_settings({"hotkey_ctrl": False, "hotkey_alt": True, "hotkey_shift": True})
        groups = {"ctrl": {37, 105}, "alt": {64, 108, 92}, "shift": {50, 62}}
        self.assertEqual(selected_modifier_codes(groups, cfg), {64, 108, 92, 50, 62})

    def test_alt_double_tap(self):
        d = DoubleCtrlDetector(500)
        keys = {37, 105, 64, 108, 50, 62}
        d.handle(True, 64, keys, 1.0)
        d.handle(False, 64, keys, 1.04)
        d.handle(True, 64, keys, 1.16)
        self.assertTrue(d.handle(False, 64, keys, 1.20))

    def test_right_alt_double_tap(self):
        d = DoubleCtrlDetector(500)
        keys = {37, 105, 64, 108, 50, 62}
        d.handle(True, 108, keys, 1.0)
        d.handle(False, 108, keys, 1.04)
        d.handle(True, 108, keys, 1.16)
        self.assertTrue(d.handle(False, 108, keys, 1.20))

    def test_shift_double_tap(self):
        d = DoubleCtrlDetector(500)
        keys = {37, 105, 64, 108, 50, 62}
        d.handle(True, 50, keys, 1.0)
        d.handle(False, 50, keys, 1.04)
        d.handle(True, 50, keys, 1.13)
        self.assertTrue(d.handle(False, 50, keys, 1.17))

    def test_right_shift_double_tap(self):
        d = DoubleCtrlDetector(500)
        keys = {37, 105, 64, 108, 50, 62}
        d.handle(True, 62, keys, 1.0)
        d.handle(False, 62, keys, 1.04)
        d.handle(True, 62, keys, 1.13)
        self.assertTrue(d.handle(False, 62, keys, 1.17))

    def test_mixed_modifiers_do_not_trigger(self):
        d = DoubleCtrlDetector(500)
        keys = {37, 64, 50}
        d.handle(True, 37, keys, 1.0)
        d.handle(False, 37, keys, 1.05)
        d.handle(True, 64, keys, 1.15)
        self.assertFalse(d.handle(False, 64, keys, 1.20))

    def test_shortcuts_match_clibor_row_labels(self):
        self.assertEqual([shortcut_label(i) for i in (0, 8, 9, 10, 29)],
                         ["1", "9", "0", "a", "t"])

    def test_compact_defaults_and_position_sanitizer(self):
        cfg = sanitize_settings({"popup_x": 123, "popup_y": -25, "sticky_popup": False})
        self.assertEqual(cfg["popup_width"], 300)
        self.assertEqual(cfg["visible_history"], 30)
        self.assertEqual(cfg["double_tap_ms"], 500)
        self.assertEqual((cfg["popup_x"], cfg["popup_y"]), (123, -25))
        self.assertFalse(cfg["sticky_popup"])



class PopupGeometryTests(unittest.TestCase):
    def test_popup_activation_is_nonblocking(self):
        args = popup_activation_args(12345)
        self.assertEqual(args, ("windowactivate", "12345"))
        self.assertNotIn("--sync", args)

    def pos(self, cx, cy, width=300, height=350, work=(0, 0, 1920, 1080)):
        return choose_popup_position(cx, cy, width, height, *work)

    def test_cursor_is_bottom_left_by_default(self):
        self.assertEqual(self.pos(400, 800), (400, 450))

    def test_flip_to_bottom_right_at_right_edge(self):
        self.assertEqual(self.pos(1900, 800), (1600, 450))

    def test_flip_to_top_left_near_top_edge(self):
        self.assertEqual(self.pos(400, 30), (400, 30))

    def test_flip_to_top_right_at_top_right_corner(self):
        self.assertEqual(self.pos(1900, 30), (1600, 30))

    def test_negative_origin_multi_monitor(self):
        self.assertEqual(self.pos(-1450, 800, work=(-1920, 0, 1920, 1080)),
                         (-1450, 450))

    def test_clamp_when_no_exact_corner_can_fit(self):
        x, y = self.pos(50, 50, width=500, height=500, work=(0, 0, 320, 240))
        self.assertEqual((x, y), (0, 0))

    def test_click_inside_and_outside_bounds(self):
        self.assertTrue(point_in_window(200, 200, 100, 100, 300, 200))
        self.assertFalse(point_in_window(99, 200, 100, 100, 300, 200))
        self.assertFalse(point_in_window(400, 200, 100, 100, 300, 200))

    def test_old_sticky_config_is_migrated_to_outside_click_default(self):
        with tempfile.TemporaryDirectory() as d:
            from pathlib import Path
            path = Path(d) / "config.json"
            path.write_text('{"sticky_popup": true, "popup_width": 400}', encoding="utf-8")
            config = Config(path)
            self.assertFalse(config.values["sticky_popup"])
            self.assertTrue(config.values["popup_follow_cursor"])
            self.assertEqual(config.values["popup_width"], 400)
            config.save()
            config.values["sticky_popup"] = True
            config.save()
            self.assertTrue(Config(path).values["sticky_popup"])


class PasteTargetTests(unittest.TestCase):
    def test_accepts_only_original_window_and_process(self):
        self.assertTrue(is_same_window("4194305", "912", "4194305", "912"))
        self.assertFalse(is_same_window("4194305", "912", "4194306", "912"))
        self.assertFalse(is_same_window("4194305", "912", "4194305", "913"))

    def test_missing_window_metadata_fails_closed(self):
        self.assertFalse(is_same_window("4194305", "912", None, None))
        self.assertFalse(is_same_window("4194305", None, "4194305", "912"))


class TemplateTests(unittest.TestCase):
    def test_date_macros(self):
        now = datetime(2026, 11, 11, 16, 7)
        self.assertEqual(render_template("{date:%y%m%d}", now), "261111")
        self.assertEqual(render_template("{date:%y%m%d-%H%M}", now), "261111-1607")
        self.assertEqual(render_template("A-{date:%Y-%m-%d}-B", now), "A-2026-11-11-B")

    def test_no_code_evaluation(self):
        self.assertEqual(render_template("{something} {date:%Y}" , datetime(2026,1,1)), "{something} 2026")


class StorageTests(unittest.TestCase):
    def test_mru_dedup_trim_and_unicode(self):
        with tempfile.TemporaryDirectory() as d:
            h = History(Path(d)/"h.sqlite3", limit=3)
            for text in ("A", "日本語", "B", "日本語", "C"):
                self.assertTrue(h.add(text))
            self.assertEqual([t for t, _ in h.list(limit=10)], ["C", "日本語", "B"])
            self.assertEqual([t for t, _ in h.list("本語")], ["日本語"])
            h.close()

    def test_empty_large_content_skipped(self):
        h = History(persist=False)
        self.assertFalse(h.add("  "))
        self.assertFalse(h.add("very long", max_chars=5))
        h.close()

    def test_persistent_permissions_and_clear(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"data"/"history.sqlite3"
            h = History(path, True)
            h.add("text")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            h.clear()
            self.assertEqual(h.list(), [])
            h.close()

    def test_config_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"private"/"config.json"
            c = Config(path)
            self.assertEqual(c.values['templates'][0]['id'], 'date-short')
            c.values['double_tap_ms'] = 400
            c.save()
            self.assertEqual(Config(path).values['double_tap_ms'], 400)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_invalid_config_is_sanitized(self):
        c = sanitize_settings({'max_history': -10, 'double_tap_ms': 20000, 'save_history': 'no',
                               'templates': [{'name':'missing-id', 'body':'a'}]})
        self.assertEqual(c['max_history'], 10)
        self.assertEqual(c['double_tap_ms'], 800)
        self.assertTrue(c['save_history'])
        self.assertEqual(c['templates'], [])


if __name__ == '__main__':
    unittest.main()
