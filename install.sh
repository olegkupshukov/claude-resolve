#!/bin/bash
# Claude Resolve - macOS installer.
set -u

# Resolve our own location, then drop root if launched via sudo: Node/npm
# live in the user's environment, and only the final copy into /Library
# needs root (step 7 calls sudo itself).
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
    exec sudo -u "$SUDO_USER" bash "$SELF" "$@"
fi

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_SRC="$REPO_ROOT/plugin"
RENDERER_SRC="$PLUGIN_SRC/renderer"
# macOS plugins dir intentionally OMITS the "Support/" segment that the
# Windows/ProgramData path includes — this matches Blackmagic's macOS layout.
DEST="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.clauderesolve.plugin"
INSTALLER_VERSION='0.5.5-beta'

# Runtime-dependency readiness tracker. Each dep we can't verify at the end is
# recorded with the exact fix command the plugin's runtime shows, so installer
# and in-app render error tell one consistent story.
DEP_WARNINGS=()
add_dep_warning() {  # $1 = name, $2 = fix command
    DEP_WARNINGS+=("$1|$2")
}

# Resolve ffmpeg the way the plugin does at runtime (ipc/paths.js): a login
# shell probe (sees Homebrew/nvm PATHs a GUI app's stripped PATH misses), then
# the known absolute locations. Echoes an absolute path, or returns non-zero.
resolve_ffmpeg() {
    local c
    c="$(zsh -lic 'command -v ffmpeg' 2>/dev/null | tr -d '\r')"
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
    c="$(command -v ffmpeg 2>/dev/null)"
    [ -n "$c" ] && { printf '%s' "$c"; return 0; }
    for c in /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg; do
        [ -x "$c" ] && { printf '%s' "$c"; return 0; }
    done
    return 1
}

# Resolve the Claude Code CLI the same way (login-shell probe + candidates).
resolve_claude() {
    local c
    c="$(zsh -lic 'command -v claude' 2>/dev/null | tr -d '\r')"
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
    c="$(command -v claude 2>/dev/null)"
    [ -n "$c" ] && { printf '%s' "$c"; return 0; }
    for c in /usr/local/bin/claude /opt/homebrew/bin/claude "$HOME/.claude/local/claude" "$HOME/.npm-global/bin/claude" "$HOME/.local/bin/claude"; do
        [ -x "$c" ] && { printf '%s' "$c"; return 0; }
    done
    return 1
}

# Resolve Homebrew: PATH, then the Apple-silicon and Intel default prefixes.
resolve_brew() {
    local c
    c="$(command -v brew 2>/dev/null)"
    [ -n "$c" ] && { printf '%s' "$c"; return 0; }
    for c in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [ -x "$c" ] && { printf '%s' "$c"; return 0; }
    done
    return 1
}

# ---------------------------------------------------------------- colours
ESC=$(printf '\033')
RESET="${ESC}[0m"; BOLD="${ESC}[1m"
WARM="${ESC}[38;2;232;132;58m"      # brand orange
AMBER="${ESC}[38;2;212;164;76m"     # brand amber
LEAF="${ESC}[38;2;128;196;153m"     # brand green
TEAL="${ESC}[38;2;76;201;176m"      # brand teal
WHITE="${ESC}[38;2;243;241;236m"
DIM="${ESC}[38;2;138;137;133m"
RED="${ESC}[38;2;255;138;122m"

# Status glyphs (this file is UTF-8).
I_OK="${LEAF}✓${RESET}"
I_WARN="${AMBER}⚠${RESET}"
I_ERR="${RED}✗${RESET}"

BAR_WIDTH=48

# A point on the brand gradient (warm -> amber -> green -> teal). $1 = 0..100.
grad() {
    awk -v t="$1" 'BEGIN{
        t=t/100; n=4
        split("232,132,58 212,164,76 128,196,153 76,201,176", S, " ")
        seg=t*(n-1); k=int(seg); if(k>n-2)k=n-2; f=seg-k
        split(S[k+1],a,","); split(S[k+2],b,",")
        printf "%d;%d;%d", a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f, a[3]+(b[3]-a[3])*f
    }'
}

gradient_bar() {
    awk -v w="$BAR_WIDTH" 'BEGIN{
        n=4
        split("232,132,58 212,164,76 128,196,153 76,201,176", S, " ")
        printf "  "
        for(i=0;i<w;i++){
            t=i/(w-1); seg=t*(n-1); k=int(seg); if(k>n-2)k=n-2; f=seg-k
            split(S[k+1],a,","); split(S[k+2],b,",")
            printf "\033[48;2;%d;%d;%dm ", a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f, a[3]+(b[3]-a[3])*f
        }
        printf "\033[0m\n"
    }'
}

