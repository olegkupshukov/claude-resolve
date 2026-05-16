// Deterministic gradient from a filename — used as the sidebar render
// thumbnail fallback when no rendered frame is available.
// Hues are biased toward the brand's warm/cool span so fallbacks still
// read on-palette next to real thumbnails.

export function hashGradient(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = (h * 31 + name.charCodeAt(i)) >>> 0;
    }
    // Warm band ~20-50°, cool band ~150-185° — pick one per end.
    const warm = 20 + (h % 30);
    const cool = 150 + ((h >> 8) % 35);
    const angle = 110 + ((h >> 16) % 60);
    return `linear-gradient(${angle}deg, hsl(${warm} 60% 42%), hsl(${cool} 45% 30%))`;
}
