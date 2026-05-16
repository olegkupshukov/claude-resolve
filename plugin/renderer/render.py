"""
Claude Resolve — Playwright .mov Renderer

Pre-loads via page.add_init_script (before any HTML <script>):
  - window.React, window.ReactDOM (React 18 UMD)
  - window.Motion             (Framer Motion v10 UMD; exposes motion, AnimatePresence, etc.)
  - @font-face for "Bricolage Grotesque", "Fraunces", "JetBrains Mono"

Modes (auto-detected per HTML):
  - frame:            HTML implements window.renderFrame(frame, fps); renderer
                      calls it for each frame then screenshots.
  - realtime-precise: HTML doesn't implement renderFrame; renderer hijacks
                      performance.now / Date.now / requestAnimationFrame and
                      steps time manually so Framer Motion springs / layout
                      animations settle deterministically per frame.

Required HTML API:
  - window.getAnimationDuration() -> positive float (seconds). Hard-clamped at
    MAX_DURATION_SEC; durations above that are clamped with a 'warning' emit.

Outputs ProRes 4444 .mov (yuva444p10le, alpha channel).
JSON progress lines emitted to stdout for the plugin's IPC stream.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

RENDERER_DIR = Path(__file__).resolve().parent
VENDOR_DIR = RENDERER_DIR / "vendor"
FONTS_DIR = RENDERER_DIR / "fonts"

MAX_DURATION_SEC = 30
FONT_READY_TIMEOUT_MS = 5000

UMD_FILES = [
    VENDOR_DIR / "react.production.min.js",
    VENDOR_DIR / "react-dom.production.min.js",
    VENDOR_DIR / "framer-motion.js",
]

# (family, file, format, weight-range)
FONT_FACES = [
    ("Bricolage Grotesque", FONTS_DIR / "BricolageGrotesque-VF.ttf",   "truetype", "200 800"),
    ("Fraunces",            FONTS_DIR / "Fraunces-VF.woff2",           "woff2",    "100 900"),
    ("JetBrains Mono",      FONTS_DIR / "JetBrainsMono-VF.woff2",      "woff2",    "100 800"),
]


def emit(msg):
    print(json.dumps(msg), flush=True)


def build_init_script():
    """Concatenated UMD bundles + font injector. Runs in the page's main world
    before any HTML script. UMDs assign window.React / window.ReactDOM /
    window.Motion themselves; font injector polls for <head> then appends a
    <style> with @font-face rules using file:// URLs.
    """
    umd_blobs = []
    for p in UMD_FILES:
        if not p.exists():
            raise FileNotFoundError(f"Missing vendor file: {p}")
        umd_blobs.append(p.read_text(encoding="utf-8"))

    font_rules = []
    for family, path, fmt, weight_range in FONT_FACES:
        if not path.exists():
            raise FileNotFoundError(f"Missing font file: {path}")
        uri = path.as_uri()  # file:///F:/...
        font_rules.append(
            f'@font-face {{ '
            f'font-family: "{family}"; '
            f'src: url("{uri}") format("{fmt}"); '
            f'font-weight: {weight_range}; '
            f'font-display: block; '
            f'}}'
        )
    font_css = " ".join(font_rules)

    font_injector = (
        "(function(){"
        "function inject(){"
        "if(!document.head){setTimeout(inject,0);return;}"
        "if(document.getElementById('__cr_fonts'))return;"
        "var s=document.createElement('style');"
        "s.id='__cr_fonts';"
        f"s.textContent={json.dumps(font_css)};"
        "document.head.appendChild(s);"
        "}"
        "inject();"
        "})();"
    )

    return "\n".join(umd_blobs) + "\n" + font_injector


def detect_mode(page):
    has_render_frame = page.evaluate("typeof window.renderFrame === 'function'")
    return "frame" if has_render_frame else "realtime-precise"


def render_frame_mode(page, args, frames_dir, total_frames):
    for frame in range(total_frames):
        page.evaluate(f"window.renderFrame({frame}, {args.fps})")
        path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
        page.screenshot(path=path, omit_background=True)
        if frame % 10 == 0 or frame == total_frames - 1:
            pct = round((frame + 1) / total_frames * 100)
            emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})


def render_realtime_precise_mode(page, args, frames_dir, total_frames):
    """Hijack time / rAF, step the browser clock manually per frame.

    The init script's UMDs (React, ReactDOM, Motion) are already in place
    before HTML runs, so by the time we hit this function the React tree has
    mounted with our overridden clock starting at t=0.
    """
    page.evaluate("""
    (() => {
        window.__renderTime = 0;
        window.__renderActive = true;
        const origPerfNow = performance.now.bind(performance);
        performance.now = () => window.__renderActive ? window.__renderTime : origPerfNow();
        const origDateNow = Date.now.bind(Date);
        Date.now = () => window.__renderActive ? window.__renderTime : origDateNow();
        const callbacks = [];
        window.requestAnimationFrame = (cb) => { callbacks.push(cb); return callbacks.length; };
        window.__stepFrame = (timeMs) => {
            window.__renderTime = timeMs;
            const cbs = callbacks.splice(0);
            cbs.forEach(cb => { try { cb(timeMs); } catch(_) {} });
        };
    })();
    """)

    # Give React a beat to mount with t=0
    page.wait_for_timeout(500)
    page.evaluate("window.__stepFrame(0)")

    for frame in range(total_frames):
        t_ms = (frame / args.fps) * 1000.0
        # Multiple sub-steps per frame so Framer Motion springs settle smoothly
        for k in range(3):
            sub = t_ms + (k / 3.0) * (1000.0 / args.fps)
            page.evaluate(f"window.__stepFrame({sub})")
        # Let the DOM commit
        page.wait_for_timeout(8)
        path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
        page.screenshot(path=path, omit_background=True)
        if frame % 10 == 0 or frame == total_frames - 1:
            pct = round((frame + 1) / total_frames * 100)
            emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})

    page.evaluate("window.__renderActive = false")


def main():
    parser = argparse.ArgumentParser(description="Render HTML animation to ProRes 4444 .mov")
    parser.add_argument("html_path")
    parser.add_argument("--fps", type=int, default=25)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()

    html_path = Path(args.html_path).resolve()
    if not html_path.exists():
        emit({"type": "error", "message": f"HTML file not found: {html_path}"})
        sys.exit(1)

    try:
        init_script = build_init_script()
    except FileNotFoundError as e:
        emit({"type": "error", "message": str(e)})
        sys.exit(1)

    frames_dir = tempfile.mkdtemp(prefix="claude_resolve_frames_")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={"width": args.width, "height": args.height},
                device_scale_factor=1,
            )

            page.add_init_script(script=init_script)
            page.goto(html_path.as_uri())
            page.wait_for_load_state("networkidle")

            try:
                page.wait_for_function("document.fonts.ready", timeout=FONT_READY_TIMEOUT_MS)
            except Exception:
                emit({"type": "warning", "message": "document.fonts.ready timed out"})

            # Extra settle for font decode + initial paint
            page.wait_for_timeout(200)

            duration = page.evaluate("window.getAnimationDuration()")
            if not isinstance(duration, (int, float)) or duration <= 0:
                emit({"type": "error", "message": f"getAnimationDuration returned invalid value: {duration!r}"})
                sys.exit(1)

            clamped = False
            if duration > MAX_DURATION_SEC:
                duration = MAX_DURATION_SEC
                clamped = True

            total_frames = int(duration * args.fps)
            if total_frames <= 0:
                emit({"type": "error", "message": f"Computed 0 frames (duration={duration}, fps={args.fps})"})
                sys.exit(1)

            mode = detect_mode(page)
            emit({"type": "mode_detected", "mode": mode})
            if clamped:
                emit({"type": "warning", "message": f"duration clamped to {MAX_DURATION_SEC}s"})

            emit({"type": "start", "totalFrames": total_frames, "duration": duration, "mode": mode})

            if mode == "frame":
                render_frame_mode(page, args, frames_dir, total_frames)
            else:
                render_realtime_precise_mode(page, args, frames_dir, total_frames)

            # Save a sidebar thumbnail from ~85% through the animation —
            # late enough to show the resolved state, before any fade-out.
            thumb_idx = min(total_frames - 1, max(0, int(total_frames * 0.85)))
            thumb_src = os.path.join(frames_dir, f"frame_{thumb_idx:06d}.png")
            if os.path.exists(thumb_src):
                try:
                    thumb_dir = Path(args.output).resolve().parent / "thumbnails"
                    thumb_dir.mkdir(parents=True, exist_ok=True)
                    thumb_dst = thumb_dir / (Path(args.output).stem + ".png")
                    shutil.copyfile(thumb_src, thumb_dst)
                    emit({"type": "thumbnail", "path": str(thumb_dst)})
                except OSError as e:
                    emit({"type": "warning", "message": f"thumbnail save failed: {e}"})

            browser.close()

        ffmpeg_cmd = [
            args.ffmpeg, "-y",
            "-framerate", str(args.fps),
            "-i", os.path.join(frames_dir, "frame_%06d.png"),
            "-c:v", "prores_ks",
            "-profile:v", "4444",
            "-pix_fmt", "yuva444p10le",
            "-vendor", "apl0",
            args.output,
        ]

        emit({"type": "encoding"})
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

        if result.returncode != 0:
            emit({"type": "error", "message": f"FFmpeg failed: {result.stderr[:500]}"})
            sys.exit(1)

        emit({"type": "done", "output": args.output})

    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
