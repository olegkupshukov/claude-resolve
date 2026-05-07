const WorkflowIntegration = require('../WorkflowIntegration.node');

const PLUGIN_ID = 'com.clauderesolve.plugin';

let resolveObj = null;
let projectManagerObj = null;

async function initResolveInterface() {
    const isSuccess = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!isSuccess) {
        console.error('Failed to initialize Resolve interface');
        return null;
    }

    const resolve = await WorkflowIntegration.GetResolve();
    if (!resolve) {
        console.error('Failed to get Resolve object');
        return null;
    }

    return resolve;
}

async function cleanupResolveInterface() {
    const isSuccess = WorkflowIntegration.CleanUp();
    if (!isSuccess) {
        console.error('Failed to cleanup Resolve interface');
    }
    resolveObj = null;
    projectManagerObj = null;
    return isSuccess;
}

async function getResolve() {
    if (!resolveObj) {
        resolveObj = await initResolveInterface();
    }
    return resolveObj;
}

async function getProjectManager() {
    if (!projectManagerObj) {
        const resolve = await getResolve();
        if (resolve) {
            projectManagerObj = await resolve.GetProjectManager();
        }
    }
    return projectManagerObj;
}

async function getCurrentProject() {
    const pm = await getProjectManager();
    if (!pm) return null;
    return await pm.GetCurrentProject();
}

async function handleOpenPage(_event, pageName) {
    const resolve = await getResolve();
    if (!resolve) return false;
    if (await resolve.GetCurrentPage() === pageName) return true;
    return await resolve.OpenPage(pageName);
}

async function handleGetCurrentPage() {
    const resolve = await getResolve();
    if (!resolve) return null;
    return await resolve.GetCurrentPage();
}

async function handleGetProjectName() {
    const project = await getCurrentProject();
    if (!project) return null;
    return await project.GetName();
}

async function handleGetCurrentTimeline() {
    const project = await getCurrentProject();
    if (!project) return null;
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return null;
    return await timeline.GetName();
}

function setupResolveHandlers(ipcMain) {
    ipcMain.handle('resolve:openPage', handleOpenPage);
    ipcMain.handle('resolve:getCurrentPage', handleGetCurrentPage);
    ipcMain.handle('resolve:getProjectName', handleGetProjectName);
    ipcMain.handle('resolve:getCurrentTimeline', handleGetCurrentTimeline);
    ipcMain.handle('resolve:cleanup', cleanupResolveInterface);
}

module.exports = { setupResolveHandlers, handleGetProjectName, handleGetCurrentPage, handleGetCurrentTimeline };
