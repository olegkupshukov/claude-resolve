let currentResponse = null;
let isProcessing = false;

window.addEventListener('DOMContentLoaded', async () => {
    await refreshStatus();

    document.getElementById('btn-send').addEventListener('click', sendPrompt);
    document.getElementById('btn-stop').addEventListener('click', stopResponse);
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
            const btn = document.createElement('button');
            btn.className = 'btn btn-install';
            btn.textContent = 'Install & Add to Timeline';
            btn.addEventListener('click', () => installOGraf(btn, parsed));
            currentResponse.appendChild(btn);
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

async function installOGraf(btn, parsed) {
    btn.disabled = true;
    btn.textContent = 'Installing...';
    try {
        await window.overlayAPI.save(parsed);
        // Use the manifest display name — Resolve indexes titles by this field
        const manifest = JSON.parse(parsed.manifestJSON);
        const displayName = manifest.name || parsed.templateName;
        btn.textContent = 'Waiting for Resolve...';
        const item = await window.overlayAPI.insertTitle(displayName);
        btn.textContent = item ? 'Added to Timeline' : 'Installed (add manually)';
    } catch (err) {
        btn.textContent = 'Install Failed';
        btn.classList.add('error');
    }
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
