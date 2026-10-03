from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.background import BackgroundTasks
from pydantic import BaseModel
import traceback
import os
import tempfile

from audio import download_audio, upload_audio, cleanup
from anonymize import anonymize_voice
from render import render_video

app = FastAPI(title="Voice Service", version="0.1.0")


class AnonymizeRequest(BaseModel):
    audio_url: str
    pitch_semitones: float = -4.0      # negative = deeper
    formant_ratio: float = 1.15        # >1 = "smaller" vocal tract


class AnonymizeResponse(BaseModel):
    audio_url: str
    public_id: str
    duration_seconds: float


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


@app.post("/render-video")
async def render_video_endpoint(
        background_tasks: BackgroundTasks,
        image: UploadFile = File(...),
        audio_url: str = Form(...),
):
    """
    Takes a PNG (branded card) + an audio URL.
    Returns an MP4 with the image held for the audio duration.
    """
    image_path = None
    audio_path = None
    output_path = None

    try:
        # 1. Save the uploaded PNG
        fd, image_path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        with open(image_path, "wb") as f:
            f.write(await image.read())

        # 2. Download the audio from Cloudinary
        audio_path = download_audio(audio_url)

        # 3. Combine into MP4
        output_path = render_video(image_path, audio_path)

        # 4. Schedule cleanup AFTER the response is sent
        # (FileResponse needs the file to exist while streaming)
        background_tasks.add_task(cleanup, image_path, audio_path, output_path)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="testimony.mp4",
        )
    except Exception as e:
        # If anything failed, clean up immediately
        cleanup(image_path, audio_path, output_path)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)