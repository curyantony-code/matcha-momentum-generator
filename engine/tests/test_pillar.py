"""An upright take in a wide frame: shown whole in the middle over a blurred copy, never cropped to a band."""
from reelengine import broll, compose_util as cu, render

UPRIGHT = {"width": 1080, "height": 1920, "rotation": 0}
SIDEWAYS_STORED = {"width": 1920, "height": 1080, "rotation": 90}       # an iPhone file: stored on its side
WIDE = {"width": 1920, "height": 1080, "rotation": 0}


def test_only_an_upright_take_in_a_wide_frame_gets_blurred_sides():
    assert render.is_pillar_take(UPRIGHT, 1920, 1080)
    assert render.is_pillar_take(SIDEWAYS_STORED, 1920, 1080)
    assert not render.is_pillar_take(WIDE, 1920, 1080)          # a sideways take simply fills the frame
    assert not render.is_pillar_take(UPRIGHT, 1080, 1920)       # a vertical video stays as it always was
    assert not render.is_pillar_take(WIDE, 1080, 1920)


def test_the_take_stands_full_height_in_the_middle():
    fw, xo = cu.pillar_geometry(1080, 1920, 1920, 1080)
    assert (fw, xo) == (608, 656)                               # 1080 * 1080 / 1920 = 607.5 -> 608, centred


def test_the_virtual_window_maps_the_face_to_where_it_really_is():
    rect = cu.pillar_rect(1080, 1920, 1920, 1080)
    assert rect[0] < 0 and rect[2] > 1080                       # wider than the take: it starts left of its edge
    # the take's own corners land on the edges of the centred column
    left = cu.map_box_rect((0, 0, 1080, 1920), rect, 1920, 1080)
    assert abs(left[0] - 656) < 1 and abs(left[2] - 607.5) < 1 and abs(left[3] - 1080) < 1
    face = cu.map_box_rect((340, 600, 400, 400), rect, 1920, 1080)
    assert 656 < face[0] < 656 + 608 and abs(face[2] - 225) < 1   # in the column, scaled by 1080/1920
    flipped = cu.map_box_rect((340, 600, 400, 400), rect, 1920, 1080, mirror=True)
    assert abs((flipped[0] + flipped[2] / 2) - (1920 - (face[0] + face[2] / 2))) < 1


def test_the_render_chain_blurs_a_copy_behind_the_take_with_its_own_labels():
    chain = render.reframe_filter(SIDEWAYS_STORED, 1920, 1080, None, False, uid="s3")
    assert chain.startswith("scale=1080:608")                  # stored pixels scaled first, then turned
    assert "transpose=clock" in chain and "crop=" in chain      # the crop is only the blurred copy's
    assert "split=2[pfs3][pbs3]" in chain and chain.endswith("[pgs3][pfs3]overlay=656:0")
    assert "gblur" in chain and cu.PILLAR_DIM in chain
    plain = render.reframe_filter(WIDE, 1920, 1080, None, False)
    assert "split" not in plain and "overlay" not in plain


def test_a_card_reads_as_well_in_a_wide_frame_as_in_a_phone_frame():
    # the same 450 px card: readable in a 1080-wide phone frame, and now in a 1920 x 1080 one too
    assert broll.readable(450, 300, 1080, 1920, False, {}, photo=True)
    assert broll.readable(450, 300, 1920, 1080, False, {}, photo=True)
