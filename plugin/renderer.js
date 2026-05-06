let currentResponse = null;
let isProcessing = false;

window.addEventListener('DOMContentLoaded', async () => {
    await refreshStatus();

    document.getElementById('btn-send').addEventListener('click', sendPrompt);
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
    const btn = document.getElementById('btn-send');
    input.disabled = !enabled;
    btn.disabled = !enabled;
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
        currentResponse.textContent = '(No response)';
    }
    if (code !== 0 && currentResponse) {
        currentResponse.classList.add('error');
    }
    currentResponse = null;
    isProcessing = false;
    setInputEnabled(true);
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
