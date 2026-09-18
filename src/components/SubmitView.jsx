import { useState } from 'react';

const API_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

function SubmitView() {
    const [text, setText] = useState('');
    const [status, setStatus] = useState(null); // 'sending' | 'ok' | 'error'
    const [error, setError] = useState('');

    async function handleSubmit(e) {
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

    return (
        <section className="card">
            <h2>Testimony Portal</h2>
            <p className="muted">Share your testimony. Your message is anonymous.</p>

            <form onSubmit={handleSubmit}>
        <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your testimony here..."
            rows={6}
            required
        />
                <button type="submit" disabled={status === 'sending' || !text.trim()}>
                    {status === 'sending' ? 'Sending...' : 'Submit'}
                </button>
            </form>

            {status === 'ok' && <p className="success">Thank you — your testimony was submitted.</p>}
            {status === 'error' && <p className="error">{error}</p>}
        </section>
    );
}

export default SubmitView;