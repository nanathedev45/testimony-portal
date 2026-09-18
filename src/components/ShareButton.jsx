import { useState } from 'react';
import { renderTestimonyImage } from '../lib/renderTestimonyImage';

// Swap this when you deploy
const SHARE_URL = 'https://your-domain.com';
const SHARE_CAPTION = `You can share your testimonies at ${SHARE_URL}`;

export default function ShareButton({ testimony }) {
    const [busy, setBusy] = useState(null); // 'share' | 'download' | null
    const [error, setError] = useState('');

    async function downloadImage() {
        setBusy('download');
        setError('');
        try {
            const blob = await renderTestimonyImage(testimony);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `testimony-${testimony._id}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err.message || 'Download failed');
        } finally {
            setBusy(null);
        }
    }

    async function shareImage() {
        setBusy('share');
        setError('');

        try {
            const blob = await renderTestimonyImage(testimony);
            const file = new File([blob], `testimony-${testimony._id}.png`, {
                type: 'image/png',
            });

            // Try native share (mobile)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    text: SHARE_CAPTION,
                });
                return;
            }

            // Fallback: download + copy caption to clipboard
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `testimony-${testimony._id}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            try {
                await navigator.clipboard.writeText(SHARE_CAPTION);
            } catch {
                // Clipboard may fail silently (permissions) — that's OK
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setError(err.message || 'Share failed');
            }
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="share-actions">
            <button
                onClick={shareImage}
                disabled={busy !== null}
                title="Share as image"
            >
                {busy === 'share' ? 'Sharing…' : 'Share'}
            </button>
            <button
                onClick={downloadImage}
                disabled={busy !== null}
                title="Download as image"
            >
                {busy === 'download' ? 'Saving…' : 'Download'}
            </button>
            {error && <span className="error-inline">{error}</span>}
        </div>
    );
}