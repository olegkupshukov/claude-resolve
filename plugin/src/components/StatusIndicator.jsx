import React, { useState, useEffect, useRef } from 'react';

const TOOL_LABELS = {
    Read: 'Reading',
    Write: 'Writing',
    Edit: 'Editing',
    Bash: 'Running',
    Grep: 'Searching',
    Glob: 'Finding files',
    Agent: 'Delegating',
    WebSearch: 'Searching web',
    WebFetch: 'Fetching'
};

function shortPath(p) {
    if (!p) return null;
    const name = p.replace(/\\/g, '/').split('/').pop();
    return name.length > 24 ? name.slice(0, 21) + '...' : name;
}

const MODEL_LABELS = { sonnet: 'Sonnet', opus: 'Opus' };

export default function StatusIndicator({ tool, tokens, model }) {
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef(Date.now());

    useEffect(() => {
        startRef.current = Date.now();
        const id = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const parts = ['Thinking'];
    if (elapsed > 0) parts.push(`${elapsed}s`);
    if (tokens > 0) parts.push(`${tokens} tokens`);
    if (model) parts.push(MODEL_LABELS[model] || model);
    if (tool) {
        const action = TOOL_LABELS[tool.name] || tool.name;
        const file = shortPath(tool.file);
        parts.push(file ? `${action} ${file}` : action);
    }

    return (
        <div className="tool">
            <span className="spin" />
            <span>{parts.join(' · ')}</span>
        </div>
    );
}
