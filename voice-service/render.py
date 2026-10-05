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
        "-y",
        "-loop", "1",
        "-i", image_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-800:]}")

    return output_path


def render_video_from_frames(
        frames_dir: str,
        frame_count: int,
        frame_duration: float,
        audio_path: str,
) -> str:
    """
    Combines a sequence of PNG frames into an MP4 with the given audio track.

    frames_dir: directory containing frame_0001.png, frame_0002.png, ...
    frame_count: number of frames (for sanity — ffmpeg reads until end of sequence)
    frame_duration: seconds per frame (e.g. 1/5 = 0.2s)
    audio_path: path to the audio file
    """
    fd, output_path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)

    input_pattern = os.path.join(frames_dir, "frame_%04d.png")
    fps = 1.0 / frame_duration

    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(fps),          # input framerate (before -i)
        "-i", input_pattern,
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",                    # quality (lower = better; 18-23 is normal)
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",           # required for iPhone/Safari/WhatsApp
        "-movflags", "+faststart",       # allows progressive streaming
        "-shortest",                     # stop when the shorter input ends
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-1500:]}")

    return output_path