"""Study other creators' short videos: `study-fetch`, `study-measure`, `study-list`.

fetch    yt-dlp (as a library) downloads one public Instagram / TikTok / YouTube Short to
         <dir>/video.mp4 and writes <dir>/source.json.
measure  transcribes it with word timings, finds the cuts, grabs a few frames and writes
         <dir>/measure.json. The app's AI does the breakdown; this file only measures.
list     yt-dlp extract_flat lists a creator's latest videos (no downloads).

Everything the engine writes lands inside the folder the caller gave as --out, under fixed names
(video.mp4, source.json, measure.json, frames/, work/). `out_dir()` refuses anything else.

Music heuristic (`musicLikely`): the 16 kHz mono audio is read as a 10 ms RMS envelope. Spans
between words (and the whole clip when nobody speaks) are "non-speech"; each is trimmed by 80 ms at
both ends so a word's release does not count. If the non-speech audio, taken together, has an RMS
above MUSIC_RMS (about -40 dBFS, well over a quiet room's floor) AND at least MUSIC_SHARE of its 10 ms
frames are above that level, something is playing under or between the words. Cheap and imperfect:
steady room noise or a loud fan can read as music, whispered music under speech can be missed.
"""
from __future__ import annotations

import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from . import project as projmod, tools
from .proto import EngineError, log, progress

MAX_DURATION = 600.0           # seconds; longer videos are refused
MAX_CAPTION = 2000
# a 10-minute 1080p video is well under this; it stops a long one whose length isn't known up front (Instagram)
MAX_BYTES = 600 * 1024 * 1024
LIST_DEFAULT, LIST_MAX = 30, 60
BROWSERS = ("chrome", "safari", "firefox", "edge", "brave")
BAD_URL_MSG = "That link isn't an Instagram, TikTok or YouTube video."
LOGIN_MSG = ("Instagram wants a login for this one. Turn on \"Use my browser's Instagram login\" "
             "and try again.")
FORMAT = ("bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][ext=mp4]/"
          "bv*[height<=1080]+ba/b[height<=1080]/b")

CUT_THRESHOLD = 0.3
MIN_SHOT = 0.25                # cuts closer than this to each other (or to the start) are noise
MAX_FRAMES = 8
HOOK_TIMES = (0.0, 1.5)
FRAME_WIDTH = 512
MIN_FRAME_GAP = 0.4
AFTER_CUT = 0.3                # a frame is taken this long after a cut, so the new shot has settled
MUSIC_RMS = 0.01              # about -40 dBFS
MUSIC_SHARE = 0.5
GAP_MIN = 0.3
GAP_TRIM = 0.08

# --- paths ---------------------------------------------------------------------------------------

FIXED_NAMES = ("video.mp4", "source.json", "measure.json", "frames", "work")


def out_dir(raw) -> Path:
    """The folder the caller gave. Created if missing; never the filesystem root; any fixed output
    name inside it that is a symlink leading elsewhere is refused (we would write through it)."""
    msg = "Matcha Momentum Generator didn't say where to put this video. Please try again."
    if not isinstance(raw, str) or not raw.strip() or "\x00" in raw:
        raise EngineError("BAD_OUT", "--out is required", msg)
    if any(part == ".." for part in raw.replace("\\", "/").split("/")):
        raise EngineError("BAD_OUT", f"'..' in --out: {raw!r}", msg)
    p = Path(raw)
    if not p.is_absolute():
        raise EngineError("BAD_OUT", f"--out must be an absolute folder: {raw!r}", msg)
    real = Path(os.path.realpath(p))
    if real == Path(real.anchor):
        raise EngineError("BAD_OUT", "--out is the filesystem root", msg)
    if real.exists() and not real.is_dir():
        raise EngineError("BAD_OUT", f"--out is a file: {real}", msg)
    real.mkdir(parents=True, exist_ok=True)
    for name in FIXED_NAMES:
        target = real / name
        if target.is_symlink() and not _inside(Path(os.path.realpath(target)), real):
            raise EngineError("BAD_OUT", f"{name} is a link leading outside {real}", msg)
    return real


