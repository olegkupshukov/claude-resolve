import React, { useRef, useState, useMemo } from 'react';

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

function HTMLPreview({ parsed }) {
    const iframeRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);

    const srcdoc = useMemo(() => {
        const playScript = `<script>
document.addEventListener('DOMContentLoaded',function(){
var fps=25,dur=window.getAnimationDuration(),total=Math.ceil(dur*fps),f=0,running=true;
function tick(){if(!running){requestAnimationFrame(tick);return}
window.renderFrame(f,fps);f=(f+1)%total;requestAnimationFrame(tick)}
window.addEventListener('message',function(e){if(e.data==='play')running=true;else if(e.data==='pause')running=false});
tick();
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

export default function Preview({ parsed }) {
    if (parsed.type === 'html') return <HTMLPreview parsed={parsed} />;
    return <OGrafPreview parsed={parsed} />;
}
