"""`tools.filters()` reads `ffmpeg -filters` from ffmpeg 7 (3-character flags) and ffmpeg 8 (2-character flags)."""
import types

from reelengine import tools

FFMPEG7 = """Filters:
  T.. = Timeline support
  ---
 TSC aap               AA->A      Apply Affine Projection algorithm.
 ..C signalstats       V->V       Generate statistics from video analysis.
 ... zscale            V->V       Apply resizing, colorspace and bit depth conversion.
"""
FFMPEG8 = """Filters:
  T. = Timeline support
  ------
 TS aap               AA->A      Apply Affine Projection algorithm.
 .S signalstats       V->V       Generate statistics from video analysis.
 .. scale_cuda        V->V       GPU accelerated video resizer.
"""


def _names(monkeypatch, listing):
    monkeypatch.setitem(tools._CACHE, "filters", None)
    tools._CACHE.pop("filters")
    monkeypatch.setattr(tools, "ffmpeg", lambda: "ffmpeg")
    monkeypatch.setattr(tools, "text_run", lambda *a, **k: types.SimpleNamespace(stdout=listing))
    return tools.filters()


def test_ffmpeg_7_listing(monkeypatch):
    assert _names(monkeypatch, FFMPEG7) == {"aap", "signalstats", "zscale"}


def test_ffmpeg_8_listing(monkeypatch):
    assert _names(monkeypatch, FFMPEG8) == {"aap", "signalstats", "scale_cuda"}


def test_the_legend_lines_are_not_filters(monkeypatch):
    assert "=" not in _names(monkeypatch, FFMPEG8)
