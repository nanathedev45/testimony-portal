from dotenv import load_dotenv
load_dotenv()

import os
import tempfile
import requests
import cloudinary
import cloudinary.uploader

# ---- Cloudinary config ----
# Reads CLOUDINARY_URL from env, which is the format:
# cloudinary://API_KEY:API_SECRET@CLOUD_NAME
cloudinary.config(secure=True)


def download_audio(url: str) -> str:
    """Download a remote audio file to a temp local path. Returns the path."""
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()

    ext = ".mp4"
    lower = url.lower()
    if lower.endswith(".webm"):
        ext = ".webm"
    elif lower.endswith(".mp3"):
        ext = ".mp3"
    elif lower.endswith(".m4a"):
        ext = ".m4a"
    elif lower.endswith(".wav"):
        ext = ".wav"

    fd, path = tempfile.mkstemp(suffix=ext)
    os.close(fd)

    with open(path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    return path


def upload_audio(local_path: str, folder: str = "testimonies-anon") -> dict:
    """Upload a local audio file to Cloudinary. Returns { secure_url, public_id }."""
    result = cloudinary.uploader.upload(
        local_path,
        resource_type="video",
        folder=folder,
    )
    return {
        "secure_url": result["secure_url"],
        "public_id": result["public_id"],
    }


def cleanup(*paths):
    """Remove temp files, ignoring errors."""
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass