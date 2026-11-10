"""How the cut feels: a safe noise threshold, laughs kept as part of the line, a breath at the end of a sentence."""
import numpy as np

from reelengine import audio_env as ae, cut


def env_with(spans, seconds=4.0, floor=0.002, loud=0.2):
    env = np.full(int(seconds * ae.PER), floor, dtype=np.float32)
    for s, e in spans:
        env[int(s * ae.PER):int(e * ae.PER)] = loud
    return env


def test_the_threshold_stays_in_a_safe_window():
    assert ae.noise_threshold(np.full(400, 0.0001, dtype=np.float32)) == ae.THRESH_MIN      # a silent room
    assert ae.noise_threshold(np.full(400, 0.05, dtype=np.float32)) == ae.THRESH_MAX        # a car, a cafe
    assert ae.THRESH_MIN < ae.noise_threshold(np.full(400, 0.004, dtype=np.float32)) < ae.THRESH_MAX


def test_a_laugh_between_two_words_is_marked_as_sound():
    words = [{"id": "w0", "w": "punchline.", "s": 0.5, "e": 1.0, "source": "s1"},
             {"id": "w1", "w": "Anyway", "s": 2.4, "e": 2.8, "source": "s1"}]
    env = env_with([(0.5, 1.0), (1.2, 1.8), (2.4, 2.8)])                 # 0.6 s of laughing in the gap
    out = ae.mark_sounds(words, env, 0.02)
    assert out[0]["sound"] == [1.2, 1.8]
    assert "sound" not in out[1]
    breath = ae.mark_sounds(words, env_with([(0.5, 1.0), (1.3, 1.4), (2.4, 2.8)]), 0.02)
    assert "sound" not in breath[0]                                       # a 0.1 s breath is not a laugh


def _kept(words, gap_cap=0.12):
    pieces = cut.plan_run(words, 0, len(words) - 1, gap_cap, cut.MIN_SAVING, 30.0, 10.0, False, False)
    return sum(e - s for s, e in pieces), pieces


def test_the_cut_keeps_the_laugh_and_cuts_only_the_silence_after_it():
    words = [{"id": "w0", "w": "punchline", "s": 0.5, "e": 1.0, "source": "s1", "sound": [1.2, 1.8]},
             {"id": "w1", "w": "anyway", "s": 3.0, "e": 3.4, "source": "s1"}]
    _total, pieces = _kept(words)
    covered = lambda t: any(s <= t <= e for s, e in pieces)
    assert covered(1.5) and covered(1.79)                                 # the laugh plays
    assert not covered(2.5)                                               # the silence after it is gone


def test_a_sentence_end_keeps_a_breath_a_mid_sentence_pause_is_tight():
    mid = [{"id": "w0", "w": "and", "s": 0.5, "e": 1.0, "source": "s1"}, {"id": "w1", "w": "then", "s": 2.0, "e": 2.4, "source": "s1"}]
    end = [{"id": "w0", "w": "done.", "s": 0.5, "e": 1.0, "source": "s1"}, {"id": "w1", "w": "Then", "s": 2.0, "e": 2.4, "source": "s1"}]
    t_mid, _ = _kept(mid)
    t_end, _ = _kept(end)
    assert abs((t_end - t_mid) - (cut.SENTENCE_BREATH - 0.12)) < 0.07     # only the breath is added


def test_voice_polish_is_on_unless_the_look_turns_it_off():
    from reelengine import render
    assert render.voice_polish({}) == render.VOICE_POLISH
    assert "equalizer=f=3000" in render.VOICE_POLISH and "acompressor" in render.VOICE_POLISH
    assert render.voice_polish({"look": {"voicePolish": False}}) == ""


def test_pictures_land_after_their_word_text_cards_before():
    from reelengine import broll
    assert broll.PICTURE_DELAY == 0.2 and broll.LEAD > 0
    assert "card-above-head" in broll.PICTURE_TREATMENTS and "text-pop" not in broll.PICTURE_TREATMENTS
