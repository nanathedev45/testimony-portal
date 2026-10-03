// Renders a testimony as a 1080x1080 PNG blob.
// Uses the browser's canvas API — no external deps.
// Text testimonies → text block
// Voice testimonies → voice-note graphic (play button + waveform)

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
    if (!text) return [];
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

// Deterministic pseudo-random from a string seed.
// Same seed → same sequence, so a testimony always renders the same waveform.
function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    return function next() {
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        return (hash % 1000) / 1000; // 0..1
    };
}

// Draw a WhatsApp-style voice note graphic centered in the given area.
function drawVoiceNote(ctx, testimony, centerY) {
    const rand = seededRandom(testimony._id || 'voice');

    // --- Layout constants ---
    const playRadius = 60;              // play button circle radius
    const gapAfterPlay = 40;            // space between play button and waveform
    const waveformWidth = WIDTH - PADDING * 2 - playRadius * 2 - gapAfterPlay;
    const waveformHeight = 120;         // max bar height
    const barCount = 48;                // how many bars
    const barGap = 6;                   // gap between bars

    // --- Play button ---
    const playCenterX = PADDING + playRadius;
    const playCenterY = centerY;

    // Yellow circle
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(playCenterX, playCenterY, playRadius, 0, Math.PI * 2);
    ctx.fill();

    // Triangle (in the deep blue, matching the background)
    const triSize = playRadius * 0.7;
    const triOffsetX = playRadius * 0.15; // nudge right for visual centering
    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.moveTo(playCenterX - triSize * 0.5 + triOffsetX, playCenterY - triSize * 0.7);
    ctx.lineTo(playCenterX - triSize * 0.5 + triOffsetX, playCenterY + triSize * 0.7);
    ctx.lineTo(playCenterX + triSize * 0.7 + triOffsetX, playCenterY);
    ctx.closePath();
    ctx.fill();

    // --- Waveform ---
    const waveformStartX = playCenterX + playRadius + gapAfterPlay;
    const totalBarSpace = waveformWidth / barCount;
    const actualBarWidth = totalBarSpace - barGap;

    ctx.fillStyle = COLORS.accent;

    for (let i = 0; i < barCount; i++) {
        // Bar heights taper toward the edges for a "clip" feel
        const positionFactor = Math.sin((i / (barCount - 1)) * Math.PI);
        // Random component (0.4 to 1.0)
        const randomFactor = 0.4 + rand() * 0.6;
        // Final height
        const barHeight = waveformHeight * positionFactor * randomFactor;

        const x = waveformStartX + i * totalBarSpace;
        const y = playCenterY - barHeight / 2;

        // Rounded bar via rect (simple)
        ctx.fillRect(x, y, actualBarWidth, barHeight);
    }
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

    // --- Middle block: text OR voice note ---
    const middleTop = PADDING + 140;
    const middleBottom = HEIGHT - PADDING - 120;
    const middleHeight = middleBottom - middleTop;
    const middleCenterY = middleTop + middleHeight / 2;
    const middleMaxWidth = WIDTH - PADDING * 2;

    if (testimony.text) {
        // ---- Text rendering ----
        const { lines, size, lineHeight } = fitText(
            ctx,
            testimony.text,
            middleMaxWidth,
            middleHeight,
            72
        );

        const totalTextHeight = lines.length * lineHeight;
        let y = middleTop + (middleHeight - totalTextHeight) / 2;

        ctx.fillStyle = COLORS.text;
        ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (const line of lines) {
            ctx.fillText(line, PADDING, y);
            y += lineHeight;
        }
    } else if (testimony.audioUrl) {
        // ---- Voice note rendering ----
        drawVoiceNote(ctx, testimony, middleCenterY);
    }

    // --- Date at bottom ---
    const date = new Date(testimony.createdAt).toLocaleString(undefined, {
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