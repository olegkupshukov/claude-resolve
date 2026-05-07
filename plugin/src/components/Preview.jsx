import React, { useRef, useState, useMemo, memo } from 'react';

function OGrafPreview({ parsed }) {
    const iframeRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);

    const srcdoc = useMemo(() => {
        const manifest = JSON.parse(parsed.manifestJSON);
        const duration = manifest.duration || 5;
        const defaults = {};
        const props = manifest.schema && manifest.schema.properties;
        if (props) {
            for (const [key, prop] of Object.entries(props)) {
                if (prop.default !== undefined) defaults[key] = prop.default;
            }
        }

        return `<!DOCTYPE html>
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
    }, [parsed]);

    function togglePlay() {
        const next = !isPlaying;
        setIsPlaying(next);
        iframeRef.current?.contentWindow?.postMessage(next ? 'play' : 'pause', '*');
    }

    return (
        <div className="preview-wrapper">
            <iframe
                ref={iframeRef}
                className="preview-frame"
                sandbox="allow-scripts"
                srcDoc={srcdoc}
            />
            <button className="btn-icon btn-play" onClick={togglePlay}>
                {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
        </div>
    );
}

const HTMLPreview = memo(function HTMLPreview({ parsed }) {
    const iframeRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);

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
        const scaleStyle = `<style>html{transform-origin:top left;transform:scale(calc(100vw/1920));width:1920px;height:1080px;overflow:hidden}</style>`;
        let html = parsed.html;
        if (html.includes('</head>')) html = html.replace('</head>', scaleStyle + '</head>');
        else html = scaleStyle + html;
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
            <iframe
                ref={iframeRef}
                className="preview-frame"
                sandbox="allow-scripts"
                srcDoc={srcdoc}
            />
            <button className="btn-icon btn-play" onClick={togglePlay}>
                {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
        </div>
    );
});

export default function Preview({ parsed }) {
    if (parsed.type === 'html') return <HTMLPreview parsed={parsed} />;
    return <OGrafPreview parsed={parsed} />;
}
