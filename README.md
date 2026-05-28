# Resolve AI (v0.5.0-beta)

**AI motion graphics inside DaVinci Resolve**
*by Oleg Kupshukov*

Resolve AI is a Workflow Integration Plugin that brings AI-powered motion graphics generation directly into DaVinci Resolve Studio. Describe what you want in plain text, and either Claude Code or OpenAI Codex generates the animation code, renders it to ProRes 4444 with alpha transparency, and imports it to your timeline.

<img src="screenshots/welcome_screen.png" alt="Welcome screen" width="600">

<img src="screenshots/ready-to-render.png" alt="Render card with result" width="600">

## Requirements

- **DaVinci Resolve Studio 21+** (not the free version — Workflow Integration Plugins require Studio)
- **Node.js 18+** — required by the AI CLI integrations
- **Claude Code CLI** with an active Pro or Max subscription, or **OpenAI Codex CLI** with a supported OpenAI/ChatGPT account
- **ffmpeg** in PATH
- **Windows** or **macOS**

Check your Node.js version:

```
node --version    # must be v18 or newer
```

On macOS, if it's older than 18, upgrade with `brew install node` (latest) or `fnm install 22`.

## Installation

### Windows
1. Download or clone the repo
2. Double-click `install.bat`
3. Restart DaVinci Resolve

### macOS
1. Download or clone the repo
2. Double-click `install.command`
3. Restart DaVinci Resolve

The installer checks for DaVinci Resolve and Node.js, installs the renderer's dependencies (Playwright + Chromium), lets you choose Codex CLI or Claude Code if no supported AI CLI is found, and copies the plugin into Resolve. After installing, open the plugin from **Workspace > Workflow Integration > Resolve AI**.

If installation fails with `Verification failed - missing: dist/index.html`, the plugin UI bundle was not built before the installer copied files. Update to the latest installer and run it again, or build manually from the repo root:

```bash
npm --prefix plugin install
npm --prefix plugin run build
./install.command
```

Install and log in to at least one AI CLI:

```
npm install -g @anthropic-ai/claude-code
claude login
```

```
npm install -g @openai/codex
codex login
```

The plugin uses each CLI's local auth. It does not store OpenAI or Anthropic API keys.
Codex auth is handled only by the Codex CLI (`codex login` / `codex login status`); Resolve AI never asks for or stores an OpenAI API key.

## Usage

### One-minute quickstart

1. Open **Workspace > Workflow Integration > Resolve AI**
2. Pick Codex or Claude in Settings
3. Click a Prompt Gallery item or type a prompt
4. Preview the generated motion graphic
5. Click **Render .mov** to import a ProRes 4444 overlay at the playhead
6. Use **Timeline tools**, **Regenerate**, **Fix with AI**, **Save as Template**, or render history to iterate

### Prompt → Render Examples

| Prompt | Result |
| --- | --- |
| “Create a bold creator title card for a tech review channel.” | Full-frame title card with animated typography |
| “Create a transparent lower third for a podcast guest.” | Alpha lower third imported onto the timeline |
| “Import this SRT and make kinetic captions.” | Timed transparent caption overlay |
| “Use the selected logo as the central mark.” | Asset-aware logo reveal |

## How it works

Generates one-off HTML animations rendered frame-by-frame to ProRes 4444 .mov with alpha transparency via Playwright + ffmpeg. Full creative freedom: CSS animations, SVG, Canvas, filters, blur, backdrop-filter. The rendered .mov is automatically imported to your current timeline on an empty track at the playhead position.
Each render can also write local sidecar metadata beside the .mov so the history browser can search, restore prompts, and re-render previous work.

**Use it for:** title cards, text reveals, glitch effects, lower thirds, transitions — any specific animation for the project at hand.

## Growth Features

- **Prompt Gallery**: built-in creator, podcast, gaming, product, documentary, business, social, event, sports, and music prompts.
- **Timeline tools**: generate titles, lower thirds, transitions, and re-renders with current timeline context.
- **Create workflow**: choose motion type, duration, background mode, aspect ratio, style intensity, and review the generation brief before sending.
- **Template Packs**: local JSON packs that contributors can submit and users can import from disk or GitHub raw URLs.
- **Captions**: local SRT/VTT import, pasted transcript parsing, preview cues, and clean/kinetic/karaoke/social/podcast styles.
- **Asset-aware generation**: drag/drop images, inspect asset health, attach logos/products/textures/reference images, and extract brand colors.
- **Variation previews**: draft multiple prompt variations with locks for logo, colors, layout, and animation-only changes.
- **Fix with AI**: send render failures back to the active provider for repair.
- **Showcase builder**: export a static local showcase page from saved templates/prompts.

## Settings

Open the sidebar (gear icon) to configure:

- **Provider**: Auto, Claude Code, or Codex CLI
- **Model**: Claude Sonnet/Opus or Codex default/supported GPT model
- **FPS**: 24, 25, 30, or 60
- **Resolution**: 1920×1080, 3840×2160, 1080×1920, 1080×1350, or 1080×1080
- **Provider Health**: installed/login/version status for Claude and Codex, plus a collapsible raw log drawer for troubleshooting
- **Brand Kit**: local colors, fonts, logo path, tone, and common phrases injected into new generations
- **Timeline**: quick actions that use current timeline FPS, resolution, playhead, and duration when Resolve exposes them
- **Asset Library**: drag/drop local PNG/JPG/WebP/SVG/GIF assets, inspect dimensions/health, attach selected assets to new prompts, and provide notes so the AI uses them correctly
- **Variations**: generate multiple prompt directions and lock logo/colors/layout/animation behavior
- **Gallery**: search, category filters, favorites, recents, local import, and GitHub raw URL installs
- **Templates**: save generated overlays locally and reuse them later
- **Renders**: searchable render history with thumbnails, rename, reveal, delete, sync, and re-render

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [community-templates](community-templates/README.md). Neutral creator-focused template packs are especially useful.

Suggested GitHub topics: `davinci-resolve`, `motion-graphics`, `ai-video`, `codex`, `claude`, `electron`, `video-generation`.

## Bundled Fonts

The plugin ships with a curated set of fonts so generated animations look consistent across machines without extra installs:

- **Bricolage Grotesque**
- **Fraunces**
- **JetBrains Mono**

## Known Limitations

- Complex prompts may be slow on smaller models — switch to a stronger provider/model for detailed animations
- The plugin spawns the selected AI CLI as a subprocess — first response may take a few seconds to warm up
- This is a beta — expect rough edges; please report issues on GitHub or Discord

Tested on Windows and macOS (Apple Silicon).

## Links

- [GitHub](https://github.com/olegkupshukov/claude-resolve)
- [Discord](https://discord.gg/95YrCyMgsK)
- [Instagram](https://instagram.com/olegkupshukov)

## License

MIT License. See [LICENSE](LICENSE) for details.

## Built With

- [Claude Code](https://claude.ai/claude-code) and [OpenAI Codex](https://developers.openai.com/codex/cli) — AI engines
- [DaVinci Resolve Scripting API](https://www.blackmagicdesign.com/products/davinciresolve) — Resolve integration
- [React](https://react.dev) — Plugin UI
- [Playwright](https://playwright.dev) — Frame-perfect rendering
- [ffmpeg](https://ffmpeg.org) — ProRes 4444 encoding
