# CLAUDE.md — Claude Resolve Project Rules

## Project

AI-powered motion graphics generator & assistant for DaVinci Resolve Studio.
Workflow Integration Plugin (Electron) that embeds Claude Code as terminal inside Resolve.

## ⚠️ Security — Public Repo

This is an open source project. **Never commit:**
- API keys, tokens, secrets
- Personal paths with real usernames (use `<USERNAME>` placeholder)
- Notion URLs or internal workspace links
- Personal data: email, phone, real names in code
- `.env` files, credentials, auth tokens
- Hardcoded absolute paths — use config/env variables

**Before every commit:** review diff for leaked personal data.

## Skills (installed as plugins — use them)

### karpathy-guidelines
Installed from `andrej-karpathy-skills`. **Apply to all coding tasks.** Core rules:
- Think before coding
- Simplicity first
- Surgical changes
- Goal-driven execution

### emil-design-eng
Installed from `emilkowalski/skill` at `skills/emil-design-eng/SKILL.md`. **Read before any UI/animation/overlay work.** Covers easing, timing, component patterns, accessibility.

### When to invoke skills
- **Any coding task** → karpathy-guidelines (always active)
- **Any UI, animation, overlay, template work** → read emil-design-eng SKILL.md first
- **Plugin UI changes** → both skills apply

## Tech Stack

- **Plugin**: Electron (bundled with Resolve 21), HTML/CSS/JS
- **Resolve API**: WorkflowIntegration.node (sandboxed model, IPC via preload.js)
- **AI Engine**: Claude Code CLI (spawned via child_process from main.js)
- **Overlay Render**: Playwright (frame-perfect, renderFrame API) → ffmpeg → ProRes 4444
- **MCP**: davinci-resolve-mcp for Resolve control (future)

## Key Paths

All paths use `<USERNAME>` placeholder. Replace with actual username locally.

- SDK: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\`
- Plugin install: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
- SamplePlugin: `...\Developer\Workflow Integrations\Examples\SamplePlugin\`
- Claude CLI: `C:\Users\<USERNAME>\AppData\Roaming\npm\claude.cmd`

## Resolve Plugin Architecture (v19.0.2+)

Resolve uses sandboxed Electron with context isolation:
- `main.js` — main process (Node.js: child_process, fs, WorkflowIntegration.node)
- `preload.js` — bridge, exposes API to renderer via contextBridge
- `index.html` — renderer process (UI, no direct Node.js access)
- `manifest.xml` — plugin metadata for Resolve
- Communication: renderer ↔ preload (contextBridge) ↔ main (ipcMain/ipcRenderer)

## Overlay Template Contract

All HTML overlay templates must implement:
```javascript
window.renderFrame(frameNumber, fps)  // Set exact visual state for frame
window.getAnimationDuration()          // Return total duration in seconds
```
No setTimeout, no requestAnimationFrame. Frame-perfect deterministic rendering.

## File Structure

```
claude-resolve/
  .claude/CLAUDE.md      ← this file
  README.md              ← public readme
  .gitignore             ← must cover .env, node_modules/, local configs
  plugin/                ← Resolve Workflow Integration Plugin
    main.js              ← main process (Node: child_process, fs, WorkflowIntegration)
    preload.js           ← contextBridge to the renderer UI
    manifest.xml         ← plugin metadata for Resolve
    package.json
    WorkflowIntegration.node / .darwin.node   ← Resolve API (per-OS binary)
    ipc/                 ← main-process IPC handlers (claude, overlay, paths, resolve, ...)
    src/                 ← React UI source (built by vite → dist/)
    dist/                ← built UI, loaded by main.js
    renderer/render.js   ← Playwright → ffmpeg .mov render pipeline (frame-perfect)
  skills/                ← Design skills (also installed as CC plugins)
    emil-design-eng/
      SKILL.md
```

## Git Rules

- **Never commit or push without explicit user approval.**
- Before committing: show the full diff, explain what changed, and ask for permission.
- Before pushing: state the remote/branch and ask for permission.
- No exceptions — even if the user previously approved a similar action.

## Release Checklist

Before tagging a release, bump the version to the tag version in ALL of:
`plugin/package.json` (the in-app update check compares this against the latest
GitHub release tag — a stale value shows a permanent "update available" badge),
`plugin/manifest.xml`, `plugin/renderer/package.json`, `$InstallerVersion` in
`install.ps1`, `INSTALLER_VERSION` in `install.sh`.
Rule: **tag = GitHub Release = package.json version.**

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code change without feature/fix
- `docs:` documentation
- `style:` UI/CSS changes
