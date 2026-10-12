import ShareButton from './ShareButton';
import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SESSION_MINUTES = 30;
const SESSION_MS = SESSION_MINUTES * 60 * 1000;
const STORAGE_KEY = 'adminSession';

function readSession() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed.key || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
            sessionStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

function AdminView() {
    // Lazy-init from sessionStorage so we don't need a setState effect
    const [key, setKey] = useState(() => readSession()?.key ?? '');
    const [expiresAt, setExpiresAt] = useState(() => readSession()?.expiresAt ?? null);
    const [testimonies, setTestimonies] = useState([]);
    const [trashed, setTrashed] = useState([]);
    const [tab, setTab] = useState('live');
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');
    const [now, setNow] = useState(() => Date.now());

    const logoutTimerRef = useRef(null);

    function logout(message = '') {
        sessionStorage.removeItem(STORAGE_KEY);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        setKey('');
        setTestimonies([]);
        setTrashed([]);
        setTab('live');
        setStatus(null);
        setExpiresAt(null);
        setError(message);
    }

    function scheduleLogout(expiresAtMs) {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        const msLeft = expiresAtMs - Date.now();
        if (msLeft <= 0) {
            logout('Session expired. Please enter the key again.');
            return;
        }
        logoutTimerRef.current = setTimeout(() => {
            logout('Session expired. Please enter the key again.');
        }, msLeft);
    }

    async function authFetch(path, options = {}, keyToUse = key) {
        return fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: `Bearer ${keyToUse}`,
            },
        });
    }

    async function loadAll(keyToUse = key) {
        setStatus('loading');
        setError('');

        try {
            const [liveRes, trashRes] = await Promise.all([
                authFetch('/testimonies', {}, keyToUse),
                authFetch('/testimonies/trash', {}, keyToUse),
            ]);

            if (!liveRes.ok) {
                const data = await liveRes.json().catch(() => ({}));
                throw new Error(data.error || 'Unauthorized');
            }
            if (!trashRes.ok) {
                const data = await trashRes.json().catch(() => ({}));
                throw new Error(data.error || 'Unauthorized');
            }

            const live = await liveRes.json();
            const trash = await trashRes.json();

            const expiresAtMs = Date.now() + SESSION_MS;
            sessionStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ key: keyToUse, expiresAt: expiresAtMs })
            );
            setExpiresAt(expiresAtMs);
            scheduleLogout(expiresAtMs);

            setTestimonies(live);
            setTrashed(trash);
            setStatus('ok');
        } catch (err) {
            setStatus('error');
            setError(err.message);
        }
    }

    async function softDelete(id) {
        const res = await authFetch(`/testimonies/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Delete failed');
            return;
        }
        const deleted = await res.json();
        setTestimonies((prev) => prev.filter((t) => t._id !== id));
        setTrashed((prev) => [deleted, ...prev]);
    }

    async function restore(id) {
        const res = await authFetch(`/testimonies/${id}/restore`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Restore failed');
            return;
        }
        const restored = await res.json();
        setTrashed((prev) => prev.filter((t) => t._id !== id));
        setTestimonies((prev) => [restored, ...prev]);
    }

    async function hardDelete(id) {
        const confirmed = window.confirm(
            'Permanently delete this testimony? This cannot be undone.'
        );
        if (!confirmed) return;

        const res = await authFetch(`/testimonies/${id}/permanent`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Permanent delete failed');
            return;
        }
        setTrashed((prev) => prev.filter((t) => t._id !== id));
    }

    // On mount: restore session and fetch if valid.
    // Everything that can call setState (scheduleLogout -> logout, and
    // loadAll) is deferred into a single microtask so React never sees a
    // setState call reachable synchronously from the effect body
    // (react-hooks/set-state-in-effect rule).
    useEffect(() => {
        if (key && expiresAt) {
            queueMicrotask(() => {
                scheduleLogout(expiresAt);
                loadAll(key);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cleanup logout timer on unmount
    useEffect(() => {
        return () => {
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        };
    }, []);

    // Tick "now" every 30s so minutesLeft stays fresh without impure render
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, []);

    const minutesLeft = expiresAt
        ? Math.max(0, Math.ceil((expiresAt - now) / 60000))
        : null;

    const activeList = tab === 'live' ? testimonies : trashed;

    return (
        <section className="card">
            <div className="admin-header">
                <h2>Admin Portal</h2>
                {status === 'ok' && (
                    <button className="logout-btn" onClick={() => logout()}>
                        Log out
                    </button>
                )}
            </div>

            {status !== 'ok' && (
                <>
                    <p className="muted">
                        Enter the admin key to view submissions. Session lasts {SESSION_MINUTES} minutes.
                    </p>

                    <div className="admin-controls">
                        <input
                            type="password"
                            placeholder="Admin key"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && key) loadAll();
                            }}
                        />
                        <button
                            onClick={() => loadAll()}
                            disabled={!key || status === 'loading'}
                        >
                            {status === 'loading' ? 'Loading...' : 'Unlock'}
                        </button>
                    </div>
                </>
            )}

            {status === 'error' && <p className="error">{error}</p>}

            {status === 'ok' && (
                <>
                    <div className="admin-tabs">
                        <button
                            className={tab === 'live' ? 'active' : ''}
                            onClick={() => setTab('live')}
                        >
                            Live ({testimonies.length})
                        </button>
                        <button
                            className={tab === 'trash' ? 'active' : ''}
                            onClick={() => setTab('trash')}
                        >
                            Trash ({trashed.length})
                        </button>
                        <span className="muted session-info">
                            Auto-locks in {minutesLeft} min
                        </span>
                    </div>

                    <ul className="testimony-list">
                        {activeList.length === 0 && (
                            <li className="muted">
                                {tab === 'live' ? 'No testimonies yet.' : 'Trash is empty.'}
                            </li>
                        )}
                        {activeList.map((t) => (
                            <li key={t._id}>
                                {t.text && <p>{t.text}</p>}
                                {t.audioUrl && (
                                    <audio
                                        controls
                                        src={t.audioUrl}
                                        className="admin-audio"
                                        preload="metadata"
                                    />
                                )}
                                <div className="testimony-meta">
                                    <div className="meta-left">
                                        <time>
                                            {tab === 'live'
                                                ? new Date(t.createdAt).toLocaleString()
                                                : `Deleted ${new Date(t.deletedAt).toLocaleString()}`}
                                        </time>
                                        {tab === 'live' && <ShareButton testimony={t} adminKey={key} />}
                                    </div>

                                    {tab === 'live' ? (
                                        <button className="danger" onClick={() => softDelete(t._id)}>
                                            Delete
                                        </button>
                                    ) : (
                                        <div className="trash-actions">
                                            <button onClick={() => restore(t._id)}>Restore</button>
                                            <button className="danger" onClick={() => hardDelete(t._id)}>
                                                Delete forever
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

export default AdminView;