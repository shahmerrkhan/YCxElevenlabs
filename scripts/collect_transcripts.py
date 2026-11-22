# /// script
# requires-python = ">=3.10"
# dependencies = ["yt-dlp[default,curl-cffi]==2026.10.26", "faster-whisper==1.2.1", "av>=15,<17"]
# ///
"""Transcribe viral study-app videos into data/transcripts/.

uv run scripts/collect_transcripts.py                   transcribe SOURCES, skipping saved ones
uv run scripts/collect_transcripts.py --check URL...    print the numbers for candidates

Topic is judged by a person before a URL goes in SOURCES.
"""

import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "transcripts"
AUDIO = ROOT / "data" / ".audio-tmp"
MODEL = "base.en"
MAX_FILES = 25
MAX_SECONDS = 90
MIN_VIEWS = 100_000
MIN_LIKES = 10_000  # only used when the platform hides views
MIN_WORDS = 15  # less than this is usually music

SOURCES = [
    "https://www.instagram.com/reel/DVCZbjhgNLL/",
    "https://www.instagram.com/reel/DWwEQT0DWr6/",
    "https://www.instagram.com/reel/DVmUCyNjrLN/",
    "https://www.instagram.com/reel/DUeGJ0AkuqB/",
    "https://www.tiktok.com/@answersai.com/video/7229829913279204650",
    "https://www.tiktok.com/@blaiseeeeeeeeeeeee/video/7364159059232247086",
    "https://www.tiktok.com/@mindgrasp.ai/video/7415222210836663583",
    "https://www.tiktok.com/@christiaanhenny/video/7591581864226344214",
    "https://www.tiktok.com/@thestudygirlyy/video/7480961478179425582",
    "https://www.tiktok.com/@trixceo/video/7362815533470797062",
    "https://www.tiktok.com/@kylekruegerr/video/7419105613629771039",
    "https://www.tiktok.com/@elisempham/video/7332881143395634474",
    "https://www.tiktok.com/@daniellecohn/video/7428676502436203806",
    "https://www.tiktok.com/@neointech/video/7544084611001765138",
    "https://www.youtube.com/shorts/ymjUQBIf854",
    "https://www.tiktok.com/@getknowt/video/7308419585789889838",
    "https://www.tiktok.com/@your.bummy.math.tutor/video/7366777576070745390",
    "https://www.tiktok.com/@timmorrel/video/7356499744287427846",
    "https://www.tiktok.com/@gizmo.ai/video/7172858389679066374",
    "https://www.tiktok.com/@afifexp/video/7457126557325217031",
    "https://www.tiktok.com/@getknowt/video/7193492207943355691",
    "https://www.youtube.com/shorts/qnPg-FliKVA",
]


def yt_dlp(*args):
    done = subprocess.run(
        [sys.executable, "-I", "-m", "yt_dlp", "--ignore-config", "--no-warnings",
         "--no-playlist", "--socket-timeout", "15", *args],
        capture_output=True, text=True, timeout=90,
    )
    if done.returncode:
        raise RuntimeError((done.stderr.strip().splitlines() or ["yt-dlp failed"])[-1])
    return done.stdout


def probe_seconds(media):
    done = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(media)],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return float(done.stdout)


def rejection(info, seconds=None):
    views, likes = info.get("view_count"), info.get("like_count")
    if seconds and seconds > MAX_SECONDS:
        return f"{seconds:.0f}s is over {MAX_SECONDS}s"
    if views is not None and views < MIN_VIEWS:
        return f"{views:,} views is under {MIN_VIEWS:,}"
    if views is None and (likes or 0) < MIN_LIKES:
        return f"unknown views and {likes} likes"
    return None


def check(url):
    try:
        info = json.loads(yt_dlp("-J", "--", url))
        reason = rejection(info, info.get("duration"))
        return " | ".join([
            f"SKIP {reason}" if reason else "PASS",
            url,
            f"secs={info.get('duration')}",
            f"views={info.get('view_count')}",
            f"likes={info.get('like_count')}",
            str(info.get("channel") or info.get("uploader")),
            " ".join(str(info.get("description") or info.get("title")).split())[:140],
        ])
    except Exception as err:
        return f"FAIL {url}: {err}"


def saved_files():
    saved = {}
    for path in OUT.glob("reel_*.txt"):
        first, _, rest = path.read_text().partition("\n")
        if first.startswith("source: ") and rest.partition("\n")[2].strip():
            saved[first.removeprefix("source: ")] = path
    return saved


def next_path():
    numbers = [int(m[1]) for p in OUT.glob("reel_*.txt") if (m := re.fullmatch(r"reel_(\d+)", p.stem))]
    return OUT / f"reel_{max(numbers, default=0) + 1:02d}.txt"


def fetch(url, folder):
    info = json.loads(yt_dlp("-J", "--", url))
    if reason := rejection(info, info.get("duration")):
        raise RuntimeError(reason)
    # TikTok's audio-only format is the attached sound, not the speech in the video,
    # so there we take the smallest video and keep only its audio track.
    picked = ("-f", "w[vcodec!=none]", "-x") if "tiktok.com/" in url else ("-f", "ba/b")
    yt_dlp(*picked, "-o", str(folder / "audio.%(ext)s"), "--", url)
    audio = next(folder.glob("audio.*"))
    seconds = probe_seconds(audio)  # Instagram does not report a duration
    expected = info.get("duration")
    if expected and abs(seconds - expected) > 3:
        raise RuntimeError(f"audio is {seconds:.0f}s but the video is {expected}s, wrong track")
    if reason := rejection(info, seconds):
        raise RuntimeError(reason)
    return info, audio, seconds


def collect():
    saved = saved_files()
    todo = [url for url in SOURCES if url not in saved]
    print(f"{len(SOURCES) - len(todo)} already done, {len(todo)} to do")
    room = MAX_FILES - len(saved)
    if not todo or room <= 0:
        return 0

    from faster_whisper import WhisperModel

    AUDIO.mkdir(parents=True, exist_ok=True)
    failed = 0
    with tempfile.TemporaryDirectory(dir=AUDIO) as tmp, ThreadPoolExecutor(4) as pool:
        folders = [Path(tmp) / str(n) for n in range(len(todo))]
        for folder in folders:
            folder.mkdir()
        downloads = [pool.submit(fetch, url, folder) for url, folder in zip(todo, folders)]
        model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=8, local_files_only=True)

        for url, download in zip(todo, downloads):
            if room <= 0:
                download.cancel()
                continue
            try:
                info, audio, seconds = download.result()
                segments, _ = model.transcribe(str(audio), vad_filter=True, condition_on_previous_text=False)
                text = " ".join(segment.text.strip() for segment in segments).strip()
                words = len(text.split())
                if words < MIN_WORDS:
                    raise RuntimeError(f"only {words} spoken words")
                views = info.get("view_count")
                path = next_path()
                part = path.with_suffix(".part")
                part.write_text(f"source: {url}\nviews: {'unknown' if views is None else views}\n{text}\n")
                part.replace(path)
                room -= 1
                print(f"saved {path.name} | {seconds:.0f}s | views={views} | "
                      f"likes={info.get('like_count')} | {words} words | {url}", flush=True)
            except Exception as err:
                failed += 1
                print(f"skipped {url}: {err}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    if sys.argv[1:2] == ["--check"]:
        with ThreadPoolExecutor(8) as workers:
            for line in workers.map(check, sys.argv[2:]):
                print(line, flush=True)
    else:
        sys.exit(collect())
