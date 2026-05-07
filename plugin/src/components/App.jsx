import React, { useState, useRef, useEffect } from 'react';
import StatusBar from './StatusBar';
import Chat from './Chat';
import ChatInput from './ChatInput';
import Sidebar from './Sidebar';
import WelcomeScreen from './WelcomeScreen';

function tryParseOGrafResponse(text) {
    const jsonMatch = text.match(/```json\s*\n\/\/ FILE:\s*(\S+\.ograf\.json)\s*\n([\s\S]*?)```/);
    const jsMatch = text.match(/```javascript\s*\n\/\/ FILE:\s*(\S+\.js)\s*\n([\s\S]*?)```/);
    if (!jsonMatch || !jsMatch) return null;
    const templateName = jsonMatch[1].replace('.ograf.json', '');
    return {
        type: 'ograf',
        templateName,
        manifestJSON: jsonMatch[2].trim(),
        componentJS: jsMatch[2].trim()
    };
}

function tryParseStandardHTML(text) {
    const htmlMatch = text.match(/```html\s*\n(?:\/\/ FILE:\s*(\S+\.html)\s*\n)?([\s\S]*?)```/);
    if (!htmlMatch) return null;
    const html = htmlMatch[2].trim();
    if (!html.includes('renderFrame') || !html.includes('getAnimationDuration')) return null;
    const name = htmlMatch[1]?.replace('.html', '') || 'Overlay';
    return { type: 'html', name, html };
}

export default function App() {
    const [authState, setAuthState] = useState('checking');
    const [welcomed, setWelcomed] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [config, setConfig] = useState({ mode: 'mov', fps: 25, width: 1920, height: 1080 });
    const [messages, setMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTool, setActiveTool] = useState(null);
    const [tokenCount, setTokenCount] = useState(0);
    const nextId = useRef(0);
    const pendingCost = useRef(null);

    useEffect(() => {
        function appendToLast(data) {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (!last || last.type !== 'assistant') return prev;
                const updated = [...prev];
                const msg = { ...last };
                if (msg.isThinking) {
                    msg.isThinking = false;
                    msg.text = '';
                }
                msg.text += data;
                updated[updated.length - 1] = msg;
                return updated;
            });
        }

        window.claudeAPI.onOutput((data) => {
            setActiveTool(null);
            appendToLast(data);
        });
        window.claudeAPI.onError(appendToLast);

        window.claudeAPI.onStatus((data) => {
            if (data.type === 'tool') {
                setActiveTool({ name: data.name, file: data.file });
            } else if (data.type === 'tokens') {
                setTokenCount(data.output);
            } else if (data.type === 'result') {
                pendingCost.current = data.cost;
            }
        });

        window.claudeAPI.onDone((code) => {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (!last || last.type !== 'assistant') return prev;
                const updated = [...prev];
                const msg = { ...last };
                if (msg.isThinking) {
                    msg.isThinking = false;
                    msg.text = code === 2 ? '(Stopped)' : '(No response)';
                } else if (code === 2) {
                    msg.text += '\n(Stopped)';
                }
                if (code === 1) msg.isError = true;
                if (code === 0) msg.parsed = tryParseOGrafResponse(msg.text) || tryParseStandardHTML(msg.text);
                msg.cost = pendingCost.current;
                updated[updated.length - 1] = msg;
                return updated;
            });
            pendingCost.current = null;
            setActiveTool(null);
            setIsProcessing(false);
        });

        window.overlayAPI.syncToMediaPool().catch(() => {});
        window.configAPI.get().then(setConfig);

        window.claudeAPI.checkAuth().then((result) => {
            setAuthState(result.status);
        });

        function handleUnload() {
            window.resolveAPI.cleanup();
        }
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);

    function handleSend(text) {
        setWelcomed(false);
        const userId = nextId.current++;
        const assistantId = nextId.current++;
        setMessages(prev => [
            ...prev,
            { id: userId, type: 'user', text },
            { id: assistantId, type: 'assistant', text: 'Thinking...', isThinking: true, isError: false, parsed: null }
        ]);
        setIsProcessing(true);
        setActiveTool(null);
        setTokenCount(0);
        window.claudeAPI.sendPrompt(text);
    }

    function handleStop() {
        window.claudeAPI.abort();
    }

    async function handleConfigChange(partial) {
        const updated = await window.configAPI.set(partial);
        setConfig(updated);
    }

    async function handleModeSwitch(newMode) {
        if (newMode === config.mode) return;
        const updated = await window.configAPI.set({ mode: newMode });
        setConfig(updated);
        if (!welcomed) {
            setMessages([]);
            setIsProcessing(false);
            setActiveTool(null);
            window.claudeAPI.restart();
        }
    }

    function handleToggleSidebar() {
        const next = !sidebarOpen;
        setSidebarOpen(next);
        window.windowAPI.resize({ width: next ? 720 : 500, height: 700 }).catch(() => {});
    }

    const showWelcome = authState !== 'ready' || welcomed;

    return (
        <>
            <StatusBar />
            <div className="app-body">
                {sidebarOpen && (
                    <Sidebar
                        isOpen={sidebarOpen}
                        config={config}
                        onConfigChange={handleConfigChange}
                        onModeSwitch={handleModeSwitch}
                        onClose={handleToggleSidebar}
                    />
                )}
                <div className="app-main">
                    {showWelcome ? (
                        <WelcomeScreen
                            authState={authState}
                            onAuthStateChange={setAuthState}
                            onStart={() => setAuthState('ready')}
                            onPrompt={handleSend}
                            onDismiss={() => setWelcomed(false)}
                            mode={config.mode}
                            onModeSwitch={handleModeSwitch}
                        />
                    ) : (
                        <Chat messages={messages} activeTool={activeTool} tokenCount={tokenCount} />
                    )}
                </div>
            </div>
            <ChatInput
                onSend={handleSend}
                onStop={handleStop}
                isProcessing={isProcessing}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={handleToggleSidebar}
            />
        </>
    );
}
