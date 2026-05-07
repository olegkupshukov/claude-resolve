let currentResponse = null;
let isProcessing = false;

window.addEventListener('DOMContentLoaded', async () => {
    await refreshStatus();

    document.getElementById('btn-send').addEventListener('click', sendPrompt);
    document.getElementById('btn-stop').addEventListener('click', stopResponse);
    document.getElementById('btn-templates').addEventListener('click', toggleTemplatesPanel);
    document.getElementById('btn-delete-all').addEventListener('click', deleteAllTemplates);
    document.getElementById('prompt').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendPrompt();
        }
    });

    window.claudeAPI.onOutput(handleOutput);
    window.claudeAPI.onError(handleOutput);
    window.claudeAPI.onDone(handleDone);
});

window.addEventListener('beforeunload', async () => {
    await window.resolveAPI.cleanup();
});

async function refreshStatus() {
    const [proj, page, tl] = await Promise.all([
        window.resolveAPI.getProjectName(),
        window.resolveAPI.getCurrentPage(),
        window.resolveAPI.getCurrentTimeline()
    ]);
    document.getElementById('projectName').textContent = proj || '--';
    document.getElementById('currentPage').textContent = page || '--';
    document.getElementById('currentTimeline').textContent = tl || '--';
}

function setInputEnabled(enabled) {
    const input = document.getElementById('prompt');
    const btnSend = document.getElementById('btn-send');
    const btnStop = document.getElementById('btn-stop');
    input.disabled = !enabled;
    btnSend.hidden = !enabled;
    btnStop.hidden = enabled;
    if (enabled) input.focus();
}

function sendPrompt() {
    const input = document.getElementById('prompt');
    const text = input.value.trim();
    if (!text || isProcessing) return;

    input.value = '';
    isProcessing = true;
    setInputEnabled(false);
    addMessage(text, 'user');

    const output = document.getElementById('output');
    currentResponse = document.createElement('div');
    currentResponse.className = 'message assistant thinking';
    currentResponse.textContent = 'Thinking...';
    output.appendChild(currentResponse);
    scrollToBottom();

    window.claudeAPI.sendPrompt(text);
}

function stopResponse() {
    window.claudeAPI.abort();
}

function handleOutput(data) {
    if (!currentResponse) return;
    if (currentResponse.classList.contains('thinking')) {
        currentResponse.classList.remove('thinking');
        currentResponse.textContent = '';
    }
    currentResponse.textContent += data;
    scrollToBottom();
}

function handleDone(code) {
    if (currentResponse && currentResponse.classList.contains('thinking')) {
        currentResponse.classList.remove('thinking');
        currentResponse.textContent = code === 2 ? '(Stopped)' : '(No response)';
    } else if (code === 2 && currentResponse) {
        currentResponse.textContent += '\n(Stopped)';
    }
    if (code === 1 && currentResponse) {
        currentResponse.classList.add('error');
    }

    if (code === 0 && currentResponse) {
        const parsed = tryParseOGrafResponse(currentResponse.textContent);
        if (parsed) {
            createPreview(currentResponse, parsed);

            const btnInstall = document.createElement('button');
            btnInstall.className = 'btn btn-install';
            btnInstall.textContent = 'Install';
            btnInstall.addEventListener('click', () => installOGraf(btnInstall, parsed));
            currentResponse.appendChild(btnInstall);
        }
    }

    currentResponse = null;
    isProcessing = false;
    setInputEnabled(true);
}

function tryParseOGrafResponse(text) {
    const jsonMatch = text.match(/```json\s*\n\/\/ FILE:\s*(\S+\.ograf\.json)\s*\n([\s\S]*?)```/);
    const jsMatch = text.match(/```javascript\s*\n\/\/ FILE:\s*(\S+\.js)\s*\n([\s\S]*?)```/);
    if (!jsonMatch || !jsMatch) return null;

    const templateName = jsonMatch[1].replace('.ograf.json', '');
    return {
        templateName,
        manifestJSON: jsonMatch[2].trim(),
        componentJS: jsMatch[2].trim()
    };
}

