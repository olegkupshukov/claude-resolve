"""
Claude Resolve — Playwright .mov Renderer

Renders frame-perfect HTML animations to ProRes 4444 .mov files.
The HTML must implement:
    window.renderFrame(frameNumber, fps)  — set visual state for frame
    window.getAnimationDuration()         — return total duration in seconds

Usage:
    python render.py <html_path> --fps 25 --width 1920 --height 1080 --output output.mov

Outputs JSON progress lines to stdout for IPC streaming.
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


def emit(msg):
    print(json.dumps(msg), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Render HTML animation to ProRes 4444 .mov")
    parser.add_argument("html_path", help="Path to HTML file")
    parser.add_argument("--fps", type=int, default=25)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--output", required=True, help="Output .mov path")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="Path to ffmpeg executable")
    args = parser.parse_args()

    html_path = Path(args.html_path).resolve()
    if not html_path.exists():
        emit({"type": "error", "message": f"HTML file not found: {html_path}"})
        sys.exit(1)

    frames_dir = tempfile.mkdtemp(prefix="claude_resolve_frames_")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={"width": args.width, "height": args.height},
                device_scale_factor=1,
            )

            page.goto(html_path.as_uri())
            page.wait_for_load_state("networkidle")

            duration = page.evaluate("window.getAnimationDuration()")
            total_frames = int(duration * args.fps)

            emit({"type": "start", "totalFrames": total_frames, "duration": duration})

            for frame in range(total_frames):
                page.evaluate(f"window.renderFrame({frame}, {args.fps})")
                frame_path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
                page.screenshot(path=frame_path, omit_background=True)

                if frame % 10 == 0 or frame == total_frames - 1:
                    pct = round((frame + 1) / total_frames * 100)
                    emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})

            browser.close()

        # Encode to ProRes 4444 with alpha channel
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
