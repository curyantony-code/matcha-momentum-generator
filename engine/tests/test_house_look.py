"""The house look: every take of every video matched to the light of one take the person liked."""
import json
import re

from reelengine import autocolor

HOUSE = {"y": 145.6, "u": 116.7, "v": 141.1, "lo": 70.0, "hi": 194.8, "sat": 17.6}   # measured 2026-11-04


def _num(chain: str, name: str) -> float:
    return float(re.search(rf"{name}=([\d.-]+)", chain).group(1))


def test_a_take_that_already_matches_is_left_alone():
    assert autocolor.correction(dict(HOUSE), HOUSE) is None
    assert autocolor.correction({**HOUSE, "sat": HOUSE["sat"] * 1.02}, HOUSE) is None   # inside the dead zone


def test_a_dark_flat_oversaturated_warm_take_is_pulled_to_the_house_look():
    # the numbers of a real take made darker, flatter, more saturated and warm, then measured
    bad = {"y": 123.7, "u": 108.0, "v": 147.6, "lo": 62.0, "hi": 166.6, "sat": 28.3}
    chain = autocolor.correction(bad, HOUSE)
    assert _num(chain, "gamma") > 1.0                     # brighter
    assert _num(chain, "contrast") > 1.0                  # more range
    assert _num(chain, "saturation") < 1.0                # calmer colour
    assert "u='clip(val-(-7.0)" in chain and "v='clip(val-(5.2)" in chain     # 80 % of the cast
    assert chain.index("lutyuv") < chain.index("eq=")     # cast first, then the light


def test_every_move_is_capped_so_a_bad_take_is_helped_not_remade():
    awful = {"y": 30.0, "u": 90.0, "v": 170.0, "lo": 20.0, "hi": 60.0, "sat": 80.0}
    chain = autocolor.correction(awful, HOUSE)
    assert _num(chain, "gamma") == autocolor.GAMMA_MAX
    assert _num(chain, "contrast") == autocolor.HOUSE_CONTRAST[1]
    assert _num(chain, "saturation") == autocolor.HOUSE_SATURATION[0]
    assert f"u='clip(val-(-{autocolor.HOUSE_CAST_MAX:.1f})" in chain


def test_without_a_house_look_or_an_old_measurement_it_is_the_plain_fix():
    old = {"y": 95.0, "u": 128.0, "v": 133.0}             # cached before contrast and saturation were measured
    assert autocolor.correction(old, HOUSE) == autocolor.correction(old)
    assert autocolor.correction({**HOUSE, "y": 95.0}) == autocolor.correction({**HOUSE, "y": 95.0}, None)


def test_parse_reads_the_contrast_range_and_saturation_too():
    text = "\n".join(f"lavfi.signalstats.{k}={v}" for k, v in
                     (("YAVG", 140), ("UAVG", 118), ("VAVG", 140), ("YLOW", 60), ("YHIGH", 200), ("SATAVG", 20)) * 2)
    assert autocolor.parse_stats(text) == {"y": 140.0, "u": 118.0, "v": 140.0, "lo": 60.0, "hi": 200.0, "sat": 20.0, "frames": 2}


def test_the_house_look_is_read_from_the_library_and_ignored_when_broken(tmp_path):
    lib = tmp_path / "Library"
    lib.mkdir()
    assert autocolor.house_look(tmp_path) is None
    (lib / autocolor.HOUSE_FILE).write_text(json.dumps({"stats": HOUSE, "from": {"project": "Day 1"}}))
    assert autocolor.house_look(tmp_path) == HOUSE
    (lib / autocolor.HOUSE_FILE).write_text(json.dumps({"stats": {"y": 1}}))
    assert autocolor.house_look(tmp_path) is None
    (lib / autocolor.HOUSE_FILE).write_text("not json")
    assert autocolor.house_look(tmp_path) is None


def test_an_hdr_measurement_is_kept_apart_from_the_standard_one(tmp_path):
    f = tmp_path / "take.mov"
    f.write_bytes(b"x")
    assert autocolor._key(f) != autocolor._key(f, hdr=True)
