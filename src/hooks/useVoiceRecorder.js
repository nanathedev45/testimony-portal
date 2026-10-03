import { useRef, useState, useEffect } from 'react';

// Manages MediaRecorder lifecycle: start, stop, reset.
// Returns a blob URL for preview and the raw blob for upload later.
export function useVoiceRecorder() {
    const [state, setState] = useState('idle'); // 'idle' | 'recording' | 'recorded' | 'error'
    const [audioUrl, setAudioUrl] = useState(null);
    const [blob, setBlob] = useState(null);
    const [error, setError] = useState('');
    const [elapsed, setElapsed] = useState(0); // seconds

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
            if (audioUrl) URL.revokeObjectURL(audioUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function start() {
        setError('');
        setBlob(null);
        setElapsed(0);
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Pick a MIME type the browser actually supports.
            // Safari → audio/mp4, Chrome → audio/webm;codecs=opus
            const candidates = [
                'audio/mp4',
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
            ];
            const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
            console.log('[useVoiceRecorder] using mimeType:', mimeType);

            const options = mimeType ? { mimeType } : {};
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const recordedMime = recorder.mimeType || mimeType || 'audio/webm';
                const recordedBlob = new Blob(chunksRef.current, { type: recordedMime });
                console.log(
                    '[useVoiceRecorder] blob type:', recordedMime,
                    'size:', recordedBlob.size
                );
                setBlob(recordedBlob);
                setAudioUrl(URL.createObjectURL(recordedBlob));
                setState('recorded');

                // stop mic
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                }
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            };

            recorder.start();
            setState('recording');

            // tick timer every second
            timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        } catch (err) {
            setError(err.message || 'Could not access microphone');
            setState('error');
        }
    }

    function stop() {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
    }

    function reset() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setBlob(null);
        setElapsed(0);
        setError('');
        setState('idle');
    }

    return { state, audioUrl, blob, error, elapsed, start, stop, reset };
}