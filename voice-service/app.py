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
from waveform import extract_waveform
from frames import generate_frames

app = FastAPI(title="Voice Service", version="0.1.0")


class AnonymizeRequest(BaseModel):
    audio_url: str
    pitch_semitones: float = -4.0      # negative = deeper
    formant_ratio: float = 1.15        # >1 = "smaller" vocal tract


class AnonymizeResponse(BaseModel):
    audio_url: str
    public_id: str
    duration_seconds: float


class WaveformResponse(BaseModel):
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
    input_path = None
    output_path = None
    try:
        input_path = download_audio(req.audio_url)

        output_path, duration = anonymize_voice(
            input_path,
            pitch_semitones=req.pitch_semitones,
            formant_ratio=req.formant_ratio,
        )

        result = upload_audio(output_path)

        return AnonymizeResponse(
            audio_url=result["secure_url"],
            public_id=result["public_id"],
            duration_seconds=duration,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup(input_path, output_path)


@app.post("/extract-waveform", response_model=WaveformResponse)
def extract_waveform_endpoint(req: AnonymizeRequest):
    audio_path = None
    try:
        audio_path = download_audio(req.audio_url)
        data = extract_waveform(audio_path)
        return WaveformResponse(waveform=data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup(audio_path)


@app.post("/render-video")
def render_video_endpoint(
        background_tasks: BackgroundTasks,
        req: RenderVideoRequest,
):
    """
    Receives waveform + duration + date + audio URL.
    Generates animated frames, encodes them into an MP4 with the audio,
    and returns the MP4.
    """
    frames_dir = None
    audio_path = None
    output_path = None

    try:
        # 1. Download the audio from Cloudinary
        audio_path = download_audio(req.audio_url)

        # 2. Create a temp directory for the frames
        frames_dir = tempfile.mkdtemp(prefix="frames_")

        # 3. Generate the PNG frame sequence
        frame_count, frame_duration = generate_frames(
            waveform=req.waveform,
            duration_seconds=req.duration_seconds,
            created_at=req.created_at,
            output_dir=frames_dir,
        )

        print(f"[render-video] generated {frame_count} frames at {1.0/frame_duration:.1f} fps")

        # 4. Encode the frames + audio into an MP4
        output_path = render_video_from_frames(
            frames_dir=frames_dir,
            frame_count=frame_count,
            frame_duration=frame_duration,
            audio_path=audio_path,
        )

        # 5. Schedule cleanup AFTER the response is sent
        background_tasks.add_task(_cleanup_all, frames_dir, audio_path, output_path)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="testimony.mp4",
        )
    except Exception as e:
        _cleanup_all(frames_dir, audio_path, output_path)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _cleanup_all(frames_dir, audio_path, output_path):
    """Delete the frames directory, the audio temp file, and the output MP4."""
    # Remove the frames directory tree
    if frames_dir and os.path.isdir(frames_dir):
        try:
            shutil.rmtree(frames_dir)
        except OSError:
            pass

    # Remove single files
    cleanup(audio_path, output_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)