import React from 'react';

function renderControl(key, prop, value, onChange) {
    if (prop.gddType === 'color-rrggbb') {
        return (
            <input type="color" value={value || '#000000'}
                onChange={e => onChange(key, e.target.value)} />
        );
    }
    if (prop.type === 'boolean') {
        return (
            <input type="checkbox" checked={!!value}
                onChange={e => onChange(key, e.target.checked)} />
        );
    }
    if (prop.type === 'number' || prop.type === 'integer') {
        const min = prop.minimum ?? 0;
        const max = prop.maximum ?? 100;
        const step = prop.type === 'integer' ? 1 : (max - min) / 100;
        const val = value ?? prop.default ?? min;
        return (
            <>
                <input type="range" min={min} max={max} step={step} value={val}
                    onChange={e => onChange(key, prop.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
                <span className="param-value">{val}</span>
            </>
        );
    }
    return (
        <input type="text" value={value ?? ''}
            onChange={e => onChange(key, e.target.value)} />
    );
}

export default function ParamEditor({ schema, values, onChange }) {
    if (!schema) return null;
    return (
        <div className="param-editor">
            {Object.entries(schema).map(([key, prop]) => (
                <div key={key} className="param-row">
                    <label className="param-label">{prop.title || key}</label>
                    {renderControl(key, prop, values[key], onChange)}
                </div>
            ))}
        </div>
    );
}
