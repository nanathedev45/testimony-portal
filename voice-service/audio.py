from dotenv import load_dotenv
load_dotenv()

import os
import tempfile
from urllib.parse import urlparse

import requests
import cloudinary
import cloudinary.uploader

# Reads CLOUDINARY_URL from env (cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
cloudinary.config(secure=True)

# Only audio from this Cloudinary account is accepted.
# Blocks SSRF attempts via attacker-supplied URLs.
_ALLOWED_HOST = "res.cloudinary.com"


def _is_allowed_url(url: str) -> bool:
    """Return True only for URLs pointing at this account's Cloudinary media."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.hostname != _ALLOWED_HOST:
        return False

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    if not cloud_name:
        return False

    # Path must begin with /<cloud_name>/ so requests cannot reach other tenants.
    if not parsed.path.startswith(f"/{cloud_name}/"):
        return False

    return True


def download_audio(url: str) -> str:
    """Download a Cloudinary-hosted audio file to a temp local path. Returns the path."""
    if not _is_allowed_url(url):
        raise ValueError("Audio URL is not permitted")

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