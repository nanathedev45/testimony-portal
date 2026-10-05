import numpy as np
import soundfile as sf


def extract_waveform(audio_path: str, num_bars: int = 48) -> list[float]:
    """
    Returns a list of `num_bars` floats between 0 and 1,
    representing the RMS amplitude at each evenly-spaced chunk of the audio.

    Uses soundfile + numpy only (no librosa, no LLVM dependency).
    """
    data, sr = sf.read(audio_path, always_2d=False)

    # If stereo, average to mono
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