print_header() {
    echo
    printf '%s      \\  |  /%s\n' "$WARM" "$RESET"
    printf '%s   ---%s %s( * )%s %s---%s    %sClaude Resolve%s\n' \
        "$WARM" "$RESET" "$AMBER" "$RESET" "$WARM" "$RESET" "$WHITE" "$RESET"
    printf '%s      /  |  \\%s       %sAI motion graphics for DaVinci Resolve%s\n' \
        "$WARM" "$RESET" "$DIM" "$RESET"
    echo
    gradient_bar
    printf '       %sinstaller v%s%s\n' "$DIM" "$INSTALLER_VERSION" "$RESET"
    echo
}

step() {  # $1 = step number, $2 = title
    local col; col="$(grad $(( ($1 - 1) * 100 / 8 )))"
    echo
    printf '%s[%s/9]%s  %s%s%s\n' "${ESC}[38;2;${col}m" "$1" "$RESET" "$WHITE" "$2" "$RESET"
}
ok()   { printf '       %s  %s%s%s\n' "$I_OK"   "$DIM"   "$1" "$RESET"; }
warn() { printf '       %s  %s%s%s\n' "$I_WARN" "$DIM"   "$1" "$RESET"; }
fail() {
    echo
    printf '       %s  %s%s%s\n' "$I_ERR" "$RED" "$1" "$RESET"
    echo
    read -r -p "       Press Enter to exit..." _
    exit 1
}

