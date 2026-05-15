"""
Claude Resolve — Playwright .mov Renderer v2

Two modes:
  1. FRAME mode (default): HTML implements window.renderFrame(frame, fps)
     Frame-perfect, deterministic. For imperative animations.

  2. REALTIME mode (--mode realtime): Records the page playing in real time.
     For React + Framer Motion, CSS @keyframes, or any time-based animation.
     HTML must implement window.getAnimationDuration() to know when to stop.
     Optionally implements window.startAnimation() to trigger playback.

Usage:
    # Frame mode (original)
    python render_v2.py animation.html --fps 24 --output output.mov

    # Realtime mode (React/Framer Motion)
    python render_v2.py animation.html --fps 24 --mode realtime --output output.mov

Outputs JSON progress lines to stdout for IPC streaming.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def emit(msg):
    print(json.dumps(msg), flush=True)


def render_frame_mode(page, args, frames_dir):
    """Original frame-by-frame mode. HTML must implement renderFrame(frame, fps)."""
    duration = page.evaluate("window.getAnimationDuration()")
    total_frames = int(duration * args.fps)

    emit({"type": "start", "mode": "frame", "totalFrames": total_frames, "duration": duration})

    for frame in range(total_frames):
        page.evaluate(f"window.renderFrame({frame}, {args.fps})")
        frame_path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
        page.screenshot(path=frame_path, omit_background=True)

        if frame % 10 == 0 or frame == total_frames - 1:
            pct = round((frame + 1) / total_frames * 100)
            emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})

    return total_frames


def render_realtime_mode(page, args, frames_dir):
    """
    Real-time recording mode. Captures screenshots at fixed intervals
    while the animation plays naturally in the browser.

    HTML must implement:
        window.getAnimationDuration() -> duration in seconds
    Optionally:
        window.startAnimation() -> called to trigger playback
        window.isAnimationComplete() -> returns true when done (fallback: timer)
    """
    duration = page.evaluate("window.getAnimationDuration()")
    total_frames = int(duration * args.fps)
    frame_interval = 1.0 / args.fps

    emit({"type": "start", "mode": "realtime", "totalFrames": total_frames, "duration": duration})

    # Check if startAnimation exists
    has_start = page.evaluate("typeof window.startAnimation === 'function'")
    has_complete = page.evaluate("typeof window.isAnimationComplete === 'function'")

    # Trigger animation start
    if has_start:
        page.evaluate("window.startAnimation()")
    
    start_time = time.perf_counter()
    frame = 0

    while frame < total_frames:
        # Calculate when this frame should be captured
        target_time = frame * frame_interval
        elapsed = time.perf_counter() - start_time

        # Wait until it's time for this frame
        if elapsed < target_time:
            sleep_time = target_time - elapsed
            if sleep_time > 0.001:
                time.sleep(sleep_time)

        # Capture frame
        frame_path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
        page.screenshot(path=frame_path, omit_background=True)

        if frame % 10 == 0 or frame == total_frames - 1:
            pct = round((frame + 1) / total_frames * 100)
            emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})

        # Check if animation signaled completion
        if has_complete:
            try:
                done = page.evaluate("window.isAnimationComplete()")
                if done and frame >= total_frames * 0.9:
                    # Fill remaining frames with last screenshot
                    last_frame_path = frame_path
                    for fill_frame in range(frame + 1, total_frames):
                        fill_path = os.path.join(frames_dir, f"frame_{fill_frame:06d}.png")
                        shutil.copy2(last_frame_path, fill_path)
                    emit({"type": "progress", "frame": total_frames, "total": total_frames, "percent": 100})
                    break
            except:
                pass

        frame += 1

    return total_frames


def render_realtime_precise_mode(page, args, frames_dir):
    """
    Precise real-time mode. Uses requestAnimationFrame synchronization.
    Injects a time controller that pauses rAF and steps through frames.
    Works with React, Framer Motion, CSS animations, GSAP, etc.

    HTML only needs window.getAnimationDuration().
    No other API required — this mode hijacks the browser's timing.
    """
    duration = page.evaluate("window.getAnimationDuration()")
    total_frames = int(duration * args.fps)

    emit({"type": "start", "mode": "realtime-precise", "totalFrames": total_frames, "duration": duration})

    # Inject time controller that overrides performance.now() and Date.now()
    # This makes ALL browser animations (rAF, CSS, setTimeout) think time
    # is advancing at our pace, not real time.
    page.evaluate("""
    (() => {
        window.__renderTime = 0;
        window.__renderActive = true;

        // Override performance.now
        const origPerfNow = performance.now.bind(performance);
        performance.now = () => window.__renderActive ? window.__renderTime : origPerfNow();

        // Override Date.now  
        const origDateNow = Date.now.bind(Date);
        Date.now = () => window.__renderActive ? window.__renderTime : origDateNow();

        // Override requestAnimationFrame to be synchronous with our time
        const callbacks = [];
        const origRAF = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => {
            callbacks.push(cb);
            return callbacks.length;
        };

        // Step function: advance time and flush all rAF callbacks
        window.__stepFrame = (timeMs) => {
            window.__renderTime = timeMs;
            const cbs = callbacks.splice(0);
            cbs.forEach(cb => {
                try { cb(timeMs); } catch(e) {}
            });
        };

        // Trigger initial React render / animation start
        window.__startCapture = () => {
            if (typeof window.startAnimation === 'function') {
                window.startAnimation();
            }
            // Flush initial frame
            window.__stepFrame(0);
        };
    })();
    """)

    # Wait for React to mount
    page.wait_for_timeout(500)

    # Start capture
    page.evaluate("window.__startCapture()")

    for frame in range(total_frames):
        time_ms = (frame / args.fps) * 1000

        # Advance browser time and flush animation frames
        # Multiple steps per frame to ensure smooth Framer Motion springs
        steps_per_frame = 3
        for step in range(steps_per_frame):
            sub_time = time_ms + (step / steps_per_frame) * (1000 / args.fps)
            page.evaluate(f"window.__stepFrame({sub_time})")

        # Small wait for DOM to settle
        page.wait_for_timeout(8)

        # Capture
        frame_path = os.path.join(frames_dir, f"frame_{frame:06d}.png")
        page.screenshot(path=frame_path, omit_background=True)

        if frame % 10 == 0 or frame == total_frames - 1:
            pct = round((frame + 1) / total_frames * 100)
            emit({"type": "progress", "frame": frame + 1, "total": total_frames, "percent": pct})

    # Restore
    page.evaluate("window.__renderActive = false")

    return total_frames


def main():
    parser = argparse.ArgumentParser(description="Render HTML animation to ProRes 4444 .mov (v2)")
    parser.add_argument("html_path", help="Path to HTML file")
    parser.add_argument("--fps", type=int, default=25)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--output", required=True, help="Output .mov path")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="Path to ffmpeg executable")
    parser.add_argument("--mode", choices=["frame", "realtime", "realtime-precise"],
                        default="auto",
                        help="Render mode: frame (renderFrame API), realtime (live capture), "
                             "realtime-precise (time hijack for React/Framer Motion)")
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

            # Auto-detect mode if not specified
            if args.mode == "auto":
                has_render_frame = page.evaluate("typeof window.renderFrame === 'function'")
                if has_render_frame:
                    args.mode = "frame"
                else:
                    args.mode = "realtime-precise"
                emit({"type": "mode_detected", "mode": args.mode})

            # Render
            if args.mode == "frame":
                render_frame_mode(page, args, frames_dir)
            elif args.mode == "realtime":
                render_realtime_mode(page, args, frames_dir)
            elif args.mode == "realtime-precise":
                render_realtime_precise_mode(page, args, frames_dir)

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
