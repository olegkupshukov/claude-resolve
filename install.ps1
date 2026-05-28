#Requires -Version 5.1
<#
  Resolve AI - Windows installer.
  Launched by install.bat (which elevates) or run directly from an
  elevated PowerShell prompt.
#>

# ---------------------------------------------------------------- console
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Enable ANSI/VT processing so 24-bit colour works on Windows PowerShell 5.1.
$Ansi = $false
try {
    $vt = Add-Type -Name CRVT -Namespace CRInstaller -PassThru -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern System.IntPtr GetStdHandle(int h);
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern bool GetConsoleMode(System.IntPtr h, out int m);
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern bool SetConsoleMode(System.IntPtr h, int m);
'@
    $hOut = $vt::GetStdHandle(-11)
    $mode = 0
    if ($vt::GetConsoleMode($hOut, [ref]$mode)) {
        if ($vt::SetConsoleMode($hOut, ($mode -bor 0x0004))) { $Ansi = $true }
    }
} catch { $Ansi = $false }

$ESC       = [char]27
$ICON_OK   = [char]0x2713   # check
$ICON_WARN = [char]0x26A0   # warning sign
$ICON_ERR  = [char]0x2717   # ballot x
$BTL = [char]0x256D; $BTR = [char]0x256E      # rounded box corners
$BBL = [char]0x2570; $BBR = [char]0x256F
$BH  = [char]0x2500; $BV  = [char]0x2502

# Brand gradient: warm orange -> amber -> green -> teal (from design-tokens).
$Stops = @( @(232,132,58), @(212,164,76), @(128,196,153), @(76,201,176) )

function GradientAt([double]$t) {
    if ($t -lt 0) { $t = 0 } elseif ($t -gt 1) { $t = 1 }
    $seg = $t * ($Stops.Count - 1)
    $i = [int][Math]::Floor($seg)
    if ($i -gt $Stops.Count - 2) { $i = $Stops.Count - 2 }
    $f = $seg - $i
    $a = $Stops[$i]; $b = $Stops[$i + 1]
    return @(
        [int]($a[0] + ($b[0] - $a[0]) * $f),
        [int]($a[1] + ($b[1] - $a[1]) * $f),
        [int]($a[2] + ($b[2] - $a[2]) * $f)
    )
}
function Tint([int[]]$c, [string]$s) {
    if ($Ansi) { return "$ESC[38;2;$($c[0]);$($c[1]);$($c[2])m$s$ESC[0m" }
    return $s
}

# ---------------------------------------------------------------- UI parts
$BAR_WIDTH = 48

function Show-Bar {
    if ($Ansi) {
        $s = '  '
        for ($i = 0; $i -lt $BAR_WIDTH; $i++) {
            $c = GradientAt ($i / [double]($BAR_WIDTH - 1))
            $s += "$ESC[48;2;$($c[0]);$($c[1]);$($c[2])m "
        }
        Write-Host ($s + "$ESC[0m")
    } else {
        Write-Host '  ' -NoNewline
        foreach ($col in @('DarkYellow','Yellow','DarkGreen','Green','Cyan','DarkCyan')) {
            Write-Host '        ' -BackgroundColor $col -NoNewline
        }
        Write-Host ''
    }
}

function Show-Header {
    Write-Host ''
    Write-Host '      \  |  /' -ForegroundColor DarkYellow
    Write-Host '   ---' -ForegroundColor DarkYellow -NoNewline
    Write-Host ' ( * ) ' -ForegroundColor Yellow -NoNewline
    Write-Host '---' -ForegroundColor DarkYellow -NoNewline
    Write-Host '    Resolve AI' -ForegroundColor White
    Write-Host '      /  |  \' -ForegroundColor DarkYellow -NoNewline
    Write-Host '       AI motion graphics for DaVinci Resolve' -ForegroundColor DarkGray
    Write-Host ''
    Show-Bar
    Write-Host ''
}

