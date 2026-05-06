// Claude Resolve — Renderer Process
// Runs in the sandboxed browser context. Accesses Resolve only through
// window.resolveAPI (exposed by preload.js via contextBridge).

window.addEventListener('DOMContentLoaded', async () => {
    await refreshStatus();
});

window.addEventListener('beforeunload', async () => {
    await window.resolveAPI.cleanup();
});

async function refreshStatus() {
    const [projectName, currentPage, currentTimeline] = await Promise.all([
        window.resolveAPI.getProjectName(),
        window.resolveAPI.getCurrentPage(),
        window.resolveAPI.getCurrentTimeline()
    ]);

    document.getElementById('projectName').textContent = projectName || '--';
    document.getElementById('currentPage').textContent = currentPage || '--';
    document.getElementById('currentTimeline').textContent = currentTimeline || '--';
}
