const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pluginPkg = JSON.parse(fs.readFileSync(path.join(root, 'plugin', 'package.json'), 'utf8'));
const outDir = path.join(root, 'dist', 'release');
const zipName = `resolve-ai-${pluginPkg.version || 'dev'}.zip`;
const zipPath = path.join(outDir, zipName);
const stageDir = path.join(outDir, 'resolve-ai');

function copyRecursive(source, target) {
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const entry of fs.readdirSync(source)) {
            if (['node_modules', 'dist', '.git'].includes(entry)) continue;
            copyRecursive(path.join(source, entry), path.join(target, entry));
        }
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

for (const item of ['plugin', 'community-templates', 'screenshots']) {
    const source = path.join(root, item);
    if (fs.existsSync(source)) copyRecursive(source, path.join(stageDir, item));
}

for (const file of ['README.md', 'CONTRIBUTING.md', 'RELEASE_NOTES.md', 'LICENSE', 'install.bat', 'install.ps1', 'install.sh', 'install.command']) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) copyRecursive(source, path.join(stageDir, file));
}

fs.rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${stageDir}\\*" -DestinationPath "${zipPath}" -Force`
    ], { stdio: 'inherit' });
} else {
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
}

console.log(zipPath);