def _inside(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


# --- urls ----------------------------------------------------------------------------------------

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


def _host(url: str) -> tuple:
    try:
        u = urlparse(url.strip())
    except ValueError:
        return "", []
    if u.scheme not in ("http", "https"):
        return "", []
    host = (u.hostname or "").lower()
    return host, [s for s in u.path.split("/") if s]


def detect_platform(url) -> str:
    """"instagram" | "tiktok" | "youtube" for a video link we accept, else EngineError BAD_URL."""
    bad = EngineError("BAD_URL", f"not a supported video link: {str(url)[:200]!r}", BAD_URL_MSG)
    if not isinstance(url, str):
        raise bad
    host, parts = _host(url)
    if not host:
        raise bad
    bare = host[4:] if host.startswith("www.") else host
    if bare in ("instagram.com", "m.instagram.com"):
        # /reel/ID, /p/ID, /reels/ID, and the /<user>/reel/ID form Instagram also produces
        rest = parts[1:] if len(parts) >= 3 and parts[1] in ("reel", "p") else parts
        if len(rest) >= 2 and rest[0] in ("reel", "p", "reels"):
            return "instagram"
        raise bad
    if bare in ("tiktok.com", "m.tiktok.com"):
        if len(parts) >= 3 and parts[0].startswith("@") and parts[1] == "video":
            return "tiktok"
        if len(parts) >= 2 and parts[0] == "t":
            return "tiktok"
        raise bad
    if host in ("vm.tiktok.com", "vt.tiktok.com") and parts:
        return "tiktok"
    if bare in ("youtube.com", "m.youtube.com"):
        if len(parts) >= 2 and parts[0] == "shorts" and _YT_ID.match(parts[1]):
            return "youtube"
        raise bad
    if bare == "youtu.be" and parts and _YT_ID.match(parts[0]):
        return "youtube"
    raise bad


def parse_profile(target, platform: Optional[str] = None) -> tuple:
    """(platform, handle, url to list) from a profile URL, or a bare @handle plus --platform."""
    bad = EngineError("BAD_URL", f"not a supported profile: {str(target)[:200]!r}",
                      "That isn't an Instagram, TikTok or YouTube profile.")
    if not isinstance(target, str) or not target.strip():
        raise bad
    t = target.strip()
    if "/" not in t and not t.startswith("http"):
        handle = t.lstrip("@")
        if not re.match(r"^[A-Za-z0-9._-]{1,100}$", handle) or platform not in ("tiktok", "youtube", "instagram"):
            raise EngineError("BAD_URL", f"handle {t!r} needs --platform", bad.user_message)
        return platform, handle, _profile_url(platform, handle)
    host, parts = _host(t)
    bare = host[4:] if host.startswith("www.") else host
    if bare in ("tiktok.com", "m.tiktok.com") and parts and parts[0].startswith("@") and len(parts[0]) > 1:
        return "tiktok", parts[0][1:], _profile_url("tiktok", parts[0][1:])
    if bare in ("youtube.com", "m.youtube.com") and parts and parts[0].startswith("@") and len(parts[0]) > 1:
        return "youtube", parts[0][1:], _profile_url("youtube", parts[0][1:])
    reserved = {"p", "reel", "reels", "explore", "stories", "accounts", "direct", "tv"}
    if bare in ("instagram.com", "m.instagram.com") and parts and parts[0] not in reserved:
        return "instagram", parts[0], _profile_url("instagram", parts[0])
    raise bad


def _profile_url(platform: str, handle: str) -> str:
    return {"tiktok": f"https://www.tiktok.com/@{handle}",
            "youtube": f"https://www.youtube.com/@{handle}/shorts",
            "instagram": f"https://www.instagram.com/{handle}/"}[platform]


# --- source.json shaping (pure) ------------------------------------------------------------------

def _int_or_none(v):
    try:
        return None if v is None or isinstance(v, bool) else int(v)
    except (TypeError, ValueError):
        return None


def _upload_date(info: dict) -> Optional[str]:
    d = info.get("upload_date")
    if isinstance(d, str) and re.fullmatch(r"\d{8}", d):
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    for key in ("timestamp", "release_timestamp"):
        ts = info.get(key)
        if isinstance(ts, (int, float)) and not isinstance(ts, bool):
            try:
                return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            except (OverflowError, OSError, ValueError):
                pass
    return None


def _creator_url(platform: str, handle: str, info: dict) -> Optional[str]:
    for key in ("uploader_url", "channel_url"):
        u = info.get(key)
        if isinstance(u, str) and u.startswith("http"):
            return u
    if not handle:
        return None
    return {"tiktok": f"https://www.tiktok.com/@{handle}",
            "instagram": f"https://www.instagram.com/{handle}/",
            "youtube": f"https://www.youtube.com/@{handle}"}[platform]


def shape_source(url: str, platform: str, info: dict) -> dict:
    """The source.json object from a yt-dlp info dict. Pure."""
    handle = ""
    order = {"instagram": ("channel", "uploader", "uploader_id"),     # uploader_id is a number there
             "tiktok": ("uploader", "channel", "uploader_id"),         # channel is the nickname
             "youtube": ("uploader_id", "channel", "uploader")}[platform]
    for key in order:
        v = info.get(key)
        if isinstance(v, str) and v.strip() and not v.strip().isdigit():
            handle = v.strip()
            break
    handle = handle.lstrip("@")
    caption = info.get("description")
    caption = caption.strip() if isinstance(caption, str) else ""
    title = info.get("title")
    title = title.strip() if isinstance(title, str) else ""
    if not title:
        title = caption.splitlines()[0][:120] if caption else ""
    try:
        duration = round(float(info.get("duration") or 0.0), 3)
    except (TypeError, ValueError):
        duration = 0.0
    return {"url": url, "platform": platform, "id": str(info.get("id") or ""),
            "creator": handle, "creatorUrl": _creator_url(platform, handle, info),
            "title": title, "caption": caption[:MAX_CAPTION],
            "views": _int_or_none(info.get("view_count")),
            "likes": _int_or_none(info.get("like_count")),
            "comments": _int_or_none(info.get("comment_count")),
            "durationSec": duration, "uploadedAt": _upload_date(info), "video": "video.mp4"}


# --- yt-dlp plumbing -----------------------------------------------------------------------------

# transport failures only: "Unable to download webpage" also wraps HTTP 404s and login walls, so it is not here
_NETWORK = ("urlopen error", "timed out", "temporary failure", "name resolution", "getaddrinfo",
            "network is unreachable", "connection reset", "connection refused", "connection aborted",
            "no route to host", "remote end closed", "ssl:", "failed to resolve", "offline")
_LOGIN = ("login required", "log in", "login", "rate-limit", "empty media response", "cookies",
          "not available", "sign in", "restricted video")
_GONE = ("private", "removed", "unavailable", "not available", "does not exist", "deleted",
         "no video", "not found", "has been terminated", "age-restricted", "geo", "copyright")
# reading the browser's cookie store failed (not yt-dlp's usual "use --cookies-from-browser" hint)
_COOKIE_FAIL = ("failed to decrypt", "keyring", "keychain", "cookie database", "cookies database",
                "could not find firefox", "could not find chrome", "could not find safari", "could not copy",
                "binarycookies")
_HTTP = re.compile(r"http error (\d{3})")


def map_ytdlp_error(exc: BaseException, platform: str, used_cookies: bool, listing: bool = False) -> EngineError:
    """Turn a yt-dlp failure into the friendly EngineError the app shows. HTTP status codes decide first."""
    raw = str(exc)
    low = raw.lower()
    detail = f"yt-dlp: {raw[-600:]}"
    gone = EngineError("UNAVAILABLE", detail, "That video isn't available. It may be private, removed, or not "
                                              "visible without logging in.")
    login = EngineError("LOGIN_NEEDED", detail, LOGIN_MSG)
    network = EngineError("NETWORK", detail, "I couldn't reach the site. Check your internet connection and try again.")
    if used_cookies and any(k in low for k in _COOKIE_FAIL):
        return EngineError("COOKIES_UNREADABLE", detail,
                           "I couldn't read your browser's login. Close the browser and try again, "
                           "or pick a different browser.")
    m = _HTTP.search(low)
    if m:
        code = int(m.group(1))
        if code in (404, 410):
            return gone
        if code in (401, 403):
            return login if platform == "instagram" and not used_cookies else gone
        if code == 429:
            return EngineError("RATE_LIMITED", detail, "The site is limiting downloads right now. Wait a few "
                                                        "minutes, then try again.")
        if code >= 500:
            return network
    if any(k in low for k in _NETWORK):
        return network
    if "not a bot" in low or "too many requests" in low:
        return EngineError("RATE_LIMITED", detail, "The site is limiting downloads right now. Wait a few "
                                                    "minutes, then try again.")
    if platform == "instagram" and not used_cookies and any(k in low for k in _LOGIN):
        return login
    if any(k in low for k in _GONE) or (platform == "instagram" and any(k in low for k in _LOGIN)):
        return gone
    if listing:
        return EngineError("LIST_FAILED", detail,
                           "I couldn't list that profile's videos. Paste a link to one of its "
                           "videos instead.")
    return EngineError("FETCH_FAILED", detail,
                       "I couldn't download that video. Check the link and try again.")


def _ffmpeg_location() -> str:
    ff, fp = Path(tools.ffmpeg()), Path(tools.ffprobe())
    return str(ff.parent) if ff.parent == fp.parent else str(ff)


def _ydl_opts(platform: str, cookies_from_browser: Optional[str], **extra) -> dict:
    opts = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
            "logger": _YtLog(), "socket_timeout": 30, "retries": 3, "ffmpeg_location": _ffmpeg_location()}
    if cookies_from_browser:
        if cookies_from_browser not in BROWSERS:
            raise EngineError("BAD_ARGS", f"unknown browser {cookies_from_browser!r}",
                              "That browser isn't one Matcha Momentum Generator can borrow a login from.")
        opts["cookiesfrombrowser"] = (cookies_from_browser,)
    opts.update(extra)
    return opts


