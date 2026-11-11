import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from clibor_lite.core import Config, DoubleCtrlDetector, History, render_template, sanitize_settings


class DetectorTests(unittest.TestCase):
    def new(self):
        return DoubleCtrlDetector(350)

    def test_two_clean_taps(self):
        d = self.new()
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.0))
        self.assertFalse(d.handle(False, 37, {37, 105}, 1.05))
        self.assertFalse(d.handle(True, 37, {37, 105}, 1.2))
        self.assertTrue(d.handle(False, 37, {37, 105}, 1.25))

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

    def test_repeat_press_not_accepted(self):
        d = self.new()
        d.handle(True, 37, {37}, 1)
        d.handle(True, 37, {37}, 1.01)
        d.handle(False, 37, {37}, 1.03)
        d.handle(True, 37, {37}, 1.15)
        self.assertTrue(d.handle(False, 37, {37}, 1.18))


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
        self.assertEqual(c['double_tap_ms'], 650)
        self.assertTrue(c['save_history'])
        self.assertEqual(c['templates'], [])


if __name__ == '__main__':
    unittest.main()
