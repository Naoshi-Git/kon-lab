"""GTK popup sizing regression tests; skipped when GTK or an X display is absent."""
import time
import unittest
from types import SimpleNamespace

try:
    import gi
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk, Gtk
    from clibor_lite import app as app_module
    from clibor_lite.core import sanitize_settings
except (ImportError, ValueError):  # Core-only CI environments do not need GTK.
    Gdk = Gtk = app_module = sanitize_settings = None


@unittest.skipIf(Gtk is None or not Gtk.init_check()[0], "GTK3 display unavailable")
class PopupSizingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        provider = Gtk.CssProvider()
        provider.load_from_data(app_module.CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def _open_with_dummy_rows(self, count):
        class DummyHistory:
            def list(self, _query, limit):
                return [(f"DUMMY ROW {i:02d}", "now") for i in range(min(count, limit))]

            def count(self, _query):
                return count

        config = SimpleNamespace(values=sanitize_settings({
            "popup_width": 300,
            "visible_history": 30,
            "sticky_popup": True,
            "templates": [],
        }))
        fake_app = SimpleNamespace(
            config=config, history=DummyHistory(), target_window=None,
            show_settings=lambda: None,
        )
        popup = app_module.HistoryPopup(fake_app)
        original_xdotool = app_module.call_xdotool
        app_module.call_xdotool = lambda *_args, **_kwargs: None
        try:
            popup.open()
        finally:
            app_module.call_xdotool = original_xdotool

        deadline = time.monotonic() + 0.3
        while time.monotonic() < deadline:
            while Gtk.events_pending():
                Gtk.main_iteration_do(False)
            time.sleep(0.005)
        return popup

    def test_open_shows_all_30_rows_without_vertical_scroll(self):
        popup = self._open_with_dummy_rows(30)
        try:
            self.assertEqual(len(popup.list_box.get_children()), 30)
            adjustment = popup.list_box.get_parent().get_parent().get_vadjustment()
            self.assertLessEqual(adjustment.get_upper(), adjustment.get_page_size() + 1)
            row_height = popup.list_box.get_row_at_index(0).get_allocated_height()
            for button in popup.tab_buttons.values():
                self.assertEqual(button.get_allocated_height(), row_height)
            self.assertEqual(
                popup.tab_buttons["history"].get_allocated_width(),
                popup.tab_buttons["templates"].get_allocated_width(),
            )
        finally:
            popup.destroy()
            while Gtk.events_pending():
                Gtk.main_iteration_do(False)

    def test_open_sizes_popup_for_all_17_rows(self):
        popup = self._open_with_dummy_rows(17)
        try:
            self.assertEqual(len(popup.list_box.get_children()), 17)
            adjustment = popup.list_box.get_parent().get_parent().get_vadjustment()
            self.assertLessEqual(adjustment.get_upper(), adjustment.get_page_size() + 1)
        finally:
            popup.destroy()
            while Gtk.events_pending():
                Gtk.main_iteration_do(False)


if __name__ == "__main__":
    unittest.main()
