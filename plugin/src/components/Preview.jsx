import React, { useRef, useState, useEffect, useMemo, memo } from 'react';

// Module-level singleton: fetched once per session, shared across all Preview
// instances. The bundle is ~1.2 MB (UMDs + base64 fonts), no point re-fetching.
let cachedBundle = null;
let pendingBundle = null;
function loadBundle() {
    if (cachedBundle) return Promise.resolve(cachedBundle);
    if (!pendingBundle) {
        pendingBundle = window.previewAPI.getRealtimeBundle()
            .then(b => { cachedBundle = b; return b; })
            .catch(() => { pendingBundle = null; return { umd: '', fonts: '' }; });
    }
    return pendingBundle;
}

function injectIntoHead(html, content) {
    if (html.includes('<head>')) return html.replace('<head>', '<head>' + content);
    if (html.includes('<html>')) return html.replace('<html>', '<html><head>' + content + '</head>');
    return '<head>' + content + '</head>' + html;
}

function injectBeforeBodyClose(html, content) {
    if (html.includes('</body>')) return html.replace('</body>', content + '</body>');
    if (html.includes('</html>')) return html.replace('</html>', content + '</html>');
    return html + content;
}

const FRAME_PLAY_SCRIPT = `<script>
document.addEventListener('DOMContentLoaded',function(){
if(typeof window.getAnimationDuration!=='function'||typeof window.renderFrame!=='function')return;
var fps=25,dur=window.getAnimationDuration(),total=Math.ceil(dur*fps);
var running=true,startTime=null,lastFrame=-1;
function tick(ts){
if(!running){startTime=null;requestAnimationFrame(tick);return}
if(!startTime)startTime=ts;
var elapsed=ts-startTime;
var f=Math.floor(elapsed/(1000/fps))%total;
if(f!==lastFrame){window.renderFrame(f,fps);lastFrame=f}
requestAnimationFrame(tick)}
window.addEventListener('message',function(e){if(e.data==='play')running=true;else if(e.data==='pause')running=false});
requestAnimationFrame(tick);
});
<\/script>`;

const HTMLPreview = memo(function HTMLPreview({ parsed }) {
    const iframeRef = useRef(null);
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const [isPlaying, setIsPlaying] = useState(true);
    const [bundle, setBundle] = useState(cachedBundle);

    useEffect(() => {
        if (!bundle) loadBundle().then(setBundle);
    }, [bundle]);

    useEffect(() => {
        function updateScale() {
            if (containerRef.current) {
                setScale(containerRef.current.clientWidth / 1920);
            }
        }
        updateScale();
        const obs = new ResizeObserver(updateScale);
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const srcdoc = useMemo(() => {
        if (!bundle) return '<!DOCTYPE html><html><body style="margin:0;background:#000"></body></html>';

        let html = parsed.html;
        const headInjections = [];
        headInjections.push(bundle.fonts);
        if (parsed.mode === 'realtime') {
            headInjections.push(`<script>${bundle.umd}</script>`);
        }
        html = injectIntoHead(html, headInjections.join(''));

        if (parsed.mode !== 'realtime') {
            html = injectBeforeBodyClose(html, FRAME_PLAY_SCRIPT);
        }
        return html;
    }, [parsed, bundle]);

    function togglePlay() {
        const next = !isPlaying;
        setIsPlaying(next);
        iframeRef.current?.contentWindow?.postMessage(next ? 'play' : 'pause', '*');
    }

    return (
        <div className="preview-wrapper">
            <div ref={containerRef} className="preview-scale-container">
                <iframe
                    ref={iframeRef}
                    className="preview-frame-native"
                    width="1920"
                    height="1080"
                    sandbox="allow-scripts"
                    srcDoc={srcdoc}
                    style={{ transform: `scale(${scale})` }}
                />
            </div>
            {parsed.mode !== 'realtime' && (
                <button className="btn-icon btn-play" onClick={togglePlay}>
                    {isPlaying ? '⏸' : '▶'}
                </button>
            )}
        </div>
    );
});

export default function Preview({ parsed }) {
    return <HTMLPreview parsed={parsed} />;
}