function createPreview(container, parsed) {
    const manifest = JSON.parse(parsed.manifestJSON);
    const duration = manifest.duration || 5;

    const defaults = {};
    const props = manifest.schema && manifest.schema.properties;
    if (props) {
        for (const [key, prop] of Object.entries(props)) {
            if (prop.default !== undefined) defaults[key] = prop.default;
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper';

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-frame';
    iframe.sandbox = 'allow-scripts';

    const iframeHTML = `<!DOCTYPE html>
<html><head><style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
#host{position:relative;width:100%;height:100%}
</style></head><body>
<div id="host"></div>
<script type="module">
const code=${JSON.stringify(parsed.componentJS)};
const blob=new Blob([code],{type:'text/javascript'});
const url=URL.createObjectURL(blob);
const mod=await import(url);
URL.revokeObjectURL(url);
const Cls=mod.default;
customElements.define('ograf-preview',Cls);
const el=document.createElement('ograf-preview');
document.getElementById('host').appendChild(el);
await el.load({data:${JSON.stringify(defaults)}});
await el.playAction();
let t=0;const dur=${duration}*1000;const step=1000/30;let iv=null;
function play(){if(iv)return;iv=setInterval(async()=>{t+=step;if(t>dur)t=0;await el.goToTime({timestamp:t})},step)}
function pause(){if(iv){clearInterval(iv);iv=null}}
window.addEventListener('message',e=>{if(e.data==='play')play();else if(e.data==='pause')pause()});
play();
<\/script></body></html>`;

    iframe.srcdoc = iframeHTML;
    wrapper.appendChild(iframe);

    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn-icon btn-play';
    btnPlay.textContent = '\u23F8';
    let isPlaying = true;
    btnPlay.addEventListener('click', () => {
        isPlaying = !isPlaying;
        iframe.contentWindow.postMessage(isPlaying ? 'play' : 'pause', '*');
        btnPlay.textContent = isPlaying ? '\u23F8' : '\u25B6';
    });
    wrapper.appendChild(btnPlay);

    container.appendChild(wrapper);
    scrollToBottom();
}

async function installOGraf(btn, parsed) {
    btn.disabled = true;
    btn.textContent = 'Installing...';
    try {
        await window.overlayAPI.save(parsed);
        btn.textContent = 'Installed \u2713 \u2014 Restart Resolve to find it in Effects Library > Titles > HTML Titles > ClaudeResolve';
    } catch (err) {
        btn.textContent = 'Install Failed';
        btn.classList.add('error');
    }
}

async function toggleTemplatesPanel() {
    const panel = document.getElementById('templates-panel');
    if (panel.hidden) {
        await refreshTemplatesList();
        panel.hidden = false;
    } else {
        panel.hidden = true;
    }
}

async function refreshTemplatesList() {
    const list = document.getElementById('templates-list');
    const templates = await window.overlayAPI.listTemplates();
    list.innerHTML = '';
    if (templates.length === 0) {
        list.textContent = 'No templates installed';
        return;
    }
    for (const tpl of templates) {
        const row = document.createElement('div');
        row.className = 'template-row';

        const name = document.createElement('span');
        name.className = 'template-name';
        name.textContent = tpl.name;

        const del = document.createElement('button');
        del.className = 'btn-icon btn-delete';
        del.textContent = '\u2715';
        del.title = 'Delete';
        del.addEventListener('click', async () => {
            await window.overlayAPI.deleteTemplate(tpl.folder);
            await refreshTemplatesList();
        });

        row.appendChild(name);
        row.appendChild(del);
        list.appendChild(row);
    }
}

async function deleteAllTemplates() {
    await window.overlayAPI.deleteAllTemplates();
    await refreshTemplatesList();
}

function addMessage(text, type) {
    const output = document.getElementById('output');
    const msg = document.createElement('div');
    msg.className = 'message ' + type;
    msg.textContent = text;
    output.appendChild(msg);
    scrollToBottom();
}

function scrollToBottom() {
    const output = document.getElementById('output');
    output.scrollTop = output.scrollHeight;
}
