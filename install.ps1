#Requires -Version 5.1
<#
  Claude Resolve - Windows installer.
  Launched by install.bat as the CURRENT user (no up-front elevation). Node,
  npm, the Claude CLI, and Playwright run in the user's profile; only the final
  plugin copy into ProgramData is elevated (see Copy-Plugin).
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
    Write-Host '    Claude Resolve' -ForegroundColor White
    Write-Host '      /  |  \' -ForegroundColor DarkYellow -NoNewline
    Write-Host '       AI motion graphics for DaVinci Resolve' -ForegroundColor DarkGray
    Write-Host ''
    Show-Bar
    Write-Host "       installer v$InstallerVersion" -ForegroundColor DarkGray
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
    $text = "Claude Resolve - ready to render"
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
    Write-Host '       Workspace > Workflow Integration > Claude Resolve' -ForegroundColor White
    Write-Host ''
}

# Honest end summary when one or more runtime deps couldn't be verified: the
# plugin is copied, but list each gap with the exact fix command (the same
# string the plugin's runtime pre-flight shows).
function Show-Warnings {
    $n = $script:DepWarnings.Count
    Write-Host ''
    Write-Host '       ' -NoNewline
    Write-Host $ICON_WARN -ForegroundColor Yellow -NoNewline
    Write-Host "  Installed with $n warning(s) - the plugin is in place, but:" -ForegroundColor Yellow
    Write-Host ''
    foreach ($d in $script:DepWarnings) {
        Write-Host "         - $($d.Name) is missing or unverified. Fix:" -ForegroundColor Gray
        Write-Host "             $($d.Fix)" -ForegroundColor White
    }
    Write-Host ''
    Write-Host '       Generating animations works; rendering a .mov may fail until fixed.' -ForegroundColor Gray
    Write-Host '       The plugin shows the same fix if you hit it at render time.' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '       Restart DaVinci Resolve, then open it from:' -ForegroundColor Gray
    Write-Host '       Workspace > Workflow Integration > Claude Resolve' -ForegroundColor White
    Write-Host ''
}

# ---------------------------------------------------------------- paths
$RepoRoot         = $PSScriptRoot
$PluginSrc        = Join-Path $RepoRoot 'plugin'
$RendererSrc      = Join-Path $PluginSrc 'renderer'
# Windows/ProgramData path includes the "Support" segment (the macOS path omits
# it) — this matches Blackmagic's per-platform layout. Do not "sync" the two.
$Dest             = Join-Path $env:ProgramData 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.clauderesolve.plugin'
$InstallerVersion = '0.5.5-beta'

# Runtime-dependency readiness tracker. Each dep we can't verify at the end is
# recorded with the exact fix command the plugin's runtime shows, so the
# installer and the in-app render error tell one consistent story.
$script:DepWarnings = @()
function Add-DepWarning([string]$name, [string]$fix) {
    $script:DepWarnings += [pscustomobject]@{ Name = $name; Fix = $fix }
}

