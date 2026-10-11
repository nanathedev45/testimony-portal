// Renders a testimony as a 1080x1080 PNG blob.
// Uses the browser's canvas API — no external deps.
// Text testimonies → text block
// Voice testimonies → voice-note graphic (play button + waveform + timer)

const WIDTH = 1080;
const HEIGHT = 1080;
const PADDING = 100;

const COLORS = {
    bg: '#392282',
    accent: '#ece700',
    text: '#f5f3ff',
    textMuted: 'rgba(245, 243, 255, 0.55)',
};

// Format seconds → "0:07" or "1:23"
function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

// Format an ISO date string → "Oct 4, 2026, 1:02 PM"
// Hardcoded so browser locale never affects the output.
function formatTestimonyDate(isoString) {
    const d = new Date(isoString);

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    const minutesPadded = String(minutes).padStart(2, '0');

    return `${month} ${day}, ${year}, ${hours}:${minutesPadded} ${ampm}`;
}

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

// Deterministic pseudo-random from a string seed (fallback for old testimonies).
function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    return function next() {
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        return (hash % 1000) / 1000;
    };
}

// Draw a WhatsApp-style voice note graphic centered in the given area.
function drawVoiceNote(ctx, testimony, centerY, durationSeconds) {
    // Use real waveform if available, else fall back to seeded random.
    const wf = testimony.waveformData;
    const useRealData = Array.isArray(wf) && wf.length > 0;
    const rand = seededRandom(testimony._id || 'voice');

    // --- Layout constants ---
    const playRadius = 60;
    const gapAfterPlay = 40;
    const waveformWidth = WIDTH - PADDING * 2 - playRadius * 2 - gapAfterPlay;
    const waveformHeight = 120;
    const barCount = 48;
    const barGap = 6;

    // --- Play button ---
    const playCenterX = PADDING + playRadius;
    const playCenterY = centerY;

    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(playCenterX, playCenterY, playRadius, 0, Math.PI * 2);
    ctx.fill();

    const triSize = playRadius * 0.7;
    const triOffsetX = playRadius * 0.15;
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
    const barRadius = actualBarWidth / 2;   // fully-rounded pill ends

    // Small minimum height so silent chunks still show a sliver of a bar
    const minHeightFactor = 0.05;

    ctx.fillStyle = COLORS.accent;

    for (let i = 0; i < barCount; i++) {
        let heightFactor;

        if (useRealData) {
            const idx = Math.min(
                wf.length - 1,
                Math.floor((i / barCount) * wf.length)
            );
            heightFactor = wf[idx] || 0;
        } else {
            const positionFactor = Math.sin((i / (barCount - 1)) * Math.PI);
            const randomFactor = 0.4 + rand() * 0.6;
            heightFactor = positionFactor * randomFactor;
        }

        heightFactor = Math.max(minHeightFactor, heightFactor);

        const barHeight = waveformHeight * heightFactor;
        const x = waveformStartX + i * totalBarSpace;
        const y = playCenterY - barHeight / 2;

        // Rounded bar (pill) via ctx.roundRect where available,
        // fallback to plain rect for very old browsers.
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, actualBarWidth, barHeight, barRadius);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, actualBarWidth, barHeight);
        }
    }

    // --- Timer below the waveform ---
    if (durationSeconds && durationSeconds > 0) {
        const timerText = `0:00 / ${formatTime(durationSeconds)}`;

        ctx.fillStyle = COLORS.textMuted;
        ctx.font = '500 28px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.fillText(timerText, waveformStartX, playCenterY + playRadius + 24);
    }
}

export async function renderTestimonyImage(testimony, durationSeconds) {
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
        drawVoiceNote(ctx, testimony, middleCenterY, durationSeconds);
    }

    // --- Date at bottom ---
    const date = formatTestimonyDate(testimony.createdAt);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '400 24px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(date, PADDING, HEIGHT - PADDING);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
            'image/png'
        );
    });
}