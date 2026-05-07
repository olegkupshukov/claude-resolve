import React, { useState, useRef, useEffect } from 'react';
import StatusBar from './StatusBar';
import Chat from './Chat';
import ChatInput from './ChatInput';
import TemplateManager from './TemplateManager';

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
    const [messages, setMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [activeTool, setActiveTool] = useState(null);
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

        window.addEventListener('beforeunload', () => {
            window.resolveAPI.cleanup();
        });
    }, []);

    function handleSend(text) {
        const userId = nextId.current++;
        const assistantId = nextId.current++;
        setMessages(prev => [
            ...prev,
            { id: userId, type: 'user', text },
            { id: assistantId, type: 'assistant', text: 'Thinking...', isThinking: true, isError: false, parsed: null }
        ]);
        setIsProcessing(true);
        setActiveTool(null);
        window.claudeAPI.sendPrompt(text);
    }

    function handleStop() {
        window.claudeAPI.abort();
    }

    return (
        <>
            <StatusBar />
            <Chat messages={messages} activeTool={activeTool} />
            {templatesOpen && <TemplateManager />}
            <ChatInput
                onSend={handleSend}
                onStop={handleStop}
                isProcessing={isProcessing}
                onToggleTemplates={() => setTemplatesOpen(v => !v)}
            />
        </>
    );
}