class _YtLog:
    """yt-dlp's chatter goes to stderr (stdout is the protocol)."""
    def debug(self, msg):
        if not str(msg).startswith("[debug]"):
            log(f"# yt-dlp {msg}")

    def info(self, msg):
        log(f"# yt-dlp {msg}")

    def warning(self, msg):
        log(f"# yt-dlp warning: {msg}")

    def error(self, msg):
        log(f"# yt-dlp error: {msg}")


def _import_ytdlp():
    try:
        import yt_dlp
        return yt_dlp
    except ImportError as exc:
        raise EngineError("YTDLP_MISSING", f"yt-dlp is not installed: {exc}",
                          "Matcha Momentum Generator is missing a part it needs to fetch videos. "
                          "Please reinstall the app.")


# --- study-fetch ---------------------------------------------------------------------------------

def fetch(out: str, url: str, cookies_from_browser: Optional[str] = None) -> dict:
    platform = detect_platform(url)
    dest = out_dir(out)
    yt_dlp = _import_ytdlp()
    cookies = cookies_from_browser or None
    progress("fetch", 1, "Looking up the video", force=True)
    video = dest / "video.mp4"

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                progress("fetch", 5 + 85 * min(1.0, (d.get("downloaded_bytes") or 0) / total),
                         "Downloading the video")
        elif d.get("status") == "finished":
            progress("fetch", 92, "Finishing the download", force=True)

    opts = _ydl_opts(platform, cookies, format=FORMAT, merge_output_format="mp4",
                     outtmpl=str(dest / "video.%(ext)s"), progress_hooks=[hook],
                     overwrites=True, max_filesize=MAX_BYTES, postprocessors=[{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}])
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not isinstance(info, dict):
                raise EngineError("UNAVAILABLE", "yt-dlp returned no info",
                                  "That video isn't available.")
            if info.get("_type") == "playlist":
                entries = [e for e in (info.get("entries") or []) if isinstance(e, dict)]
                if not entries:
                    raise EngineError("UNAVAILABLE", "playlist with no videos", "That link has no video in it.")
                info = entries[0]
            dur = float(info.get("duration") or 0.0)
            if dur > MAX_DURATION:
                raise EngineError("TOO_LONG", f"duration {dur:.0f}s exceeds {MAX_DURATION:.0f}s",
                                  "That video is longer than 10 minutes. Matcha Momentum Generator studies "
                                  "short videos, so pick a shorter one.")
            if video.exists():
                video.unlink()
            ydl.process_ie_result(info, download=True)
    except EngineError:
        raise
    except Exception as exc:   # noqa: BLE001 -- yt_dlp raises DownloadError, ExtractorError, URLError, OSError
        raise map_ytdlp_error(exc, platform, bool(cookies))
    if not video.exists():
        found = sorted(p for p in dest.glob("video.*") if p.suffix not in (".part", ".json"))
        if not found:
            raise EngineError("FETCH_FAILED", "yt-dlp finished but wrote no video file",
                              "I couldn't download that video. Check the link and try again.")
        video = found[0]
        raise EngineError("FETCH_FAILED", f"downloaded {video.name}, not an mp4",
                          "I couldn't download that video in a format I can use.")
    source = shape_source(url, platform, info)
    if not source["durationSec"] or source["durationSec"] > MAX_DURATION:
        from . import probe        # Instagram reports no duration before the download
        source["durationSec"] = probe.probe(video, quick=True)["duration"]
        if source["durationSec"] > MAX_DURATION:
            video.unlink(missing_ok=True)
            raise EngineError("TOO_LONG", f"duration {source['durationSec']:.0f}s exceeds {MAX_DURATION:.0f}s",
                              "That video is longer than 10 minutes. Matcha Momentum Generator studies "
                              "short videos, so pick a shorter one.")
    projmod.write_json(dest / "source.json", source)
    progress("fetch", 100, "Video downloaded", force=True)
    return source


