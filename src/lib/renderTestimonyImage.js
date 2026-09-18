// Renders a testimony as a 1080x1080 PNG blob.
// Uses the browser's canvas API — no external deps.

const WIDTH = 1080;
const HEIGHT = 1080;
const PADDING = 100;

const COLORS = {
    bg: '#392282',
    accent: '#ece700',
    text: '#f5f3ff',
    textMuted: 'rgba(245, 243, 255, 0.55)',
};

// Wrap text into lines that fit within maxWidth, using the current ctx.font.
function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// Shrink font size until wrapped text fits within maxHeight.
function fitText(ctx, text, maxWidth, maxHeight, startSize, minSize = 32) {
    let size = startSize;
    let lines = [];

    while (size >= minSize) {
        ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        lines = wrapText(ctx, text, maxWidth);
        const lineHeight = size * 1.3;
        if (lines.length * lineHeight <= maxHeight) {
            return { lines, size, lineHeight };
        }
        size -= 4;
    }

    ctx.font = `600 ${minSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    lines = wrapText(ctx, text, maxWidth);
    return { lines, size: minSize, lineHeight: minSize * 1.3 };
}

export async function renderTestimonyImage(testimony) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');

    // --- Background ---
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // --- Yellow accent bar at top ---
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(0, 0, WIDTH, 16);

    // --- Header label ---
    ctx.fillStyle = COLORS.accent;
    ctx.font = '600 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('WIND OF FAITH 2026 ANONYMOUS TESTIMONY', PADDING, PADDING);

    // --- Divider ---
    ctx.strokeStyle = 'rgba(236, 231, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, PADDING + 60);
    ctx.lineTo(WIDTH - PADDING, PADDING + 60);
    ctx.stroke();

    // --- Testimony text (centered vertically in the middle block) ---
    const textTop = PADDING + 140;
    const textBottom = HEIGHT - PADDING - 120;
    const textMaxWidth = WIDTH - PADDING * 2;
    const textMaxHeight = textBottom - textTop;

    const { lines, size, lineHeight } = fitText(
        ctx,
        testimony.text,
        textMaxWidth,
        textMaxHeight,
        72
    );

    const totalTextHeight = lines.length * lineHeight;
    let y = textTop + (textMaxHeight - totalTextHeight) / 2;

    ctx.fillStyle = COLORS.text;
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (const line of lines) {
        ctx.fillText(line, PADDING, y);
        y += lineHeight;
    }

    // --- Date at bottom ---
    const date = new Date(testimony.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '400 24px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(date, PADDING, HEIGHT - PADDING);

    // --- Return as blob ---
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
            'image/png'
        );
    });
}