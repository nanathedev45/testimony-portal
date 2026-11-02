import subprocess
import os
import tempfile
import json

import numpy as np
import soundfile as sf


def get_duration(audio_path: str) -> float:
    """Return duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            audio_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def _extract_waveform(audio_path: str, num_bars: int = 48) -> list[float]:
    """
    Compute normalized RMS amplitude per bar.
    Returned values are in [0, 1], with the peak chunk scaled to 1.0.
    """
    data, _ = sf.read(audio_path, always_2d=False)

    if data.ndim > 1:
        data = data.mean(axis=1)

    data = data.astype(np.float32)
    total_samples = len(data)
    if total_samples == 0:
        return [0.0] * num_bars

    chunk_size = total_samples // num_bars
    values: list[float] = []

    for i in range(num_bars):
        start = i * chunk_size
        end = start + chunk_size if i < num_bars - 1 else total_samples
        chunk = data[start:end]
        if len(chunk) > 0:
            rms = float(np.sqrt(np.mean(chunk ** 2)))
        else:
            rms = 0.0
        values.append(rms)

    peak = max(values) if values else 1.0
    if peak > 0:
        values = [v / peak for v in values]

    return values


def anonymize_voice(
        input_path: str,
        pitch_semitones: float = -4.0,
        formant_ratio: float = 1.15,
) -> tuple[str, float, list[float]]:
    """
    Apply pitch shift to make a voice less identifiable.

    Returns (output_path, duration_seconds, waveform).
    waveform is a list of `num_bars` floats in [0, 1] representing RMS amplitude,
    computed from the anonymized output so callers do not need a second fetch.

    pitch_semitones: semitone offset. +4 raises, -4 lowers, all still human.
    formant_ratio: reserved for future use; current filter keeps formants preserved.
    """
    fd, output_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)

    # Pitch multiplier from semitones: 2^(semitones/12)
    pitch_multiplier = 2 ** (pitch_semitones / 12.0)

    # rubberband handles pitch and formant in one pass; aresample restores
    # a normal timebase on the output.
    filter_chain = (
        f"rubberband=pitch={pitch_multiplier}:formant=preserved:pitchq=quality,"
        f"aresample=48000"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-af", filter_chain,
        "-ac", "1",
        "-b:a", "128k",
        "-f", "mp3",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")

    duration = get_duration(output_path)
    waveform = _extract_waveform(output_path)

    return output_path, duration, waveform