function Step([int]$n, [string]$msg) {
    Write-Host ''
    $tag = "[$n/9]"
    if ($Ansi) {
        Write-Host (Tint (GradientAt ([double]($n - 1) / 8)) $tag) -NoNewline
    } else {
        Write-Host $tag -ForegroundColor Cyan -NoNewline
    }
    Write-Host "  $msg" -ForegroundColor White
}
function Ok([string]$msg) {
    Write-Host '       ' -NoNewline
    Write-Host $ICON_OK -ForegroundColor Green -NoNewline
    Write-Host "  $msg" -ForegroundColor Gray
}
function Warn([string]$msg) {
    Write-Host '       ' -NoNewline
    Write-Host $ICON_WARN -ForegroundColor Yellow -NoNewline
    Write-Host "  $msg" -ForegroundColor Gray
}
function Fail([string]$msg) {
    Write-Host ''
    Write-Host '       ' -NoNewline
    Write-Host $ICON_ERR -ForegroundColor Red -NoNewline
    Write-Host "  $msg" -ForegroundColor Red
    Write-Host ''
    Read-Host '       Press Enter to exit'
    exit 1
}

function Show-Success {
    $inner = 46
    $top = "  $BTL" + ($BH.ToString() * $inner) + $BTR
    $bot = "  $BBL" + ($BH.ToString() * $inner) + $BBR
    $text = "Resolve AI installed successfully"
    $pad = $inner - ($text.Length + 6)        # 6 = "  OK  " spacing
    $teal = GradientAt 1.0

    Write-Host ''
    Write-Host (Tint $teal $top)
    Write-Host (Tint $teal "  $BV") -NoNewline
    Write-Host '   ' -NoNewline
    Write-Host $ICON_OK -ForegroundColor Green -NoNewline
    Write-Host "  $text" -ForegroundColor White -NoNewline
    Write-Host (' ' * $pad) -NoNewline
    Write-Host (Tint $teal "$BV")
    Write-Host (Tint $teal $bot)
    Write-Host ''
    Write-Host '       Restart DaVinci Resolve, then open it from:' -ForegroundColor Gray
    Write-Host '       Workspace > Workflow Integration > Resolve AI' -ForegroundColor White
    Write-Host ''
}

# ---------------------------------------------------------------- paths
$RepoRoot    = $PSScriptRoot
$PluginSrc   = Join-Path $RepoRoot 'plugin'
$RendererSrc = Join-Path $PluginSrc 'renderer'
$Dest        = Join-Path $env:ProgramData 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.clauderesolve.plugin'

Show-Header

# 1 - DaVinci Resolve
Step 1 'Checking DaVinci Resolve'
$resolveExe = Join-Path $env:ProgramFiles 'Blackmagic Design\DaVinci Resolve\Resolve.exe'
if (-not (Test-Path $resolveExe)) {
    Fail 'DaVinci Resolve not found. Install DaVinci Resolve Studio 21+ first.'
}
if (Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue) {
    Warn 'DaVinci Resolve is running. Save your work first.'
    $answer = Read-Host '       Close Resolve and continue? (y/n)'
    if ($answer -match '^(y|yes)$') {
        $proc = Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue
        if ($proc) {
            $proc.CloseMainWindow() | Out-Null
            for ($i = 0; $i -lt 10; $i++) {
                Start-Sleep -Milliseconds 800
                if (-not (Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue)) { break }
            }
            Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
        Ok 'Resolve closed.'
    } else {
        Fail 'Cancelled. Quit DaVinci Resolve, then re-run the installer.'
    }
}
Ok 'Resolve found. (Workflow Integration Plugins require the Studio edition.)'

# 2 - Node.js 18+
Step 2 'Checking Node.js'

# Pull PATH (and the nodejs dir) back into this session after an installer
# writes them to the registry but not to our already-running environment.
function Sync-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if ((Test-Path $nodeDir) -and ($env:Path -notlike "*$nodeDir*")) {
        $env:Path = "$nodeDir;$env:Path"
    }
}

function Get-NodeMajor {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { return 0 }
    try {
        $v = (& node --version).Trim()
        return [int](($v.TrimStart('v')).Split('.')[0])
    } catch { return 0 }
}

# Newest LTS version string (e.g. 'v22.11.0') from nodejs.org, or $null.
# index.json is sorted newest-first, so the first LTS entry is the latest.
$NodeLtsFallback = 'v20.18.0'
function Get-LatestNodeLts {
    try {
        $oldPref = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
        $ProgressPreference = $oldPref
        $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
        if ($lts -and $lts.version) { return $lts.version }
    } catch { $ProgressPreference = 'Continue' }
    return $null
}

