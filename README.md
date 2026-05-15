# Claude Resolve (Beta)

**AI Motion Graphics Generator for DaVinci Resolve Studio**
*by Oleg Kupshukov*

Claude Resolve is a Workflow Integration Plugin that brings AI-powered motion graphics generation directly into DaVinci Resolve Studio. Describe what you want in plain text, and Claude generates the animation code, renders it to ProRes 4444 with alpha transparency, and imports it to your timeline.

![Welcome Screen](screenshots/welcome_screen.png)

![Generated Animation Preview](screenshots/ready%20to%20render.png)

![Rendered and Added to Timeline](screenshots/timelinescreenshot_after_render.png)

## Requirements

- **DaVinci Resolve Studio 21+** (not the free version — Workflow Integration Plugins require Studio)
- **Claude Code CLI** with an active Pro or Max subscription
- **Python 3.10+** with Playwright installed
- **ffmpeg** in PATH
- **Windows** or **macOS**

## Installation

1. Install Claude Code CLI:
   ```
   npm install -g @anthropic-ai/claude-code
   ```

2. Log in to Claude Code:
   ```
   claude login
   ```

3. Install Python dependencies:
   ```
   pip install playwright
   playwright install chromium
   ```

4. Make sure ffmpeg is in your PATH.

5. Clone the repo and run the install script:

   **Windows** (run as Administrator):
   ```
   git clone https://github.com/olegkupshukov/claude-resolve.git
   cd claude-resolve
   install.bat
   ```

   **macOS**:
   ```
   git clone https://github.com/olegkupshukov/claude-resolve.git
   cd claude-resolve
   sudo bash install.sh
   ```

6. Restart DaVinci Resolve. Open the plugin from **Workspace > Workflow Integration > Claude Resolve**.

## Usage

1. Open the plugin in DaVinci Resolve
2. Type a prompt describing the motion graphic you want
3. Preview the result in the built-in player
4. Click **Render .mov** to render it and import it to your timeline

## How it works

Generates one-off HTML animations rendered frame-by-frame to ProRes 4444 .mov with alpha transparency via Playwright + ffmpeg. Full creative freedom: CSS animations, SVG, Canvas, filters, blur, backdrop-filter. The rendered .mov is automatically imported to your current timeline on an empty track at the playhead position.

**Use it for:** title cards, text reveals, glitch effects, lower thirds, transitions — any specific animation for the project at hand.

## Settings

Open the sidebar (gear icon) to configure:

- **Model**: Sonnet (fast) or Opus (smart)
- **FPS**: 24, 25, 30, or 60
- **Resolution**: 1920x1080 or 3840x2160
- **Assets**: Manage rendered .mov files (sync to Media Pool, delete)

## Known Limitations

- Complex prompts may be slow on Sonnet — switch to Opus for better results on detailed animations
- macOS support is new and not yet tested on a real Mac with Resolve — please report issues
- The plugin spawns Claude Code CLI as a subprocess — first response may take a few seconds to warm up

## Links

- [GitHub](https://github.com/olegkupshukov/claude-resolve)
- [Instagram](https://instagram.com/olegkupshukov)

## License

MIT License. See [LICENSE](LICENSE) for details.

## Built With

- [Claude Code](https://claude.ai/claude-code) — AI engine
- [DaVinci Resolve Scripting API](https://www.blackmagicdesign.com/products/davinciresolve) — Resolve integration
- [React](https://react.dev) — Plugin UI
- [Playwright](https://playwright.dev) — Frame-perfect rendering
- [ffmpeg](https://ffmpeg.org) — ProRes 4444 encoding
