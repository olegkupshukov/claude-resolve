# Install Claude Resolve

A Workflow Integration Plugin for **DaVinci Resolve Studio** (the free edition can't load plugins).

## Before you start

- **DaVinci Resolve Studio** installed (tested on Studio 21; the installer checks Resolve is present but not its version).
- A **Claude Pro or Max** plan. Auth is the Claude Code CLI's own login — no API key is used or stored.
- Internet access for the first install (it downloads the Claude CLI and Playwright Chromium).

The installer handles the rest: it auto-installs **Node.js 18+**, the **Claude Code CLI**, **Playwright Chromium**, and **ffmpeg** (winget on Windows, Homebrew on macOS) if missing, verifies all four, and ends with a clear summary of anything left to fix. If a package manager is unavailable, it prints the exact command to run instead of failing silently.

## Windows

1. Download or clone the repo.
2. Double-click **`install.bat`**. Approve the admin prompt when it copies the plugin into Resolve (only that step needs admin).
3. **ffmpeg** is installed automatically via winget (no admin needed). If winget is unavailable, the end summary tells you to run `winget install Gyan.FFmpeg` yourself.
4. Restart DaVinci Resolve.

## macOS

1. Download or clone the repo.
2. Double-click **`install.command`**.
   - *"unidentified developer"?* Right-click `install.command` → **Open**, then confirm.
   - *Double-click does nothing / "permission denied"?* A ZIP download strips the executable bit — run `bash install.command` in Terminal (it restores the bit).
   - *Still blocked?* Clear quarantine in the repo folder: `xattr -dr com.apple.quarantine .`
3. **ffmpeg** is installed automatically via Homebrew. If Homebrew isn't installed, the end summary tells you to run `brew install ffmpeg` yourself.
4. Restart DaVinci Resolve.

## Sign in to Claude

If the installer reports "not logged in," run `claude login` in a terminal (or use the plugin's login button) and finish the browser sign-in with your Pro/Max account.

## Open the plugin

In Resolve: **Workspace > Workflow Integration > Claude Resolve**.

## Fixes for common failures

**Installer hangs/fails at "Downloading Playwright Chromium" (Windows).**
Antivirus (usually Defender) is blocking the extract. Add `%LOCALAPPDATA%\ms-playwright` to your exclusions (**Settings → Privacy & security → Virus & threat protection → Manage settings → Add or remove exclusions**), then re-run `install.bat`. To retry just this step:
```
set PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright
cd plugin\renderer
npx playwright install chromium
```

**Rendering fails with "FFmpeg failed to spawn."**
ffmpeg isn't on `PATH`. Install it (`winget install Gyan.FFmpeg` / `brew install ffmpeg`), reopen Resolve, and confirm with `ffmpeg -version`.

**Plugin doesn't appear in Resolve.**
Fully quit and reopen Resolve. Confirm the plugin was copied to:
- Windows: `%ProgramData%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.clauderesolve.plugin`
- macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.clauderesolve.plugin`