function Install-Node {
    # Strategy 1 - winget (present on Windows 10 21H2+ / Windows 11).
    # The OpenJS.NodeJS.LTS package already tracks the current LTS.
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Warn 'Installing Node.js via winget...'
        & winget install --id OpenJS.NodeJS.LTS --silent `
            --accept-source-agreements --accept-package-agreements
        Sync-Path
        if ((Get-NodeMajor) -ge 18) { return $true }
        Warn 'winget install did not produce a usable Node.js - trying the official MSI.'
    } else {
        Warn 'winget not available - downloading the official Node.js MSI.'
    }

    # Strategy 2 - official Node.js MSI from nodejs.org.
    $arch = if ([Environment]::Is64BitOperatingSystem) {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    } else { 'x86' }
    $nodeVersion = Get-LatestNodeLts
    if (-not $nodeVersion) {
        Warn "Could not look up the latest LTS - using $NodeLtsFallback."
        $nodeVersion = $NodeLtsFallback
    }
    $msiUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-$arch.msi"
    $msiPath = Join-Path $env:TEMP 'node-lts-installer.msi'
    try {
        Warn "Downloading Node.js LTS $nodeVersion ($arch) from nodejs.org..."
        $oldPref = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
        $ProgressPreference = $oldPref
        Warn 'Running the Node.js installer...'
        $p = Start-Process msiexec.exe -ArgumentList @(
            '/i', "`"$msiPath`"", '/qn', '/norestart'
        ) -Wait -PassThru
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        Sync-Path
        return ((Get-NodeMajor) -ge 18) -and ($p.ExitCode -eq 0)
    } catch {
        $ProgressPreference = 'Continue'
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        Warn "MSI install failed: $($_.Exception.Message)"
        return $false
    }
}

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 18) {
    if ($nodeMajor -eq 0) {
        Warn 'Node.js not found - installing automatically...'
    } else {
        Warn "Node.js 18+ required, found v$nodeMajor - upgrading automatically..."
    }
    if (-not (Install-Node)) {
        Fail 'Could not install Node.js automatically. Install Node.js 18+ from https://nodejs.org and re-run the installer.'
    }
    $nodeMajor = Get-NodeMajor
}
$nodeVer = (& node --version).Trim()
Ok "Node.js $nodeVer"

# 3 - AI CLI
Step 3 'Checking AI CLI'
$haveClaude = [bool](Get-Command claude -ErrorAction SilentlyContinue)
if (-not $haveClaude -and (Test-Path (Join-Path $env:APPDATA 'npm\claude.cmd'))) {
    $haveClaude = $true
}
$haveCodex = [bool](Get-Command codex -ErrorAction SilentlyContinue)
if (-not $haveCodex -and (Test-Path (Join-Path $env:APPDATA 'npm\codex.cmd'))) {
    $haveCodex = $true
}
if (-not $haveClaude -and -not $haveCodex) {
    Warn 'No supported AI CLI found.'
    Write-Host '       Choose an AI CLI to install:' -ForegroundColor Gray
    Write-Host '       [1] OpenAI Codex CLI (recommended)' -ForegroundColor White
    Write-Host '       [2] Claude Code CLI' -ForegroundColor White
    Write-Host '       [S] Skip for now' -ForegroundColor Gray
    $choice = (Read-Host '       Selection').Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
    $installAttempted = $false

    if ($choice -eq '2') {
        Warn 'Installing Claude Code CLI via npm...'
        $installAttempted = $true
        & npm install -g '@anthropic-ai/claude-code'
    } elseif ($choice -eq 's') {
        Warn 'Skipping AI CLI install. Install later with: npm install -g @openai/codex'
    } else {
        Warn 'Installing OpenAI Codex CLI via npm...'
        $installAttempted = $true
        & npm install -g '@openai/codex'
    }

    if ($installAttempted -and $LASTEXITCODE -ne 0) {
        Warn 'Automatic install failed. Install manually: npm install -g @openai/codex or npm install -g @anthropic-ai/claude-code'
    } elseif ($choice -eq '2') {
        Ok 'Claude Code CLI installed.'
        $haveClaude = $true
    } elseif ($choice -ne 's') {
        Ok 'OpenAI Codex CLI installed.'
        $haveCodex = $true
    }
} else {
    if ($haveClaude) { Ok 'Claude Code CLI present.' }
    if ($haveCodex) { Ok 'OpenAI Codex CLI present.' }
}
if ($haveClaude -and (Test-Path (Join-Path $env:USERPROFILE '.claude\.credentials.json'))) {
    Ok 'Claude Code appears logged in.'
} elseif ($haveCodex) {
    try {
        & codex login status *> $null
        if ($LASTEXITCODE -eq 0) {
            Ok 'OpenAI Codex CLI appears logged in.'
        } else {
            Warn 'OpenAI Codex CLI installed but not logged in - run codex login in terminal.'
        }
    } catch {
        Warn 'OpenAI Codex CLI installed but login status could not be checked - run codex login in terminal.'
    }
} else {
    Warn 'Install or log in to at least one provider: claude login or codex login.'
}