# --- study-list ----------------------------------------------------------------------------------

def _list_item(entry: dict, platform: str, handle: str) -> Optional[dict]:
    vid = str(entry.get("id") or "")
    url = entry.get("webpage_url") or entry.get("url") or ""
    if platform == "youtube" and vid:
        url = f"https://www.youtube.com/shorts/{vid}"
    elif platform == "tiktok" and vid and "/video/" not in url:
        url = f"https://www.tiktok.com/@{handle}/video/{vid}"
    elif platform == "instagram" and "/" in url and "instagram.com" not in url and vid:
        url = f"https://www.instagram.com/p/{vid}/"
    if not isinstance(url, str) or not url.startswith("http"):
        return None
    dur = entry.get("duration")
    title = entry.get("title") or entry.get("description") or ""
    return {"url": url, "id": vid, "title": str(title).strip().splitlines()[0][:200] if title else "",
            "views": _int_or_none(entry.get("view_count")),
            "durationSec": round(float(dur), 3) if isinstance(dur, (int, float)) and not isinstance(dur, bool) else None,
            "uploadedAt": _upload_date(entry)}


def list_profile(target: str, limit: int = LIST_DEFAULT, platform: Optional[str] = None,
                 cookies_from_browser: Optional[str] = None) -> dict:
    plat, handle, url = parse_profile(target, platform)
    limit = max(1, min(LIST_MAX, int(limit or LIST_DEFAULT)))
    yt_dlp = _import_ytdlp()
    progress("list", 5, "Looking up the profile", force=True)
    opts = _ydl_opts(plat, cookies_from_browser or None, extract_flat="in_playlist", skip_download=True,
                     playlistend=limit, noplaylist=False)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except EngineError:
        raise
    except Exception as exc:   # noqa: BLE001
        raise map_ytdlp_error(exc, plat, bool(cookies_from_browser), listing=True)
    entries = [e for e in ((info or {}).get("entries") or []) if isinstance(e, dict)]
    items = []
    for e in entries:
        it = _list_item(e, plat, handle)
        if it:
            items.append(it)
        if len(items) >= limit:
            break
    if not items and plat == "instagram" and not cookies_from_browser:
        raise EngineError("LOGIN_NEEDED", "instagram profile listing came back empty", LOGIN_MSG)
    creator = str((info or {}).get("uploader_id") or (info or {}).get("channel") or handle).lstrip("@") or handle
    progress("list", 100, "Found the latest videos", force=True)
    return {"creator": creator, "platform": plat, "items": items}


