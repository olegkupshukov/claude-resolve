import React, { useRef, useState, useEffect, useMemo, memo } from 'react';

const HTMLPreview = memo(function HTMLPreview({ parsed }) {
    const iframeRef = useRef(null);
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const [isPlaying, setIsPlaying] = useState(true);

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
        const playScript = `<script>
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
        const html = parsed.html;
        if (html.includes('</body>')) return html.replace('</body>', playScript + '</body>');
        if (html.includes('</html>')) return html.replace('</html>', playScript + '</html>');
        return html + playScript;
    }, [parsed]);

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
            <button className="btn-icon btn-play" onClick={togglePlay}>
                {isPlaying ? '⏸' : '▶'}
            </button>
        </div>
    );
});

export default function Preview({ parsed }) {
    return <HTMLPreview parsed={parsed} />;
}
