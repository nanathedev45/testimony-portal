import { useState, useEffect, useCallback } from 'react';
import { renderTestimonyImage } from '../lib/renderTestimonyImage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SHARE_URL = 'https://woftestimonyportal.netlify.app';
const SHARE_CAPTION = `Share your testimonies today at ${SHARE_URL} and bless someone.`;
const SHARE_TITLE = 'My Testimony';

function loadAudioDuration(url) {
    return new Promise((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.crossOrigin = 'anonymous';

        const cleanup = () => {
            audio.src = '';
        };

        audio.addEventListener('loadedmetadata', () => {
            const d = Number.isFinite(audio.duration) ? audio.duration : 0;
            cleanup();
            resolve(d);
        });

        audio.addEventListener('error', () => {
            cleanup();
            resolve(0);
        });

        setTimeout(() => {
            cleanup();
            resolve(0);
        }, 5000);

        audio.src = url;
    });
}

export default function ShareButton({ testimony, adminKey }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [blob, setBlob] = useState(null);           // PNG for text testimonies
    const [duration, setDuration] = useState(0);      // audio duration (voice only)
    const [renderError, setRenderError] = useState('');

    const isVoice = !!testimony.audioUrl;

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                if (isVoice) {
                    const d = await loadAudioDuration(testimony.audioUrl);
                    if (!cancelled) setDuration(d);
                } else {
                    const b = await renderTestimonyImage(testimony);
                    if (!cancelled) setBlob(b);
                }
            } catch (err) {
                if (!cancelled) {
                    setRenderError(err.message || 'Failed to prepare');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [testimony, isVoice]);

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

    // Request a rendered MP4 from the backend.
    // If waveform data is missing (testimonies created before extraction was added),
    // send an empty array — the Python renderer synthesizes a placeholder shape.
    async function renderVideoMp4() {
        if (!duration || duration <= 0) {
            throw new Error('Audio duration not loaded yet. Try again.');
        }

        const waveform = Array.isArray(testimony.waveformData) && testimony.waveformData.length > 0
            ? testimony.waveformData
            : [];

        const res = await fetch(`${API_URL}/testimonies/render-video`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminKey}`,
            },
            body: JSON.stringify({
                audio_url: testimony.audioUrl,
                waveform,
                duration_seconds: duration,
                created_at: testimony.createdAt,
            }),
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

    const notReady =
        busy !== null ||
        (!isVoice && !blob) ||
        (isVoice && !duration);

    return (
        <div className="share-actions">
            <button
                onClick={shareMedia}
                disabled={notReady || !!renderError}
                title={isVoice ? 'Share as video' : 'Share as image'}
            >
                {busy === 'share'
                    ? 'Sharing…'
                    : notReady
                        ? 'Preparing…'
                        : 'Share'}
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

            {error && <span className="error-inline">{error}</span>}
            {!error && notice && <span className="notice-inline">{notice}</span>}
            {renderError && !error && (
                <span className="error-inline">{renderError}</span>
            )}
        </div>
    );
}