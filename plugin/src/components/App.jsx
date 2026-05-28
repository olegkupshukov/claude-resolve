import React, { useState, useRef, useEffect } from 'react';
import TitleBar from './TitleBar';
import Chat from './Chat';
import ChatInput from './ChatInput';
import Sidebar from './Sidebar';
import WelcomeScreen from './WelcomeScreen';
import PromptPresets from './PromptPresets';

function tryParseStandardHTML(text) {
    const matches = [...String(text || '').matchAll(/```html\s*\n(?:(?:\/\/|<!--)\s*FILE:\s*(\S+\.html)(?:\s*-->)?\s*\n)?([\s\S]*?)```/g)];
    const parsedBlocks = matches.map((htmlMatch, index) => {
        const html = htmlMatch[2].trim();
        if (!html.includes('getAnimationDuration')) return null;
        const hasFrame = html.includes('renderFrame');
        const hasReact = html.includes('ReactDOM.createRoot');
        if (!hasFrame && !hasReact) return null;
        return {
            type: 'html',
            name: htmlMatch[1]?.replace('.html', '') || `Variation${index + 1}`,
            html,
            mode: hasFrame ? 'frame' : 'realtime'
        };
    }).filter(Boolean);
    if (parsedBlocks.length > 1) {
        return { type: 'variations', name: `${parsedBlocks.length} Variations`, items: parsedBlocks };
    }
    if (parsedBlocks.length === 1) return parsedBlocks[0];

    const htmlMatch = text.match(/```html\s*\n(?:(?:\/\/|<!--)\s*FILE:\s*(\S+\.html)(?:\s*-->)?\s*\n)?([\s\S]*?)```/);
    if (!htmlMatch) return null;
    const html = htmlMatch[2].trim();
    if (!html.includes('getAnimationDuration')) return null;
    const hasFrame = html.includes('renderFrame');
    const hasReact = html.includes('ReactDOM.createRoot');
    if (!hasFrame && !hasReact) return null;
    const mode = hasFrame ? 'frame' : 'realtime';
    const name = htmlMatch[1]?.replace('.html', '') || 'Overlay';
    return { type: 'html', name, html, mode };
}

