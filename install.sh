#!/bin/bash
# Resolve AI - macOS installer.
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
DEST="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.clauderesolve.plugin"

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
    printf '%s   ---%s %s( * )%s %s---%s    %sResolve AI%s\n' \
        "$WARM" "$RESET" "$AMBER" "$RESET" "$WARM" "$RESET" "$WHITE" "$RESET"
    printf '%s      /  |  \\%s       %sAI motion graphics for DaVinci Resolve%s\n' \
        "$WARM" "$RESET" "$DIM" "$RESET"
    echo
    gradient_bar
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
    local text="Resolve AI installed successfully"
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
    printf '       %sWorkspace > Workflow Integration > Resolve AI%s\n' "$WHITE" "$RESET"
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

# 3 - AI CLI
step 3 'Checking AI CLI'
have_claude=0
have_codex=0
if command -v claude >/dev/null 2>&1; then
    have_claude=1
    ok 'Claude Code CLI present.'
fi
if command -v codex >/dev/null 2>&1; then
    have_codex=1
    ok 'OpenAI Codex CLI present.'
fi
if [ "$have_claude" -eq 0 ] && [ "$have_codex" -eq 0 ]; then
    warn 'No supported AI CLI found.'
    printf '       %sChoose an AI CLI to install:%s\n' "$DIM" "$RESET"
    printf '       %s[1] OpenAI Codex CLI (recommended)%s\n' "$WHITE" "$RESET"
    printf '       %s[2] Claude Code CLI%s\n' "$WHITE" "$RESET"
    printf '       %s[S] Skip for now%s\n' "$DIM" "$RESET"
    printf '       Selection: '
    read -r choice
    choice="$(printf '%s' "${choice:-1}" | tr '[:upper:]' '[:lower:]')"
    if [ "$choice" = "2" ]; then
        warn 'Installing Claude Code CLI via npm...'
        install_pkg='@anthropic-ai/claude-code'
    elif [ "$choice" = "s" ]; then
        install_pkg=''
        warn 'Skipping AI CLI install. Install later with: npm install -g @openai/codex'
    else
        warn 'Installing OpenAI Codex CLI via npm...'
        install_pkg='@openai/codex'
    fi

    if [ -n "$install_pkg" ] && npm install -g "$install_pkg"; then
        if [ "$install_pkg" = "@anthropic-ai/claude-code" ]; then
            have_claude=1
            ok 'Claude Code CLI installed.'
        else
            have_codex=1
            ok 'OpenAI Codex CLI installed.'
        fi
    elif [ -n "$install_pkg" ]; then
        warn 'Automatic install failed. Install manually: npm install -g @openai/codex or npm install -g @anthropic-ai/claude-code'
    fi
fi
if [ "$have_claude" -eq 1 ] && [ -f "$HOME/.claude/.credentials.json" ]; then
    ok 'Claude Code appears logged in.'
elif [ "$have_codex" -eq 1 ]; then
    if codex login status >/dev/null 2>&1; then
        ok 'OpenAI Codex CLI appears logged in.'
    else
        warn 'OpenAI Codex CLI installed but not logged in - run codex login in terminal.'
    fi
else
    warn 'Install or log in to at least one provider: claude login or codex login.'
fi

# 4 - Renderer dependencies
step 4 'Installing renderer dependencies (Playwright)'
if ! ( cd "$RENDERER_SRC" && npm install --no-audit --no-fund ); then
    fail 'npm install failed in plugin/renderer.'
fi
ok 'Renderer dependencies installed.'

if [ ! -f "$PLUGIN_SRC/dist/index.html" ]; then
    warn 'Plugin UI bundle missing - building plugin/dist...'
    if ! ( cd "$PLUGIN_SRC" && npm install --no-audit --no-fund && npm run build ); then
        fail 'Could not build plugin UI. From the repo root run: npm --prefix plugin install && npm --prefix plugin run build, then re-run the installer.'
    fi
    ok 'Plugin UI bundle built.'
else
    ok 'Plugin UI bundle present.'
fi

# 5 - Chromium
step 5 'Downloading Playwright Chromium'
if ! ( cd "$RENDERER_SRC" && npx --yes playwright install chromium ); then
    fail 'Playwright Chromium download failed.'
fi
ok 'Chromium installed.'

# 6 - ffmpeg
step 6 'Checking ffmpeg'
if command -v ffmpeg >/dev/null 2>&1; then
    ok 'ffmpeg found.'
else
    warn 'ffmpeg not found on PATH. Rendering needs ffmpeg (brew install ffmpeg).'
fi

# 7 - Copy plugin into DaVinci Resolve (needs root)
step 7 'Installing plugin into DaVinci Resolve'
printf '       %s(your administrator password may be requested)%s\n' "$DIM" "$RESET"
if ! sudo rm -rf "$DEST" \
   || ! sudo mkdir -p "$DEST" \
   || ! sudo cp -R "$PLUGIN_SRC/." "$DEST/"; then
    fail 'Could not copy plugin files into /Library.'
fi
ok "Installed to $DEST"

# 8 - Verify
step 8 'Verifying installation'
for rel in manifest.xml main.js data/builtin-template-packs.json ipc/assets.js ipc/agent.js ipc/agent-logs.js ipc/captions.js ipc/codex.js ipc/codex-parser.js ipc/codex-stderr-filter.js ipc/render-validation.js ipc/repair.js ipc/showcase.js ipc/template-packs.js ipc/templates.js dist/index.html renderer/render.js renderer/node_modules/playwright; do
    if [ ! -e "$DEST/$rel" ]; then
        fail "Verification failed - missing: $rel"
    fi
done
ok 'All required files present.'

# 9 - Done
step 9 'Done'
print_success
read -r -p "       Press Enter to exit..." _
