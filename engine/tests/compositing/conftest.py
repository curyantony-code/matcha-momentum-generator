import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))       # engine/
sys.path.insert(0, str(Path(__file__).resolve().parent))           # fixtures


def pytest_configure(config):
    config.addinivalue_line("markers", "real: reads real takes/music in place; skips if absent")


@pytest.fixture(autouse=True)
def _pictures_in_front_at_full_size(monkeypatch):
    """These tests measure where a picture drawn IN FRONT of the speaker goes, at its full size. The default look
    (pictures behind the speaker, at broll.PICTURE_SIZE) has its own tests in tests/test_pictures_behind.py."""
    from reelengine import broll
    monkeypatch.setattr(broll, "PICTURE_SIZE", 1.0)
    monkeypatch.setattr(broll, "pictures_behind", lambda look: False)