# 4 - Renderer dependencies
Step 4 'Installing renderer dependencies (Playwright)'
Push-Location $RendererSrc
& npm install --no-audit --no-fund
$exit = $LASTEXITCODE
Pop-Location
if ($exit -ne 0) { Fail 'npm install failed in plugin\renderer.' }
Ok 'Renderer dependencies installed.'

$distIndex = Join-Path $PluginSrc 'dist\index.html'
if (-not (Test-Path $distIndex)) {
    Warn 'Plugin UI bundle missing - building plugin\dist...'
    Push-Location $PluginSrc
    & npm install --no-audit --no-fund
    $installExit = $LASTEXITCODE
    if ($installExit -eq 0) {
        & npm run build
        $buildExit = $LASTEXITCODE
    } else {
        $buildExit = $installExit
    }
    Pop-Location
    if ($buildExit -ne 0 -or -not (Test-Path $distIndex)) {
        Fail 'Could not build plugin UI. From the repo root run: npm --prefix plugin install; npm --prefix plugin run build; then re-run the installer.'
    }
    Ok 'Plugin UI bundle built.'
} else {
    Ok 'Plugin UI bundle present.'
}

# 5 - Chromium
Step 5 'Downloading Playwright Chromium'
Push-Location $RendererSrc
& npx --yes playwright install chromium
$exit = $LASTEXITCODE
Pop-Location
if ($exit -ne 0) { Fail 'Playwright Chromium download failed.' }
Ok 'Chromium installed.'

# 6 - ffmpeg
Step 6 'Checking ffmpeg'
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Ok 'ffmpeg found.'
} else {
    Warn 'ffmpeg not found on PATH. Rendering needs ffmpeg installed and on PATH.'
}

# 7 - Copy plugin into DaVinci Resolve
Step 7 'Installing plugin into DaVinci Resolve'
try {
    if (Test-Path $Dest) { Remove-Item -LiteralPath $Dest -Recurse -Force -ErrorAction Stop }
    New-Item -ItemType Directory -Path $Dest -Force -ErrorAction Stop | Out-Null
    Copy-Item -Path (Join-Path $PluginSrc '*') -Destination $Dest -Recurse -Force -ErrorAction Stop
} catch {
    Fail "Could not copy plugin files: $($_.Exception.Message)"
}
Ok "Installed to $Dest"

# 8 - Verify
Step 8 'Verifying installation'
$required = @(
    'manifest.xml',
    'main.js',
    'data\builtin-template-packs.json',
    'ipc\assets.js',
    'ipc\agent.js',
    'ipc\agent-logs.js',
    'ipc\captions.js',
    'ipc\codex.js',
    'ipc\codex-parser.js',
    'ipc\codex-stderr-filter.js',
    'ipc\render-validation.js',
    'ipc\repair.js',
    'ipc\showcase.js',
    'ipc\template-packs.js',
    'ipc\templates.js',
    'dist\index.html',
    'renderer\render.js',
    'renderer\node_modules\playwright'
)
foreach ($rel in $required) {
    if (-not (Test-Path (Join-Path $Dest $rel))) {
        Fail "Verification failed - missing: $rel"
    }
}
Ok 'All required files present.'

# 9 - Done
Step 9 'Done'
Show-Success
Read-Host '       Press Enter to exit'
