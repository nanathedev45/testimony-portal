```markdown
# Wind of Faith 2026 - Anonymous Testimony Portal

A full-stack web application for collecting anonymous text and voice testimonies.
Text testimonies are submitted directly. Voice testimonies are automatically
anonymized (pitch-shifted) before storage, and both can be shared as branded
images or animated video cards.

Built for the Wind of Faith 2026 event by Assemblies of God, Ghana - Faith
Assembly, Nungua.

## Features

### Public
- Submit text testimonies via a simple form
- Submit voice testimonies by recording directly in the browser
- Audio is anonymized server-side before being stored
- Responsive design, works on mobile
- Social media links in the footer

### Admin (password-protected)
- Session-based authentication with 30-minute auto-logout
- View all live testimonies and a trash bin
- Soft-delete testimonies (moved to trash, kept for 15 days)
- Restore from trash or permanently delete
- Automatic purge of testimonies older than 15 days in trash
- Play back voice testimonies directly in the admin view
- Share/Download as:
  - Text testimonies: branded PNG image
  - Voice testimonies: animated MP4 with a live waveform, playhead, timer,
    and the voice recording as audio

## Architecture

The project uses three services running together:

    Frontend (React + Vite)         localhost:5173
      - Public submit page
      - Admin portal (/admin)
              |
              | HTTP
              v
    Backend (Express + Mongoose)    localhost:3000
      - REST API
      - MongoDB connection
      - Cloudinary upload signatures
      - Auth middleware
              |
              | HTTP
              v
    Voice Service (Python + FastAPI)   localhost:4000
      - Voice anonymization (pitch shifting via ffmpeg)
      - Audio waveform extraction (RMS analysis)
      - Animated video rendering (Pillow + ffmpeg)
              |
              v
    MongoDB + Cloudinary

Why three services:
- Express handles app logic, auth, and DB operations well.
- Python handles audio/video processing well (ffmpeg, Pillow, soundfile).
  Node is a poor fit for this.
- Vite serves the React frontend in dev and builds static assets for prod.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router 6 |
| Backend | Node.js, Express 5, Mongoose 8 |
| Voice Service | Python 3.13, FastAPI, uvicorn, Pillow, soundfile, numpy |
| Database | MongoDB |
| Media Storage | Cloudinary (audio files) |
| Audio/Video | ffmpeg (with librubberband for pitch shifting) |

## Project Structure

    anonymous_testimonies/
    ├── public/                       # Static files served at root (favicon, etc.)
    ├── src/                          # React frontend
    │   ├── components/
    │   │   ├── SubmitView.jsx        # Public submit form
    │   │   ├── VoiceRecorder.jsx     # Voice recording UI
    │   │   ├── AdminView.jsx         # Admin portal
    │   │   ├── ShareButton.jsx       # Share/download buttons
    │   │   └── Footer.jsx            # Social links
    │   ├── hooks/
    │   │   └── useVoiceRecorder.js   # MediaRecorder lifecycle hook
    │   ├── lib/
    │   │   └── renderTestimonyImage.js   # Canvas renderer for share images
    │   ├── App.jsx                   # Routes + layout
    │   ├── App.css                   # All styles
    │   ├── main.jsx                  # Entry point
    │   └── index.css                 # CSS variables + base styles
    ├── server/                       # Express backend
    │   ├── models/
    │   │   └── testimony.js          # Mongoose schema
    │   └── index.js                  # All API routes
    ├── voice-service/                # Python voice processing service
    │   ├── app.py                    # FastAPI endpoints
    │   ├── anonymize.py              # Pitch shifting logic
    │   ├── waveform.py               # Audio amplitude analysis
    │   ├── frames.py                 # Animated frame generator
    │   ├── render.py                 # ffmpeg video encoding
    │   ├── audio.py                  # Cloudinary download/upload helpers
    │   ├── requirements.txt          # Python dependencies
    │   └── fonts/                    # (optional) bundled fonts
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── eslint.config.js
    ├── .env.example
    ├── .gitignore
    └── README.md

## Local Setup

### Prerequisites

- Node.js 20.19+ or 22.12+
- Python 3.10+
- MongoDB (local or Atlas)
- ffmpeg + ffprobe
- Cloudinary account (free tier)

### Install ffmpeg (macOS)

If Homebrew works on your system:

    brew install ffmpeg

If not (older macOS), download pre-built binaries from evermeet.cx:

- ffmpeg: https://evermeet.cx/ffmpeg/getrelease/zip
- ffprobe: https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip

Move both binaries to /usr/local/bin:

    sudo mv ~/Downloads/ffmpeg /usr/local/bin/
    sudo mv ~/Downloads/ffprobe /usr/local/bin/
    sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

Verify:

    ffmpeg -version
    ffprobe -version

### 1. Clone and install

    git clone https://github.com/nanathedev45/testimony-portal.git
    cd testimony-portal
    npm install

### 2. Configure environment

    cp .env.example .env

Edit .env with your real values:

    # Server
    PORT=3000
    ADMIN_KEY=choose-a-strong-secret-key

    # Database
    MONGO_URI=mongodb://localhost:27017/anonymous_testimonies

    # Cloudinary (get these from https://cloudinary.com/console)
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret

    # Python voice service
    PYTHON_SERVICE_URL=http://127.0.0.1:4000

### 3. Set up the Python voice service

    cd voice-service
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

Create voice-service/.env:

    CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

The Python Cloudinary SDK reads this single variable.

### 4. Start all three services

Terminal 1 - Python voice service (from voice-service/):

    source venv/bin/activate
    python app.py

Listens on http://0.0.0.0:4000.

Terminal 2 - Express backend (from project root):

    node server/index.js

Listens on http://localhost:3000.

Terminal 3 - Vite frontend (from project root):

    npm run dev

Listens on http://localhost:5173.

### 5. Open the app

- Public submit page: http://localhost:5173
- Admin portal: http://localhost:5173/admin (enter the ADMIN_KEY)

## Testing on Your Phone (LAN)

1. Get your Mac's local IP:

    ipconfig getifaddr en0

2. Start Vite with --host:

    npm run dev -- --host

   Or update package.json:

    "dev": "vite --host"

3. On your phone (same Wi-Fi), open the Network URL Vite prints.

Microphone note: Browsers only allow getUserMedia() (mic access) on https://
or http://localhost. Over a LAN IP like http://192.168.1.42:5173, the mic API is
blocked - you'll see navigator.mediaDevices is undefined.

Workaround: Use ngrok to get a public HTTPS URL:

    ngrok http 5173

Open the ngrok URL on your phone - the mic will work.

## API Reference

### Public

| Method | Endpoint | Description |
|---|---|---|
| POST | /cloudinary/signature | Get a signed upload token |
| POST | /testimonies | Submit a text or voice testimony |

### Admin (requires Authorization: Bearer <ADMIN_KEY>)

| Method | Endpoint | Description |
|---|---|---|
| GET | /testimonies | List live testimonies |
| GET | /testimonies/trash | List trashed testimonies |
| DELETE | /testimonies/:id | Soft-delete (move to trash) |
| POST | /testimonies/:id/restore | Restore from trash |
| DELETE | /testimonies/:id/permanent | Permanently delete |
| POST | /testimonies/render-video | Render an animated MP4 |

### Voice Service (internal - Express calls these)

| Method | Endpoint | Description |
|---|---|---|
| GET | /health | Sanity check |
| POST | /anonymize | Apply pitch shift to audio |
| POST | /extract-waveform | Analyze audio amplitude |
| POST | /render-video | Generate animated MP4 from frames |

## Design System

| Token | Value | Usage |
|---|---|---|
| --bg | #392282 (deep blue) | Main background |
| --accent | #ece700 (yellow) | Buttons, highlights |
| --text | #f5f3ff | Body text |
| --text-muted | rgba(245, 243, 255, 0.55) | Secondary text |

The design follows a deep blue + yellow palette inspired by the Assemblies of
God branding.

## Privacy and Security

- Voice anonymization: Every voice testimony is pitch-shifted and
  formant-adjusted via ffmpeg's rubberband filter before storage. The
  original is deleted from Cloudinary immediately after processing.
- Admin access: Protected by a shared secret key (stored in .env). Sessions
  expire after 30 minutes.
- Trash retention: Deleted testimonies live in a "trash" state for 15 days
  before being automatically purged.
- Cloudinary signed uploads: The API secret never leaves the server.
- No tracking, no analytics, no cookies. The app stores nothing about
  visitors.

## Common Tasks

### Change the pitch shift depth

voice-service/anonymize.py:

    def anonymize_voice(input_path, pitch_semitones=-4.0, formant_ratio=1.15):

- More negative = deeper (-4, -6, -8)
- Positive = higher (+4)

### Change the animated video FPS

voice-service/frames.py:

    FPS = 10  # frames per second

- 5: faster encoding, smaller files
- 10: smoother (default)
- 15: very smooth, larger files

### Change the trash retention window

server/index.js:

    const TRASH_DAYS = 15;

### Update the share caption URL

src/components/ShareButton.jsx:

    const SHARE_URL = 'https://your-domain.com';

## Deployment

When deploying:

1. Frontend: Build with npm run build - produces a dist/ folder. Host on
   Vercel, Netlify, Render, Fly, or any static host.
2. Backend: Express and Python need to be on separate hosts (or the same box
   via a process manager). Both need ffmpeg installed if they touch
   audio/video.
3. Environment variables: Set them in the hosting provider's dashboard - do
   not commit .env files.
4. MongoDB: Use MongoDB Atlas (free tier).
5. Cloudinary: Same account, no changes needed.
6. CORS: Update app.use(cors()) to restrict to your production domain:

    app.use(cors({ origin: 'https://your-domain.com' }));

7. Frontend API URL: Update API_URL in the component files to point at the
   deployed backend URL (or use an environment variable).
8. Fonts: The current voice-service/frames.py uses Arial from the macOS
   system. Bundle a font (e.g., Inter) in voice-service/fonts/ and update
   the paths for Linux production.

## Contributing

This is a personal project for a specific church event. If you've found a bug
or have a suggestion, feel free to open an issue.

## License

This project is for Wind of Faith 2026 - Assemblies of God, Ghana. Not for
redistribution.

## Acknowledgements

- Wind of Faith 2026 - Assemblies of God, Ghana - Faith Assembly, Nungua
- Cloudinary (https://cloudinary.com) - free audio/video hosting
- Vite (https://vite.dev) - dev server
- FastAPI (https://fastapi.tiangolo.com) - Python web framework
- ffmpeg (https://ffmpeg.org) - audio/video processing
```