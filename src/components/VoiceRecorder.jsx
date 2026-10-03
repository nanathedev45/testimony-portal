import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VoiceRecorder({ onSubmit, onCancel, submitting }) {
    const { state, audioUrl, blob, error, elapsed, start, stop, reset } =
        useVoiceRecorder();

    function handleSubmit() {
        if (blob && onSubmit) onSubmit(blob);
    }

    function handleCancel() {
        reset();
        if (onCancel) onCancel();
    }

    // While the parent is uploading / submitting, lock the UI
    if (submitting) {
        return (
            <div className="voice-recorder">
                <div className="voice-recording">
                    <div className="voice-status">
                        <span>Submitting your voice testimony…</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="voice-recorder">
            {state === 'idle' && (
                <div className="voice-idle">
                    <p className="muted">Record your voice testimony.</p>
                    <button type="button" className="voice-primary" onClick={start}>
                        ● Start recording
                    </button>
                </div>
            )}

            {state === 'recording' && (
                <div className="voice-recording">
                    <div className="voice-status">
                        <span className="voice-dot" />
                        <span>Recording… {formatTime(elapsed)}</span>
                    </div>
                    <button type="button" className="voice-stop" onClick={stop}>
                        ■ Stop
                    </button>
                </div>
            )}

            {state === 'recorded' && audioUrl && (
                <div className="voice-preview">
                    <p className="muted">Preview your recording ({formatTime(elapsed)})</p>
                    <audio
                        controls
                        src={audioUrl}
                        className="voice-audio"
                    />
                    <div className="voice-actions">
                        <button type="button" onClick={reset}>
                            🔁 Retry
                        </button>
                        <button
                            type="button"
                            className="voice-primary"
                            onClick={handleSubmit}
                        >
                            ✓ Submit
                        </button>
                    </div>
                </div>
            )}

            {state === 'error' && (
                <div className="voice-error">
                    <p className="error">{error || 'Recording error'}</p>
                    <button type="button" onClick={reset}>
                        Try again
                    </button>
                </div>
            )}

            {!submitting && (
                <button type="button" className="voice-cancel" onClick={handleCancel}>
                    Cancel
                </button>
            )}
        </div>
    );
}