print_success() {
    local inner=46
    local text="Claude Resolve - ready to render"
    local rule; rule="$(printf '─%.0s' $(seq 1 $inner))"
    local vis=$(( 3 + 1 + 2 + ${#text} ))
    local pad=$(( inner - vis ))
    echo
    printf '%s  ╭%s╮%s\n' "$TEAL" "$rule" "$RESET"
    printf '%s  │%s   %s✓%s  %s%s%s%*s%s│%s\n' \
        "$TEAL" "$RESET" "$LEAF" "$RESET" "$WHITE" "$text" "$RESET" "$pad" "" "$TEAL" "$RESET"
    printf '%s  ╰%s╯%s\n' "$TEAL" "$rule" "$RESET"
    echo
    printf '       %sRestart DaVinci Resolve, then open it from:%s\n' "$DIM" "$RESET"
    printf '       %sWorkspace > Workflow Integration > Claude Resolve%s\n' "$WHITE" "$RESET"
    echo
}

# Honest end summary when one or more runtime deps couldn't be verified: the
# plugin is copied, but list each gap with the exact fix command (the same
# string the plugin's runtime pre-flight shows). Only called when count > 0,
# so "${DEP_WARNINGS[@]}" is always non-empty here (safe under bash 3.2 set -u).
print_warnings() {
    local n=${#DEP_WARNINGS[@]} entry name fix
    echo
    printf '       %s  %sInstalled with %s warning(s) - the plugin is in place, but:%s\n' "$I_WARN" "$AMBER" "$n" "$RESET"
    echo
    for entry in "${DEP_WARNINGS[@]}"; do
        name="${entry%%|*}"; fix="${entry#*|}"
        printf '         %s- %s is missing or unverified. Fix:%s\n' "$DIM" "$name" "$RESET"
        printf '             %s%s%s\n' "$WHITE" "$fix" "$RESET"
    done
    echo
    printf '       %sGenerating works; rendering a .mov may fail until fixed.%s\n' "$DIM" "$RESET"
    printf '       %sThe plugin shows the same fix if you hit it at render time.%s\n' "$DIM" "$RESET"
    echo
    printf '       %sRestart DaVinci Resolve, then open it from:%s\n' "$DIM" "$RESET"
    printf '       %sWorkspace > Workflow Integration > Claude Resolve%s\n' "$WHITE" "$RESET"
    echo
}

print_header

# 1 - DaVinci Resolve
step 1 'Checking DaVinci Resolve'
if [ ! -d "/Applications/DaVinci Resolve/DaVinci Resolve.app" ]; then
    fail 'DaVinci Resolve not found. Install DaVinci Resolve Studio 21+ first.'
fi
if pgrep -x 'DaVinci Resolve' >/dev/null 2>&1; then
    warn 'DaVinci Resolve is running. Save your work first.'
    printf '       Close Resolve and continue? (y/n) '
    read -r answer
    case "$answer" in
        y|Y|yes|YES)
            osascript -e 'tell application "DaVinci Resolve" to quit' >/dev/null 2>&1
            for _ in 1 2 3 4 5 6 7 8 9 10; do
                pgrep -x 'DaVinci Resolve' >/dev/null 2>&1 || break
                sleep 1
            done
            pkill -x 'DaVinci Resolve' >/dev/null 2>&1
            ok 'Resolve closed.'
            ;;
        *)
            fail 'Cancelled. Quit DaVinci Resolve, then re-run the installer.'
            ;;
    esac
fi
ok 'Resolve found. (Workflow Integration Plugins require the Studio edition.)'

# 2 - Node.js 18+
step 2 'Checking Node.js'

node_major() {
    command -v node >/dev/null 2>&1 || { echo 0; return; }
    node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

NODE_LTS_FALLBACK='v20.18.0'

# Newest LTS version (e.g. v22.11.0) from nodejs.org, or empty on failure.
# index.tab is sorted newest-first; column 10 is the LTS codename ("-" if not).
latest_node_lts() {
    curl -fsSL 'https://nodejs.org/dist/index.tab' 2>/dev/null \
        | awk -F'\t' 'NR>1 && $10 != "-" { print $1; exit }'
}

install_node() {
    # Official Node.js LTS .pkg from nodejs.org. The .pkg is a universal
    # binary, but detect the arch so the log reflects the host.
    local arch ver pkg url tmp
    case "$(uname -m)" in
        arm64) arch='arm64' ;;
        *)     arch='x64'   ;;
    esac
    ver="$(latest_node_lts)"
    if [ -z "$ver" ]; then
        warn "Could not look up the latest LTS - using $NODE_LTS_FALLBACK."
        ver="$NODE_LTS_FALLBACK"
    fi
    pkg="node-$ver.pkg"
    url="https://nodejs.org/dist/$ver/$pkg"
    tmp="$(mktemp -d)/$pkg"

    warn "Downloading Node.js LTS $ver (universal, host $arch) from nodejs.org..."
    if ! curl -fsSL "$url" -o "$tmp"; then
        rm -f "$tmp"
        warn 'Download failed.'
        return 1
    fi
    warn 'Running the Node.js installer (administrator password may be requested)...'
    if ! sudo installer -pkg "$tmp" -target /; then
        rm -f "$tmp"
        warn 'pkg install failed.'
        return 1
    fi
    rm -f "$tmp"
    # The .pkg installs into /usr/local/bin; make sure this session sees it.
    case ":$PATH:" in *":/usr/local/bin:"*) ;; *) PATH="/usr/local/bin:$PATH" ;; esac
    hash -r 2>/dev/null || true
    [ "$(node_major)" -ge 18 ]
}

if [ "$(node_major)" -lt 18 ]; then
    if command -v node >/dev/null 2>&1; then
        warn "Node.js 18+ required, found $(node --version) - upgrading automatically..."
    else
        warn 'Node.js not found - installing automatically...'
    fi
    if ! install_node; then
        fail 'Could not install Node.js automatically. Install Node.js 18+ from https://nodejs.org and re-run the installer.'
    fi
fi
ok "Node.js $(node --version)"

# 3 - Claude Code CLI
step 3 'Checking Claude Code CLI'
CLAUDE_PATH="$(resolve_claude || true)"
if [ -z "$CLAUDE_PATH" ]; then
    warn 'Claude Code CLI not found - installing via npm...'
    npm install -g @anthropic-ai/claude-code || true
    hash -r 2>/dev/null || true
    CLAUDE_PATH="$(resolve_claude || true)"
fi
# Verify it runs - a present shim that errors is still broken.
if [ -n "$CLAUDE_PATH" ] && "$CLAUDE_PATH" --version >/dev/null 2>&1; then
    ok 'Claude Code CLI ready.'
else
    warn 'Claude Code CLI missing or not runnable. Install it: npm install -g @anthropic-ai/claude-code'
    add_dep_warning 'Claude Code CLI' 'npm install -g @anthropic-ai/claude-code'
fi
# Login state is informational only - NOT part of the readiness gate (the
# credentials-file check can false-warn, and login is a manual user step).
if [ -f "$HOME/.claude/.credentials.json" ]; then
    ok 'Claude Code is logged in.'
