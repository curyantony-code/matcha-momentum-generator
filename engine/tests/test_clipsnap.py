"""Snapping a proposed clip to natural cut points. Pure logic: no ffmpeg, no media."""
from reelengine import clipsnap


def mk(*items):
    return [{"id": f"w{i}", "source": "s1", "s": s, "e": e, "w": w} for i, (s, e, w) in enumerate(items)]


SENTENCES = mk((10.0, 10.4, "That"), (10.5, 11.0, "failed."), (12.0, 12.4, "Here's"), (12.5, 13.0, "why"),
               (13.1, 13.6, "it"), (13.7, 14.2, "matters."), (15.0, 15.4, "Next"), (15.5, 16.0, "topic."))


def test_parse_silences_reads_ffmpeg_stderr():
    stderr = ("[silencedetect @ 0x1] silence_start: 1.5\n"
              "[silencedetect @ 0x1] silence_end: 2.25 | silence_duration: 0.75\n"
              "noise\n[silencedetect @ 0x1] silence_start: 9\n")
    assert clipsnap.parse_silences(stderr) == [(1.5, 2.25)]


def test_start_prefers_a_sentence_start_nearby():
    assert clipsnap.snap_start(SENTENCES, 12.6) == 12.0


def test_start_is_unchanged_when_no_word_is_near():
    assert clipsnap.snap_start(SENTENCES, 50.0) == 50.0


def test_end_extends_to_the_finish_of_the_sentence_and_pads():
    assert clipsnap.snap_end(SENTENCES, 13.2) == 14.5


def test_end_falls_back_to_nearest_word_without_a_sentence_end():
    words = mk((1.0, 1.5, "no"), (1.6, 2.0, "punctuation"), (2.1, 2.5, "here"))
    assert clipsnap.snap_end(words, 2.1) == 2.3


def test_segment_never_cuts_into_the_last_word_for_a_silence():
    # Silence midpoint 13.95 falls inside the padded end region and just before the word's end.
    start, end = clipsnap.snap_segment(SENTENCES, [(13.9, 14.0)], 12.0, 14.1, 100.0, min_len=1.0)
    assert end >= 14.2


def test_segment_silence_does_not_jump_over_words():
    # Midpoint 16.25 is inside the 2 s search window but past the next word, which starts at 15.0.
    _, end = clipsnap.snap_segment(SENTENCES, [(16.1, 16.4)], 12.0, 14.2, 100.0, min_len=1.0)
    assert end == 14.5
    _, end = clipsnap.snap_segment(SENTENCES, [(14.5, 15.0)], 12.0, 14.2, 100.0, min_len=1.0)
    assert end == 14.75


def test_segment_start_silence_does_not_jump_over_words():
    # Midpoint 10.55 is inside the 1.5 s search window but before "failed.", which ends at 11.0.
    start, _ = clipsnap.snap_segment(SENTENCES, [(10.4, 10.7)], 12.0, 14.2, 100.0, min_len=1.0)
    assert start == 12.0
    start, _ = clipsnap.snap_segment(SENTENCES, [(11.2, 11.8)], 12.0, 14.2, 100.0, min_len=1.0)
    assert start == 11.5


def test_parse_segments_keeps_valid_ones_and_their_titles():
    out = clipsnap.parse_segments({"segments": [{"start": 1, "end": 20, "title": "Why"}]}, 100.0)
    assert out == [{"start": 1.0, "end": 20.0, "title": "Why"}]


def test_parse_segments_refuses_bad_input():
    for bad in ({}, {"segments": []}, {"segments": "x"}, {"segments": [{"start": 5, "end": 2}]},
                {"segments": [{"start": -1, "end": 2}]}, {"segments": [{"start": 200, "end": 210}]},
                {"segments": [{"start": True, "end": 2}]}):
        try:
            clipsnap.parse_segments(bad, 100.0)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")


def test_too_long_clip_ends_after_a_whole_word():
    words = mk(*[(i * 1.0, i + 0.8, "word") for i in range(100)])
    start, end = clipsnap.snap_segment(words, [], 0.0, 90.0, 200.0, max_len=60.0)
    assert end - start <= 60.0
    assert any(abs(end - (w["e"] + clipsnap.END_PAD)) < 1e-6 for w in words)


def test_too_short_clip_grows_to_a_whole_word():
    words = mk(*[(i * 1.0, i + 0.8, "word") for i in range(20)])
    start, end = clipsnap.snap_segment(words, [], 2.0, 3.0, 20.0, min_len=5.0)
    assert end - start >= 5.0
    assert any(abs(end - (w["e"] + clipsnap.END_PAD)) < 1e-6 for w in words)


def test_clip_stays_inside_the_video():
    start, end = clipsnap.snap_segment(SENTENCES, [], 12.0, 16.0, 16.1, min_len=1.0)
    assert 0.0 <= start < end <= 16.1


def test_a_moment_at_the_very_end_still_gives_a_full_clip():
    words = mk(*[(i * 1.0, i + 0.8, "word") for i in range(20)])
    start, end = clipsnap.snap_segment(words, [], 19.9, 20.0, 20.0, min_len=5.0)
    assert end - start >= 5.0
    assert end <= 20.0


def test_input_words_are_not_changed():
    words = mk((1.0, 2.0, "Same."))
    before = [dict(w) for w in words]
    clipsnap.snap_segment(words, [], 1.0, 2.0, 10.0, min_len=0.5)
    assert words == before
