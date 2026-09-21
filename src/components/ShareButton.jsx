import { useState, useEffect, useCallback } from 'react';
import { renderTestimonyImage } from '../lib/renderTestimonyImage';

// Swap this when you deploy
const SHARE_URL = 'https://your-domain.com';
const SHARE_CAPTION = `You can share your testimonies at ${SHARE_URL}`;
const SHARE_TITLE = 'My Testimony';

export default function ShareButton({ testimony }) {
    const [busy, setBusy] = useState(null); // 'share' | 'download' | null
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [file, setFile] = useState(null);
    const [blob, setBlob] = useState(null);
    const [renderError, setRenderError] = useState('');

    // Pre-render the image on mount so the user gesture stays intact
    // when they actually tap Share.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const b = await renderTestimonyImage(testimony);
                if (cancelled) return;
                setBlob(b);
                setFile(
                    new File([b], `testimony-${testimony._id}.png`, {
                        type: 'image/png',
                    })
                );
            } catch (err) {
                if (!cancelled) {
                    setRenderError(err.message || 'Failed to render image');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [testimony]);

    const triggerDownload = useCallback(
        (imageBlob, id) => {
            const url = URL.createObjectURL(imageBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `testimony-${id}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },
        []
    );

    async function copyCaption() {
        try {
            await navigator.clipboard.writeText(SHARE_CAPTION);
            return true;
        } catch {
            return false;
        }
    }

    async function downloadImage() {
        setBusy('download');
        setError('');
        setNotice('');

        try {
            // Reuse the pre-rendered blob if we have it; otherwise render now.
            const imageBlob = blob || (await renderTestimonyImage(testimony));
            triggerDownload(imageBlob, testimony._id);
        } catch (err) {
            setError(err.message || 'Download failed');
        } finally {
            setBusy(null);
        }
    }

    async function shareImage() {
        if (renderError) {
            setError('Image is not ready yet. Try again in a moment.');
            return;
        }
        if (!file) {
            setError('Still preparing the image…');
            return;
        }

        setBusy('share');
        setError('');
        setNotice('');

        const shareData = {
            files: [file],
            title: SHARE_TITLE,
            text: SHARE_CAPTION,
        };

        // ---- Path 1: Native share sheet with file (mobile iOS/Android,
        //              some desktop browsers). Gesture is preserved because
        //              we're not awaiting anything before this call. ----
        if (
            typeof navigator !== 'undefined' &&
            typeof navigator.share === 'function' &&
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] })
        ) {
            try {
                await navigator.share(shareData);
                setBusy(null);
                return;
            } catch (err) {
                // User cancelled — that's fine, do nothing.
                if (err.name === 'AbortError') {
                    setBusy(null);
                    return;
                }
                // Otherwise fall through to the fallback below.
            }
        }

        // ---- Path 2: Fallback for desktop / unsupported browsers ----
        // Download the image + copy the caption so the user can paste it
        // into whatever app they want.
        try {
            triggerDownload(blob, testimony._id);
            const copied = await copyCaption();

            setNotice(
                copied
                    ? 'Image downloaded and caption copied. Paste the caption when you share.'
                    : 'Image downloaded. Copy the caption below when you share.'
            );
        } catch (err) {
            setError(err.message || 'Share failed');
        } finally {
            setBusy(null);
        }
    }

    const notReady = busy !== null || (!file && !renderError);

    return (
        <div className="share-actions">
            <button
                onClick={shareImage}
                disabled={notReady || !!renderError}
                title="Share as image"
            >
                {busy === 'share'
                    ? 'Sharing…'
                    : !file && !renderError
                        ? 'Preparing…'
                        : 'Share'}
            </button>

            <button
                onClick={downloadImage}
                disabled={busy !== null || !!renderError}
                title="Download as image"
            >
                {busy === 'download' ? 'Saving…' : 'Download'}
            </button>

            {error && <span className="error-inline">{error}</span>}
            {!error && notice && <span className="notice-inline">{notice}</span>}
            {renderError && !error && (
                <span className="error-inline">{renderError}</span>
            )}
        </div>
    );
}