# True only if the executable at $path actually runs (a present-but-broken
# binary should not count as verified). All output suppressed.
function Test-Runs([string]$path, [string[]]$cmdArgs) {
    if (-not $path) { return $false }
    try {
        & $path @cmdArgs *> $null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

# Resolve ffmpeg the same way the plugin does at runtime (ipc/paths.js): PATH
# first, then the known absolute install locations — winget's user-scope Links
# shim, Program Files, and scoop. Returns an absolute path or $null.
function Resolve-Ffmpeg {
    $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) { return $cmd.Source }
    $bases = @(
        @{ Base = $env:ProgramFiles; Rel = 'FFmpeg\ffmpeg.exe' },
        @{ Base = $env:ProgramFiles; Rel = 'FFmpeg\bin\ffmpeg.exe' },
        @{ Base = $env:ProgramW6432; Rel = 'FFmpeg\bin\ffmpeg.exe' },
        @{ Base = $env:LOCALAPPDATA; Rel = 'Microsoft\WinGet\Links\ffmpeg.exe' },
        @{ Base = $env:USERPROFILE;  Rel = 'scoop\shims\ffmpeg.exe' }
    )
    foreach ($b in $bases) {
        if ($b.Base) {
            $p = Join-Path $b.Base $b.Rel
            if (Test-Path $p) { return $p }
        }
    }
    return $null
}

# Resolve the Claude Code CLI: PATH, then the npm-global shim locations.
function Resolve-Claude {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) { return $cmd.Source }
    foreach ($p in @(
        (Join-Path $env:APPDATA 'npm\claude.cmd'),
        (Join-Path $env:LOCALAPPDATA 'npm\claude.cmd')
    )) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

# Elevate ONLY the plugin copy: everything else runs as the invoking user so
# Node/npm-global, the Claude CLI + login, and the Playwright Chromium cache
# land in the USER profile (mirrors the macOS drop-root model). ProgramData
# needs admin to write, so the copy runs in a minimal elevated child.
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Copy-Plugin {
    $destLit = "'" + ($Dest -replace "'", "''") + "'"
    $srcLit  = "'" + ($PluginSrc -replace "'", "''") + "'"
    $payload = @"
`$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $destLit) { Remove-Item -LiteralPath $destLit -Recurse -Force }
New-Item -ItemType Directory -Path $destLit -Force | Out-Null
Copy-Item -Path (Join-Path $srcLit '*') -Destination $destLit -Recurse -Force
"@
    if (Test-Admin) {
        try { & ([scriptblock]::Create($payload)); return $true } catch { return $false }
    }
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($payload))
    try {
        $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $enc)
        return ($p.ExitCode -eq 0)
    } catch {
        return $false   # user declined the UAC prompt
    }
}

Show-Header

# 1 - DaVinci Resolve
Step 1 'Checking DaVinci Resolve'
$resolveExe = Join-Path $env:ProgramFiles 'Blackmagic Design\DaVinci Resolve\Resolve.exe'
if (-not (Test-Path $resolveExe)) {
    Fail 'DaVinci Resolve not found. Install DaVinci Resolve Studio 21+ first.'
}
if (Get-Process -Name 'Resolve', 'DaVinci Resolve Welcome' -ErrorAction SilentlyContinue) {
    Warn 'DaVinci Resolve is running. Save your work first.'
    $answer = Read-Host '       Close Resolve and continue? (y/n)'
    if ($answer -match '^(y|yes)$') {
        $proc = Get-Process -Name 'Resolve', 'DaVinci Resolve Welcome' -ErrorAction SilentlyContinue
        if ($proc) {
            $proc.CloseMainWindow() | Out-Null
            for ($i = 0; $i -lt 10; $i++) {
                Start-Sleep -Milliseconds 800
                if (-not (Get-Process -Name 'Resolve', 'DaVinci Resolve Welcome' -ErrorAction SilentlyContinue)) { break }
            }
            Get-Process -Name 'Resolve', 'DaVinci Resolve Welcome' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
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
        Warn 'Installing Node.js via winget (administrator approval may be requested)...'
        try {
            Start-Process winget -Verb RunAs -Wait -ArgumentList @(
                'install', '--id', 'OpenJS.NodeJS.LTS', '--silent',
                '--accept-source-agreements', '--accept-package-agreements')
        } catch {}
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
        Warn 'Running the Node.js installer (administrator approval may be requested)...'
        $p = Start-Process msiexec.exe -Verb RunAs -ArgumentList @(
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

# 3 - Claude Code CLI
Step 3 'Checking Claude Code CLI'
$claudePath = Resolve-Claude
if (-not $claudePath) {
    Warn 'Claude Code CLI not found - installing via npm...'
    & npm install -g '@anthropic-ai/claude-code'
    Sync-Path
    $claudePath = Resolve-Claude
}
# Verify it actually runs — a present shim that errors is still broken.
if ($claudePath -and (Test-Runs $claudePath @('--version'))) {
    Ok 'Claude Code CLI ready.'
} else {
    Warn 'Claude Code CLI missing or not runnable. Install it: npm install -g @anthropic-ai/claude-code'
    Add-DepWarning 'Claude Code CLI' 'npm install -g @anthropic-ai/claude-code'
}
# Login state is informational only - NOT part of the readiness gate (the
# credentials-file check can false-warn, and login is a manual user step).
if (Test-Path (Join-Path $env:USERPROFILE '.claude\.credentials.json')) {
    Ok 'Claude Code is logged in.'
} else {
    Warn 'Not logged in yet - run "claude" in a terminal (or use the plugin login button).'
}

# 4 - Renderer dependencies
Step 4 'Installing renderer dependencies (Playwright)'
Push-Location $RendererSrc
& npm install --no-audit --no-fund
$exit = $LASTEXITCODE
Pop-Location
if ($exit -ne 0) { Fail 'npm install failed in plugin\renderer.' }
Ok 'Renderer dependencies installed.'

# 5 - Chromium
Step 5 'Downloading Playwright Chromium'
# Pin the browser cache to this user's profile so install-time and run-time
# (the plugin runs as the logged-in user inside Resolve) always agree.
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright'
Push-Location $RendererSrc
& npx --yes playwright install chromium
Pop-Location
# Verify the browser binary exists (the same check render.js runs at render
# time): exit code alone misses an antivirus-quarantined chrome.exe. Don't
# hard-fail - the plugin copy still completes, and the runtime pre-flight and
# end summary both point to the one-line fix.
Push-Location $RendererSrc
& node -e "const p=require('playwright').chromium.executablePath(); process.exit(require('fs').existsSync(p)?0:1)" *> $null
$chromiumOk = ($LASTEXITCODE -eq 0)
Pop-Location
if ($chromiumOk) {
    Ok 'Chromium installed.'
} else {
    Warn 'Chromium not verified (download blocked, or antivirus quarantined it).'
    Add-DepWarning 'Chromium' 'cd plugin\renderer ; npx playwright install chromium'
}

# 6 - ffmpeg
Step 6 'Checking ffmpeg'
$ffmpegPath = Resolve-Ffmpeg
if ($ffmpegPath -and (Test-Runs $ffmpegPath @('-version'))) {
    Ok "ffmpeg found ($ffmpegPath)."
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    # Auto-install UNELEVATED: Gyan.FFmpeg is a portable package, so an
    # unelevated winget drops its shim at %LOCALAPPDATA%\Microsoft\WinGet\Links
    # - exactly where Resolve-Ffmpeg / the runtime looks. Elevating would put it
    # in the admin profile or a machine Links dir the runtime doesn't probe.
    Warn 'ffmpeg not found - installing via winget (Gyan.FFmpeg, no admin needed)...'
    try {
        & winget install --id Gyan.FFmpeg -e --silent `
            --accept-source-agreements --accept-package-agreements
    } catch {}
    Sync-Path
    $ffmpegPath = Resolve-Ffmpeg
    if ($ffmpegPath -and (Test-Runs $ffmpegPath @('-version'))) {
        Ok "ffmpeg installed ($ffmpegPath)."
    } else {
        Warn 'ffmpeg install did not complete - you can finish it later.'
        Add-DepWarning 'ffmpeg' 'winget install Gyan.FFmpeg'
    }
} else {
    Warn 'ffmpeg not found and winget is unavailable.'
    Add-DepWarning 'ffmpeg' 'winget install Gyan.FFmpeg   (or: choco install ffmpeg)'
}

# 7 - Copy plugin into DaVinci Resolve (elevated — the only step that needs admin)
Step 7 'Installing plugin into DaVinci Resolve'
if (-not (Test-Admin)) {
    Write-Host '       (Windows will ask for administrator approval to copy the plugin)' -ForegroundColor DarkGray
}
if (-not (Copy-Plugin)) {
    Fail 'Could not copy the plugin into DaVinci Resolve (the administrator prompt may have been declined, or the copy failed).'
}
Ok "Installed to $Dest"

# 8 - Verify
Step 8 'Verifying installation'
$required = @(
    'manifest.xml',
    'main.js',
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
if ($script:DepWarnings.Count -eq 0) {
    Show-Success
} else {
    Show-Warnings
}
Read-Host '       Press Enter to exit'
