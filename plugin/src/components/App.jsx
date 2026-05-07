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
        templateName,
        manifestJSON: jsonMatch[2].trim(),
        componentJS: jsMatch[2].trim()
    };
}

export default function App() {
    const [messages, setMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const nextId = useRef(0);

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

        window.claudeAPI.onOutput(appendToLast);
        window.claudeAPI.onError(appendToLast);

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
                if (code === 0) msg.parsed = tryParseOGrafResponse(msg.text);
                updated[updated.length - 1] = msg;
                return updated;
            });
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
        window.claudeAPI.sendPrompt(text);
    }

    function handleStop() {
        window.claudeAPI.abort();
    }

    return (
        <>
            <StatusBar />
            <Chat messages={messages} />
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