# --- study-measure: pure maths -------------------------------------------------------------------

def dedupe_cuts(times, min_gap: float = MIN_SHOT) -> list:
    """Sorted cut times, dropping any closer than min_gap to the start or to the previous kept cut."""
    out = []
    last = 0.0
    for t in sorted(float(x) for x in times):
        if t - last >= min_gap - 1e-9:
            out.append(round(t, 3))
            last = t
    return out


def shot_stats(duration: float, cuts: list) -> tuple:
    """(cutsPerMin, avgShotSec)."""
    if duration <= 0:
        return 0.0, 0.0
    return round(len(cuts) / duration * 60.0, 2), round(duration / (len(cuts) + 1), 2)


def speech_stats(words: list, duration: float) -> dict:
    """wpm = words / (durationSec / 60); speechRatio = union of word spans / duration."""
    n = len(words)
    if duration <= 0 or n == 0:
        return {"wordCount": n, "wpm": 0.0, "firstWordAt": None, "speechRatio": 0.0}
    spans = sorted((max(0.0, w["s"]), min(duration, w["e"])) for w in words)
    covered, cur_s, cur_e = 0.0, None, None
    for s, e in spans:
        if e <= s:
            continue
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                covered += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        covered += cur_e - cur_s
    return {"wordCount": n, "wpm": round(n / (duration / 60.0), 1),
            "firstWordAt": round(min(w["s"] for w in words), 3),
            "speechRatio": round(max(0.0, min(1.0, covered / duration)), 3)}


