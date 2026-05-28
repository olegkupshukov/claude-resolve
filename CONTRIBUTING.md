# Contributing to Resolve AI

Resolve AI is a local-first motion graphics generator for DaVinci Resolve Studio.

## Good First Contributions

- Add neutral creator-focused template packs.
- Improve renderer validation and repair prompts.
- Add screenshots, short demo clips, and README examples.
- Test installers on Windows/macOS.
- Improve captions, asset handling, or Resolve timeline actions.
- Add Timeline, Asset Library, Caption Studio, or Template Marketplace tests.

## Template Pack Rules

- Keep examples universal: creators, podcasts, gaming, product launches, documentaries, events, education, social shorts, sports, music, and business videos.
- Do not submit templates that depend on private assets or cloud services.
- Template HTML must implement `window.getAnimationDuration()` and either `window.renderFrame(frame, fps)` or React render mode.
- No external scripts, CDN fonts, remote images, API keys, or secrets.
- Include a prompt, category, tags, thumbnail/preview identifier, dimensions, FPS, and creator name.
- Local JSON packs can be tested from the Prompt Gallery with **Import** or **Install URL** using a GitHub raw `.json` URL.

## Development Checks

Run before opening a PR:

```bash
npm --prefix plugin test
npm --prefix plugin run build
npm --prefix plugin run smoke
```

Release ZIPs can be created with:

```bash
npm --prefix plugin run package:release
```

On Windows, also run:

```powershell
powershell -NoProfile -Command '$null = [scriptblock]::Create((Get-Content -Raw ".\install.ps1"))'
```

## Public Repo Safety

Never commit API keys, personal paths, private screenshots, `.env` files, local credentials, or customer/project data.
