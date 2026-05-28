import React from 'react';
import { PROMPT_PRESETS } from '../data/promptPresets';

export default function PromptPresets({ onPrompt, disabled, hasSelectedAssets }) {
    const assetPresets = [
        { id: 'asset-logo', label: 'Logo Mark', prompt: 'Use the selected logo asset as the central mark in a polished 5 second title reveal. Keep the logo crisp and do not redraw it.' },
        { id: 'asset-bg', label: 'Image Background', prompt: 'Use the selected image asset as the background or main visual texture for a cinematic 5 second title card.' },
        { id: 'asset-product', label: 'Product Reveal', prompt: 'Use the selected product asset in a premium product reveal. Keep the product recognizable and avoid covering it with text.' },
        { id: 'asset-texture', label: 'Use Texture', prompt: 'Use the selected texture asset subtly in the background while keeping typography readable and motion refined.' }
    ];
    const presets = hasSelectedAssets ? [...PROMPT_PRESETS, ...assetPresets] : PROMPT_PRESETS;
    return (
        <div className="preset-strip" aria-label="Prompt presets">
            {presets.map(preset => (
                <button
                    key={preset.id}
                    className="preset-chip"
                    disabled={disabled}
                    onClick={() => onPrompt(preset.prompt, { displayText: preset.label })}
                    title={preset.prompt}
                >
                    {preset.label}
                </button>
            ))}
        </div>
    );
}