def nonspeech_spans(words: list, duration: float) -> list:
    """(start, end) spans between words (and before the first / after the last) of at least GAP_MIN,
    each trimmed by GAP_TRIM at both ends."""
    spans, cursor = [], 0.0
    for w in sorted(words, key=lambda x: x["s"]):
        if w["s"] - cursor >= GAP_MIN:
            spans.append((cursor, w["s"]))
        cursor = max(cursor, w["e"])
    if duration - cursor >= GAP_MIN:
        spans.append((cursor, duration))
    return [(a + GAP_TRIM, b - GAP_TRIM) for a, b in spans if b - a > 2 * GAP_TRIM]


def music_likely(env, words: list, duration: float) -> bool:
    """See the module docstring. `env` is the 10 ms RMS envelope (audio_env.envelope)."""
    import numpy as np
    per = 100                                    # envelope frames per second (audio_env.PER)
    chunks = []
    for a, b in nonspeech_spans(words, duration):
        i, j = int(a * per), int(b * per)
        if j > i:
            chunks.append(env[i:j])
    if not chunks:
        return False
    vals = np.concatenate(chunks)
    if len(vals) < 10:
        return False
    rms = float(np.sqrt(np.mean(vals.astype(np.float64) ** 2)))
    share = float(np.mean(vals > MUSIC_RMS))
    return rms > MUSIC_RMS and share >= MUSIC_SHARE


def select_frame_times(duration: float, cuts: list, max_frames: int = MAX_FRAMES) -> list:
    """Up to max_frames times: 0.0 and 1.5 (the hook) always (1.5 is pulled inside a very short
    video), then the rest spread across the video, favouring just after cuts."""
    if duration <= 0:
        return [0.0]
    last = max(0.0, duration - 0.1)
    picks = [0.0]
    hook2 = min(HOOK_TIMES[1], last)
    if hook2 - picks[0] >= MIN_FRAME_GAP:
        picks.append(round(hook2, 2))
    elif duration > 1.0:
        picks.append(round(last, 2))
    room = max_frames - len(picks)

    def free(t):
        return all(abs(t - p) >= MIN_FRAME_GAP for p in picks) and 0 <= t <= last

    cands = [round(c + AFTER_CUT, 2) for c in cuts if free(c + AFTER_CUT)]
    chosen = []
    if len(cands) <= room:
        chosen = cands
    else:
        for k in range(room):                    # evenly spaced through the candidates
            chosen.append(cands[int((k + 0.5) * len(cands) / room)])
    picks += chosen
    if len(picks) < max_frames:                  # no/few cuts: fill from an even grid
        need = max_frames - len(picks)
        for k in range(need):
            t = round((k + 0.5) * duration / need, 2)
            if free(t):
                picks.append(t)
    return sorted(set(round(p, 2) for p in picks))[:max_frames]


def frame_name(idx: int, at: float) -> str:
    return f"f{idx:02d}-{at:.2f}.jpg"


# --- study-measure: media work -------------------------------------------------------------------

_PTS = re.compile(r"pts_time:([0-9.]+)")


def detect_cuts(video: Path, duration: float) -> list:
    """ffmpeg scene detection (select gt(scene,0.3)) on a small copy of the picture."""
    cmd = [tools.ffmpeg(), "-nostdin", "-hide_banner", "-i", str(video), "-an",
           "-vf", f"scale=320:-2,select='gt(scene,{CUT_THRESHOLD})',showinfo", "-f", "null", "-"]
    proc = tools.text_run(cmd, max(120.0, duration * 4), "find the cuts in the video",
                          user_message="I couldn't read the picture in this video.")
    times = [float(m.group(1)) for m in _PTS.finditer(proc.stderr or "")]
    return dedupe_cuts([t for t in times if 0 < t < duration])