else
    warn 'Not logged in yet - run "claude" in a terminal (or use the plugin login button).'
fi

# 4 - Renderer dependencies
step 4 'Installing renderer dependencies (Playwright)'
if ! ( cd "$RENDERER_SRC" && npm install --no-audit --no-fund ); then
    fail 'npm install failed in plugin/renderer.'
fi
ok 'Renderer dependencies installed.'

# 5 - Chromium
step 5 'Downloading Playwright Chromium'
# Pin the browser cache to this user's profile so install-time and run-time
# (ipc/paths.js PLAYWRIGHT_BROWSERS_PATH) always agree - previously this worked
# only by coincidentally matching Playwright's default.
export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
( cd "$RENDERER_SRC" && npx --yes playwright install chromium ) || true
# Verify the browser binary exists (the same check render.js runs at render
# time): exit code alone misses a quarantined Chromium. Don't hard-fail - the
# plugin copy still completes and the summary points to the one-line fix.
if ( cd "$RENDERER_SRC" && node -e "const p=require('playwright').chromium.executablePath(); process.exit(require('fs').existsSync(p)?0:1)" >/dev/null 2>&1 ); then
    ok 'Chromium installed.'
else
    warn 'Chromium not verified (download blocked or quarantined).'
    add_dep_warning 'Chromium' 'cd plugin/renderer && npx playwright install chromium'
fi

# 6 - ffmpeg
step 6 'Checking ffmpeg'
FFMPEG_PATH="$(resolve_ffmpeg || true)"
if [ -n "$FFMPEG_PATH" ] && "$FFMPEG_PATH" -version >/dev/null 2>&1; then
    ok "ffmpeg found ($FFMPEG_PATH)."
else
    BREW_PATH="$(resolve_brew || true)"
    if [ -n "$BREW_PATH" ]; then
        # We already dropped root, so brew runs as the user (it refuses root).
        warn 'ffmpeg not found - installing via Homebrew...'
        "$BREW_PATH" install ffmpeg || true
        FFMPEG_PATH="$(resolve_ffmpeg || true)"
        if [ -n "$FFMPEG_PATH" ] && "$FFMPEG_PATH" -version >/dev/null 2>&1; then
            ok "ffmpeg installed ($FFMPEG_PATH)."
        else
            warn 'ffmpeg install did not complete - you can finish it later.'
            add_dep_warning 'ffmpeg' 'brew install ffmpeg'
        fi
    else
        warn 'ffmpeg not found and Homebrew is unavailable.'
        add_dep_warning 'ffmpeg' 'brew install ffmpeg'
    fi
fi

# 7 - Copy plugin into DaVinci Resolve (needs root)
step 7 'Installing plugin into DaVinci Resolve'
printf '       %s(your administrator password may be requested)%s\n' "$DIM" "$RESET"

# A FILE squatting where a directory must be (from a prior bad install) makes
# `mkdir -p` fail with "Not a directory". Clear the destination or its parent
# if either exists as a non-directory, then build the path step by step so the
# failing step is named.
PARENT="$(dirname "$DEST")"
if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then
    sudo rm -f "$DEST" \
        || fail "Install failed (step 7a): could not remove a file blocking $DEST."
fi
if [ -e "$PARENT" ] && [ ! -d "$PARENT" ]; then
    sudo rm -f "$PARENT" \
        || fail "Install failed (step 7a): could not remove a file blocking $PARENT."
fi
sudo rm -rf "$DEST" \
    || fail 'Install failed (step 7b): could not remove the previous plugin at the destination.'
sudo mkdir -p "$DEST" \
    || fail 'Install failed (step 7c): could not create the plugin destination folder.'
sudo cp -R "$PLUGIN_SRC/." "$DEST/" \
    || fail 'Install failed (step 7d): could not copy the plugin files into the destination.'
ok "Installed to $DEST"

# 8 - Verify
step 8 'Verifying installation'
for rel in manifest.xml main.js dist/index.html renderer/render.js renderer/node_modules/playwright; do
    if [ ! -e "$DEST/$rel" ]; then
        fail "Verification failed - missing: $rel"
    fi
done
ok 'All required files present.'

# 9 - Done
step 9 'Done'
if [ "${#DEP_WARNINGS[@]}" -eq 0 ]; then
    print_success
else
    print_warnings
fi
read -r -p "       Press Enter to exit..." _
