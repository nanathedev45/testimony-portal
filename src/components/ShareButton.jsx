import { useState, useEffect, useCallback } from 'react';
import { renderTestimonyImage } from '../lib/renderTestimonyImage';

const API_URL = `${window.location.protocol}//${window.location.hostname}:3000`;
const SHARE_URL = 'https://your-domain.com';
const SHARE_CAPTION = `You can share your testimonies at ${SHARE_URL}`;
const SHARE_TITLE = 'My Testimony';

export default function ShareButton({ testimony, adminKey }) {
    const [busy, setBusy] = useState(null);   // 'share' | 'download' | null
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [blob, setBlob] = useState(null);
    const [renderError, setRenderError] = useState('');

    // ⚠️ TEMPORARY preview — remove later
    const [previewUrl, setPreviewUrl] = useState(null);

    const isVoice = !!testimony.audioUrl;

    // Pre-render the PNG card on mount
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const b = await renderTestimonyImage(testimony);
                if (!cancelled) setBlob(b);
            } catch (err) {
                if (!cancelled) {
                    setRenderError(err.message || 'Failed to render card');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [testimony]);

    const triggerDownload = useCallback((dataBlob, id, ext) => {
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `testimony-${id}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, []);

    async function copyCaption() {
        try {
            await navigator.clipboard.writeText(SHARE_CAPTION);
            return true;
        } catch {
            return false;
        }
    }

    // Sends the PNG + audio URL to Express, gets back an MP4 blob
    async function renderVideoMp4() {
        const formData = new FormData();
        formData.append('image', blob, 'card.png');
        formData.append('audio_url', testimony.audioUrl);

        const res = await fetch(`${API_URL}/testimonies/render-video`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminKey}`,
            },
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Video render failed');
        }

        return res.blob();
    }

    async function downloadMedia() {
        setBusy('download');
        setError('');
        setNotice('');

        try {
            if (isVoice) {
                const mp4Blob = await renderVideoMp4();
                triggerDownload(mp4Blob, testimony._id, 'mp4');
            } else {
                const imageBlob = blob || (await renderTestimonyImage(testimony));
                triggerDownload(imageBlob, testimony._id, 'png');
            }
        } catch (err) {
            setError(err.message || 'Download failed');
        } finally {
            setBusy(null);
        }
    }

    async function shareMedia() {
        setBusy('share');
        setError('');
        setNotice('');

        try {
            let shareFile;

            if (isVoice) {
                const mp4Blob = await renderVideoMp4();
                shareFile = new File(
                    [mp4Blob],
                    `testimony-${testimony._id}.mp4`,
                    { type: 'video/mp4' }
                );
            } else {
                const imageBlob = blob || (await renderTestimonyImage(testimony));
                shareFile = new File(
                    [imageBlob],
                    `testimony-${testimony._id}.png`,
                    { type: 'image/png' }
                );
            }

            if (
                typeof navigator !== 'undefined' &&
                typeof navigator.share === 'function' &&
                typeof navigator.canShare === 'function' &&
                navigator.canShare({ files: [shareFile] })
            ) {
                try {
                    await navigator.share({
                        files: [shareFile],
                        title: SHARE_TITLE,
                        text: SHARE_CAPTION,
                    });
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                }
            }

            const ext = isVoice ? 'mp4' : 'png';
            triggerDownload(shareFile, testimony._id, ext);
            const copied = await copyCaption();

            setNotice(
                copied
                    ? `${ext.toUpperCase()} downloaded and caption copied. Paste the caption when you share.`
                    : `${ext.toUpperCase()} downloaded. Copy the caption below when you share.`
            );
        } catch (err) {
            setError(err.message || 'Share failed');
        } finally {
            setBusy(null);
        }
    }

    // ⚠️ TEMPORARY preview
    async function previewImage() {
        try {
            const b = blob || (await renderTestimonyImage(testimony));
            setPreviewUrl(URL.createObjectURL(b));
        } catch (err) {
            setError(err.message || 'Preview failed');
        }
    }

    const notReady = busy !== null || !blob;

    return (
        <div className="share-actions">
            <button
                onClick={shareMedia}
                disabled={notReady || !!renderError}
                title={isVoice ? 'Share as video' : 'Share as image'}
            >
                {busy === 'share' ? 'Sharing…' : !blob ? 'Preparing…' : 'Share'}
            </button>

            <button
                onClick={downloadMedia}
                disabled={notReady || !!renderError}
                title={isVoice ? 'Download as video' : 'Download as image'}
            >
                {busy === 'download'
                    ? isVoice ? 'Rendering…' : 'Saving…'
                    : 'Download'}
            </button>

            {/* ⚠️ TEMPORARY preview button — remove later */}
            <button
                type="button"
                onClick={previewImage}
                disabled={!blob}
                title="Preview card"
            >
                Preview
            </button>

            {error && <span className="error-inline">{error}</span>}
            {!error && notice && <span className="notice-inline">{notice}</span>}
            {renderError && !error && (
                <span className="error-inline">{renderError}</span>
            )}

            {previewUrl && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: 24,
                    }}
                    onClick={() => {
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                    }}
                >
                    <img
                        src={previewUrl}
                        alt="testimony preview"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            borderRadius: 8,
                            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}