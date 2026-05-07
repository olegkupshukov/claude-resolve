import React, { useState, useRef, useEffect } from 'react';
import StatusBar from './StatusBar';
import Chat from './Chat';
import ChatInput from './ChatInput';
import TemplateManager from './TemplateManager';
import PreviewPanel from './PreviewPanel';

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
    const [activeTool, setActiveTool] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const nextId = useRef(0);
    const pendingCost = useRef(null);

    useEffect(() => {
        const width = previewData ? 900 : 500;
        window.windowAPI?.resize(width, 700);
    }, [previewData]);

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
            let newParsed = null;
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
                if (code === 0) {
                    msg.parsed = tryParseOGrafResponse(msg.text);
                    newParsed = msg.parsed;
                }
                msg.cost = pendingCost.current;
                updated[updated.length - 1] = msg;
                return updated;
            });
            if (newParsed) setPreviewData(newParsed);
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

    function handleIterate(text) {
        setPreviewData(null);
        handleSend(`Update the template: ${text}`);
    }

    function handleOpenPreview(parsed) {
        setPreviewData(parsed);
    }

    return (
        <>
            <StatusBar />
            <div id="app-body">
                <div id="chat-column">
                    <Chat messages={messages} activeTool={activeTool}
                        onOpenPreview={handleOpenPreview} />
                    {templatesOpen && <TemplateManager />}
                    <ChatInput
                        onSend={handleSend}
                        onStop={handleStop}
                        isProcessing={isProcessing}
                        onToggleTemplates={() => setTemplatesOpen(v => !v)}
                    />
                </div>
                {previewData && (
                    <PreviewPanel
                        parsed={previewData}
                        onClose={() => setPreviewData(null)}
                        onIterate={handleIterate}
                    />
                )}
            </div>
        </>
    );
}
