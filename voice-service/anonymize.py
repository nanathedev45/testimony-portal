import subprocess
import os
import tempfile
import json


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


def anonymize_voice(
        input_path: str,
        pitch_semitones: float = -4.0,
        formant_ratio: float = 1.15,
) -> tuple[str, float]:
    """
    Apply pitch + formant shift to make a voice less identifiable.
    Returns (output_path, duration_seconds).

    - pitch_semitones: how many semitones to shift. +4 = noticeably higher, still human.
    - formant_ratio: adjusts the "vocal tract size" independently of pitch.
      Values >1 = smaller (more feminine), <1 = larger (more masculine).
    """
    fd, output_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)

    # rubberband filter: pitch shift + formant preservation
    # 'pitch' is the pitch multiplier = 2^(semitones/12)
    pitch_multiplier = 2 ** (pitch_semitones / 12.0)

    # Build the ffmpeg filter chain:
    # - rubberband handles pitch + formant in one pass
    # - aresample resets the timebase so output plays at normal speed
    filter_chain = (
        f"rubberband=pitch={pitch_multiplier}:formant=preserved:pitchq=quality,"
        f"aresample=48000"
    )

    cmd = [
        "ffmpeg",
        "-y",                       # overwrite output
        "-i", input_path,
        "-af", filter_chain,
        "-ac", "1",                 # mono
        "-b:a", "128k",             # bitrate
        "-f", "mp3",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Clean up the empty output file before raising
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")

    duration = get_duration(output_path)
    return output_path, duration