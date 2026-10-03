import { useState } from 'react';
import VoiceRecorder from './VoiceRecorder.jsx';
import micIcon from '../assets/micIcon.png';

const API_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

async function uploadToCloudinary(blob) {
    const sigRes = await fetch(`${API_URL}/cloudinary/signature`, {
        method: 'POST',
    });
    if (!sigRes.ok) {
        throw new Error('Could not get upload signature');
    }

    const { signature, timestamp, apiKey, cloudName, folder, resourceType } =
        await sigRes.json();

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);

    const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        { method: 'POST', body: formData }
    );

    if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Upload failed');
    }

    return uploadRes.json();
}

function SubmitView() {
    const [text, setText] = useState('');
    const [status, setStatus] = useState(null);   // 'sending' | 'ok' | 'error'
    const [error, setError] = useState('');
    const [mode, setMode] = useState('text');     // 'text' | 'voice'

    // ---- Text submission (outer form) ----
    async function handleTextSubmit(e) {
        e.preventDefault();
        setStatus('sending');
        setError('');

        try {
            const res = await fetch(`${API_URL}/testimonies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            setStatus('ok');
            setText('');
        } catch (err) {
            setStatus('error');
            setError(err.message);
        }
    }

    // ---- Voice submission (called from VoiceRecorder) ----
    async function handleVoiceSubmit(blob) {
        setStatus('sending');
        setError('');

        try {
            const uploadResult = await uploadToCloudinary(blob);

            const res = await fetch(`${API_URL}/testimonies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioUrl: uploadResult.secure_url,
                    audioPublicId: uploadResult.public_id,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            setStatus('ok');
            setMode('text');
        } catch (err) {
            setStatus('error');
            setError(err.message);
        }
    }

    const isTextSubmitDisabled = status === 'sending' || !text.trim();

    return (
        <section className="card">
            <h2>Wind Of Faith 2026 Anonymous Testimony Portal</h2>
            <p className="muted">Share your testimony. Your message is anonymous.</p>

            {mode === 'text' ? (
                <form onSubmit={handleTextSubmit}>
                    <div className="textarea-wrap">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Write your testimony here..."
                            rows={6}
                        />
                        <button
                            type="button"
                            className="mic-button"
                            onClick={() => {
                                setStatus(null);
                                setError('');
                                setMode('voice');
                            }}
                            title="Record a voice testimony"
                            aria-label="Record a voice testimony"
                        >
                            <img src={micIcon} alt="" />
                        </button>
                    </div>

                    <button type="submit" disabled={isTextSubmitDisabled}>
                        {status === 'sending' ? 'Sending...' : 'Submit'}
                    </button>
                </form>
            ) : (
                <VoiceRecorder
                    onSubmit={handleVoiceSubmit}
                    onCancel={() => {
                        setStatus(null);
                        setError('');
                        setMode('text');
                    }}
                    submitting={status === 'sending'}
                />
            )}

            {status === 'ok' && (
                <p className="success">
                    Thank you — your testimony has been submitted.
                </p>
            )}
            {status === 'error' && <p className="error">{error}</p>}
        </section>
    );
}

export default SubmitView;