export default function App() {
    const [authInfo, setAuthInfo] = useState({ status: 'checking', provider: 'auto', label: 'AI provider' });
    const [welcomed, setWelcomed] = useState(true);
    const [sidebar, setSidebar] = useState({ open: false, view: 'tools' });
    const [config, setConfig] = useState({
        provider: 'auto',
        model: 'sonnet',
        codexModel: 'default',
        fps: 25,
        width: 1920,
        height: 1080,
        brandKit: {},
        selectedAssetIds: [],
        generation: { variationCount: 3, locks: {} },
        captions: { defaultStyle: 'clean' },
        assets: { maxImportSizeMb: 25 },
        ui: { activeToolTab: 'create' },
        gallery: { favorites: [], recentIds: [] }
    });
    const [messages, setMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTool, setActiveTool] = useState(null);
    const [activeProvider, setActiveProvider] = useState(null);
    const [tokenCount, setTokenCount] = useState(0);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [draftPrompt, setDraftPrompt] = useState({ text: '', revision: 0 });
    const nextId = useRef(0);
    const nextDraftRevision = useRef(1);

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

        const agentAPI = window.agentAPI || window.claudeAPI;

        agentAPI.onOutput((data) => {
            setActiveTool(null);
            appendToLast(data);
        });
        agentAPI.onError(appendToLast);

        agentAPI.onStatus((data) => {
            if (data.type === 'tool') {
                setActiveTool({ name: data.name, file: data.file });
            } else if (data.type === 'tokens') {
                setTokenCount(data.output);
            } else if (data.type === 'provider') {
                setActiveProvider(data.provider);
            }
        });

        agentAPI.onDone((code) => {
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
                if (code === 0) msg.parsed = tryParseStandardHTML(msg.text);
                updated[updated.length - 1] = msg;
                return updated;
            });
            setActiveTool(null);
            setIsProcessing(false);
        });

        window.overlayAPI.syncToMediaPool().catch(() => {});
        window.configAPI.get().then(async (nextConfig) => {
            let seededConfig = nextConfig;
            try {
                const timeline = await window.resolveAPI.getTimelineSettings();
                const timelinePatch = {};
                if (timeline?.fps) timelinePatch.fps = timeline.fps;
                if (timeline?.width && timeline?.height) {
                    timelinePatch.width = timeline.width;
                    timelinePatch.height = timeline.height;
                }
                if (Object.keys(timelinePatch).length > 0) {
                    seededConfig = await window.configAPI.set(timelinePatch);
                }
            } catch { /* timeline settings are best-effort */ }
            setConfig(seededConfig);
            return agentAPI.checkAuth();
        }).then(setAuthInfo);

        window.updatesAPI.check()
            .then(r => setUpdateAvailable(!!(r && r.hasUpdate)))
            .catch(() => {});

        function handleUnload() {
            window.resolveAPI.cleanup();
        }
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);

    function handleSend(text, options = {}) {
        const promptText = String(text || '').trim();
        if (!promptText || isProcessing) return false;
        const displayText = options.displayText || promptText;
        setWelcomed(false);
        const userId = nextId.current++;
        const assistantId = nextId.current++;
        setMessages(prev => [
            ...prev,
            { id: userId, type: 'user', text: displayText },
            {
                id: assistantId,
                type: 'assistant',
                text: 'Thinking...',
                prompt: options.originalPrompt || promptText,
                isThinking: true,
                isError: false,
                parsed: null
            }
        ]);
        setIsProcessing(true);
        setActiveTool(null);
        setActiveProvider(null);
        setTokenCount(0);
        (window.agentAPI || window.claudeAPI).sendPrompt(promptText);
        return true;
    }

    function handleDraftPrompt(text) {
        const promptText = String(text || '').trim();
        if (!promptText || isProcessing) return false;
        setWelcomed(false);
        setDraftPrompt({
            text: promptText,
            revision: nextDraftRevision.current++
        });
        return true;
    }

    function handleRegenerate(message, variation) {
        if (!message?.parsed?.html) return;
        const originalPrompt = message.prompt || 'Previous Resolve AI generation';
        const variationInstructions = {
            'More cinematic': 'Make the motion, staging, and visual drama more cinematic. Keep the same overall request and output contract.',
            Simpler: 'Simplify the design and motion while keeping the same core idea, dimensions, duration, and readability.',
            'Transparent BG': 'Make ONLY the background transparent/alpha. Keep the same 1920x1080 canvas, same composition scale, same layout, same timing, and same subject size. Do not shrink, crop, center inside a smaller panel, or add any opaque rectangle behind the design. Set html/body/stage backgrounds to transparent and keep visible text/line/art elements full-size.',
            Longer: 'Extend the animation duration while preserving the same visual style and final composition.',
            'Same style': 'Create a fresh variation in the same style, palette, composition scale, and motion language.',
            '3 variations': 'Create exactly three distinct complete HTML alternatives. Each alternative must be in its own fenced ```html block with a different FILE name. Keep the same request, dimensions, output contract, selected assets, and render safety rules.'
        };
        const prompt = [
            'Regenerate the previous Resolve AI overlay.',
            `Variation: ${variation}`,
            `Instruction: ${variationInstructions[variation] || variation}`,
            '',
            `Original request: ${originalPrompt}`,
            '',
            'Previous generated HTML:',
            '```html',
            message.parsed.html,
            '```',
            '',
            variation === '3 variations'
                ? 'Return exactly three complete replacement HTML files in three separate ```html fenced blocks. Preserve the overlay contract in every file.'
                : 'Return one complete replacement HTML file. Preserve the overlay contract.'
        ].join('\n');
        handleSend(prompt, {
            displayText: `Regenerate: ${variation}`,
            originalPrompt
        });
    }

    function sendAgentPrompt(promptText, displayText, originalPrompt, extra = {}) {
        setWelcomed(false);
        const userId = nextId.current++;
        const assistantId = nextId.current++;
        setMessages(prev => [
            ...prev,
            { id: userId, type: 'user', text: displayText || promptText },
            {
                id: assistantId,
                type: 'assistant',
                text: 'Thinking...',
                prompt: originalPrompt || promptText,
                isThinking: true,
                isError: false,
                parsed: null,
                ...extra
            }
        ]);
        setIsProcessing(true);
        setActiveTool(null);
        setActiveProvider(null);
        setTokenCount(0);
    }

    function handleRepair(message, repairInfo) {
        if (!message?.parsed?.html || isProcessing) return;
        const repairCount = Number(message.repairCount || 0) + 1;
        if (repairCount > 2) return;
        setMessages(prev => prev.map(item => (
            item.id === message.id ? { ...item, repairCount } : item
        )));
        sendAgentPrompt('Fix render error', 'Fix render error', message.prompt, { repairCount });
        (window.agentAPI || window.claudeAPI).repairRender({
            originalPrompt: message.prompt,
            html: message.parsed.html,
            error: repairInfo?.error,
            validationWarnings: repairInfo?.validationWarnings || [],
            repairCount: repairCount - 1
        }).catch(err => {
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (!last || last.type !== 'assistant') return prev;
                updated[updated.length - 1] = {
                    ...last,
                    isThinking: false,
                    isError: true,
                    text: err?.message || 'Repair failed'
                };
                return updated;
            });
            setIsProcessing(false);
        });
    }

    function handleStop() {
        (window.agentAPI || window.claudeAPI).abort();
    }

    async function handleConfigChange(partial) {
        const updated = await window.configAPI.set(partial);
        const modelChanged = partial.model && partial.model !== config.model;
        const codexModelChanged = partial.codexModel && partial.codexModel !== config.codexModel;
        const providerChanged = partial.provider && partial.provider !== config.provider;
        setConfig(updated);
        if (providerChanged) {
            setAuthInfo({ status: 'checking', provider: updated.provider || 'auto', label: 'AI provider' });
            (window.agentAPI || window.claudeAPI).checkAuth().then(setAuthInfo);
        }
        if ((modelChanged || codexModelChanged || providerChanged) && !welcomed) {
            setMessages([]);
            setIsProcessing(false);
            setActiveTool(null);
            setActiveProvider(null);
            (window.agentAPI || window.claudeAPI).restart();
        }
    }

    function resizeForSidebar(open) {
        window.windowAPI.resize({ width: open ? 900 : 500, height: 740 }).catch(() => {});
    }

    function showSidebarView(view) {
        setSidebar({ open: true, view });
        resizeForSidebar(true);
    }

    function closeSidebar() {
        setSidebar(prev => ({ ...prev, open: false }));
        resizeForSidebar(false);
    }

    function handleSettingsToggle() {
        if (!sidebar.open) {
            showSidebarView('settings');
        } else if (sidebar.view === 'settings') {
            closeSidebar();
        } else {
            showSidebarView('settings');
        }
    }

    function handleToolsToggle() {
        if (!sidebar.open) {
            showSidebarView('tools');
        } else if (sidebar.view === 'tools') {
            closeSidebar();
        } else {
            showSidebarView('tools');
        }
    }

    const showWelcome = authInfo.status !== 'ready' || welcomed;
    const sidebarOpen = sidebar.open;

    return (
        <>
            <div className="accent-strip" />
            <TitleBar />
            <div className={'body' + (sidebarOpen ? ' sidebar-open' : '')}>
                {sidebarOpen && (
                    <Sidebar
                        view={sidebar.view}
                        config={config}
                        onConfigChange={handleConfigChange}
                        onPrompt={handleSend}
                        onUsePrompt={handleDraftPrompt}
                        onShowTools={() => showSidebarView('tools')}
                        onClose={closeSidebar}
                    />
                )}
                <div className="main">
                    {showWelcome ? (
                        <WelcomeScreen
                            authInfo={authInfo}
                            config={config}
                            onAuthStateChange={setAuthInfo}
                            onStart={() => setAuthInfo(prev => ({ ...prev, status: 'ready' }))}
                            onPrompt={handleSend}
                            onDismiss={() => setWelcomed(false)}
                        />
                    ) : (
                        <Chat
                            messages={messages}
                            activeTool={activeTool}
                            tokenCount={tokenCount}
                            model={activeProvider === 'codex' ? config.codexModel : config.model}
                            provider={activeProvider || authInfo.provider || config.provider}
                            config={config}
                            onRegenerate={handleRegenerate}
                            onRepair={handleRepair}
                        />
                    )}
                    {!showWelcome && (
                        <PromptPresets
                            onPrompt={handleDraftPrompt}
                            disabled={isProcessing}
                            hasSelectedAssets={(config.selectedAssetIds || []).length > 0}
                        />
                    )}
                    <ChatInput
                        onSend={handleSend}
                        onStop={handleStop}
                        draftPrompt={draftPrompt}
                        isProcessing={isProcessing}
                        sidebarOpen={sidebarOpen}
                        sidebarView={sidebar.view}
                        onToggleSidebar={handleSettingsToggle}
                        onToggleTools={handleToolsToggle}
                        updateAvailable={updateAvailable}
                    />
                </div>
            </div>
        </>
    );
}