def extract_frames(video: Path, dest: Path, times: list) -> list:
    folder = dest / "frames"
    if folder.is_symlink():
        raise EngineError("BAD_OUT", "frames is a link", "I can't write to that folder.")
    if folder.exists():
        for old in folder.glob("f??-*.jpg"):
            old.unlink()
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for i, t in enumerate(times):
        name = frame_name(i, t)
        proc = tools.text_run([tools.ffmpeg(), "-y", "-nostdin", "-hide_banner", "-ss", f"{t:.3f}", "-i", str(video),
                               "-frames:v", "1", "-vf", f"scale={FRAME_WIDTH}:-2", "-q:v", "4",
                               str(folder / name)], 60, f"grab the frame at {t:.2f}s", check=False)
        if proc.returncode == 0 and (folder / name).exists() and (folder / name).stat().st_size > 0:
            out.append({"file": f"frames/{name}", "at": float(t)})
        else:
            (folder / name).unlink(missing_ok=True)
        progress("frames", 90 + 9 * (i + 1) / len(times), "Picking out the key frames")
    return out


def _listen(wav: Path, duration: float) -> tuple:
    """(words [{w,s,e}], language) from a mono 16 kHz wav, with the engine's own speech model."""
    from . import asr_mlx, transcribe
    name = transcribe.default_model()
    if transcribe.is_mlx(name) and not asr_mlx.available():
        name = transcribe.DEFAULT_MODEL
    transcribe.require_model(name)               # MODEL_MISSING, as `transcribe` raises it
    progress("listen", 9, "Waking up the listening model", force=True)
    try:
        model, dev, _ = transcribe.load_model(name)
    except EngineError:
        if not (transcribe.is_mlx(name) and transcribe.model_present(transcribe.DEFAULT_MODEL)):
            raise
        model, dev, _ = transcribe.load_model(transcribe.DEFAULT_MODEL)
    log(f"# study: whisper {name} on {dev}")
    words, _segs, lang = transcribe._transcribe_one(model, wav, None, None, duration, 10, 85, stage="listen")
    clean = [{"w": w["w"], "s": float(w["s"]), "e": float(w["e"])} for w in words]
    return clean, lang


def measure(out: str) -> dict:
    from . import audio_env, probe
    dest = out_dir(out)
    video = dest / "video.mp4"
    if not video.exists() or video.is_symlink() and not _inside(Path(os.path.realpath(video)), dest):
        raise EngineError("NOT_FOUND", f"{video} does not exist",
                          "I couldn't find the downloaded video. Fetch it again first.")
    info = probe.probe(video, quick=True)
    if not info["hasVideo"]:
        raise EngineError("NO_VIDEO", "file has no video stream", "That file doesn't contain a video.")
    duration = round(float(info["duration"]), 3)
    t0 = time.time()
    progress("listen", 1, "Getting the sound ready", force=True)
    words, lang, env = [], None, None
    if info["hasAudio"]:
        work = dest / "work"
        wav = work / "study-audio.wav"
        from . import transcribe
        transcribe.extract_audio(video, wav)
        try:
            words, lang = _listen(wav, duration)
            samples = audio_env.read_wav(wav)
            env = audio_env.envelope(samples)
            if words and len(env):
                try:
                    words = _refine(words, env, len(samples) / audio_env.SR)
                except Exception as exc:   # noqa: BLE001 -- raw whisper times are good enough
                    log(f"# study: word edges left as heard ({exc})")
        finally:
            shutil.rmtree(work, ignore_errors=True)
    progress("listen", 85, "Finished listening", force=True)
    progress("cuts", 86, "Counting the cuts", force=True)
    cuts = detect_cuts(video, duration)
    progress("cuts", 90, "Counted the cuts", force=True)
    frames = extract_frames(video, dest, select_frame_times(duration, cuts))
    cpm, avg = shot_stats(duration, cuts)
    result = {"durationSec": duration, "cuts": cuts, "cutsPerMin": cpm, "avgShotSec": avg,
              "words": [{"w": w["w"], "s": round(w["s"], 3), "e": round(w["e"], 3)} for w in words],
              **speech_stats(words, duration),
              "musicLikely": bool(env is not None and len(env) and music_likely(env, words, duration)),
              "frames": frames, "language": lang}
    projmod.write_json(dest / "measure.json", result, indent=1)
    log(f"# study-measure took {time.time() - t0:.1f}s")
    progress("frames", 100, "Measured", force=True)
    return result


def _refine(words: list, env, audio_len: float) -> list:
    from . import audio_env
    thresh = audio_env.noise_threshold(env)
    refined = audio_env.refine_words([dict(w) for w in words], env, thresh, audio_len)
    return [{"w": w["w"], "s": float(w["s"]), "e": float(w["e"])} for w in refined]
