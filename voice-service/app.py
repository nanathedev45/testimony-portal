from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.background import BackgroundTasks
from pydantic import BaseModel
import traceback
import os
import tempfile
import shutil

from audio import download_audio, upload_audio, cleanup
from anonymize import anonymize_voice
from render import render_video_from_frames
from frames import generate_frames

app = FastAPI(title="Voice Service", version="0.1.0")

# Maximum accepted input duration, in seconds.
# Enforced after anonymization, before upload, so the client cannot bypass it.
MAX_VOICE_SECONDS = 300


class AnonymizeRequest(BaseModel):
    audio_url: str
    pitch_semitones: float = -4.0
    formant_ratio: float = 1.15


class AnonymizeResponse(BaseModel):
    audio_url: str
    public_id: str
    duration_seconds: float
    waveform: list[float]


class RenderVideoRequest(BaseModel):
    audio_url: str
    waveform: list[float]
    duration_seconds: float
    created_at: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "voice-service",
        "version": "0.1.0",
    }


@app.post("/anonymize", response_model=AnonymizeResponse)
def anonymize(req: AnonymizeRequest):
    """
    Download, anonymize, and upload a voice testimony.
    Returns the anonymized URL, duration, and waveform — no second fetch is needed downstream.
    """
    input_path = None
    output_path = None
    try:
        input_path = download_audio(req.audio_url)

        output_path, duration, waveform = anonymize_voice(
            input_path,
            pitch_semitones=req.pitch_semitones,
            formant_ratio=req.formant_ratio,
        )

        # Duration check runs before upload so over-length recordings
        # never touch Cloudinary storage.
        if duration > MAX_VOICE_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Audio exceeds {MAX_VOICE_SECONDS} second limit",
            )

        result = upload_audio(output_path)

        return AnonymizeResponse(
            audio_url=result["secure_url"],
            public_id=result["public_id"],
            duration_seconds=duration,
            waveform=waveform,
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Anonymization failed")
    finally:
        cleanup(input_path, output_path)


@app.post("/render-video")
def render_video_endpoint(
        background_tasks: BackgroundTasks,
        req: RenderVideoRequest,
):
    """
    Generate an animated MP4 from the supplied waveform, duration, and audio.
    Frames are rendered to a temp directory and encoded with ffmpeg.
    """
    frames_dir = None
    audio_path = None
    output_path = None

    try:
        audio_path = download_audio(req.audio_url)
        frames_dir = tempfile.mkdtemp(prefix="frames_")

        frame_count, frame_duration = generate_frames(
            waveform=req.waveform,
            duration_seconds=req.duration_seconds,
            created_at=req.created_at,
            output_dir=frames_dir,
        )

        print(f"[render-video] generated {frame_count} frames at {1.0/frame_duration:.1f} fps")

        output_path = render_video_from_frames(
            frames_dir=frames_dir,
            frame_count=frame_count,
            frame_duration=frame_duration,
            audio_path=audio_path,
        )

        background_tasks.add_task(_cleanup_all, frames_dir, audio_path, output_path)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="testimony.mp4",
        )
    except Exception as e:
        _cleanup_all(frames_dir, audio_path, output_path)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Video render failed")


def _cleanup_all(frames_dir, audio_path, output_path):
    """Remove the frames directory, audio temp file, and output MP4."""
    if frames_dir and os.path.isdir(frames_dir):
        try:
            shutil.rmtree(frames_dir)
        except OSError:
            pass
    cleanup(audio_path, output_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)