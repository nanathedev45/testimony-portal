import subprocess
import os
import tempfile


def render_video(image_path: str, audio_path: str) -> str:
    """
    Combine a static PNG with an audio track into an MP4.
    Returns the path to the generated MP4 file.

    The image is held for the full duration of the audio.
    """
    fd, output_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)

    cmd = [
        "ffmpeg",
        "-y",                          # overwrite output
        "-loop", "1",                  # loop the image
        "-i", image_path,              # input 0: the PNG
        "-i", audio_path,              # input 1: the audio
        "-c:v", "libx264",             # video codec
        "-tune", "stillimage",         # optimize for static image
        "-c:a", "aac",                 # audio codec
        "-b:a", "128k",                # audio bitrate
        "-pix_fmt", "yuv420p",         # pixel format (required for compatibility)
        "-shortest",                   # end when shorter input ends (the audio)
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-800:]}")

    return output_path