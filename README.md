# Wind of Faith 2026 — Anonymous Testimony Portal

A full-stack web application for collecting anonymous text and voice testimonies.
Text testimonies are submitted directly; voice testimonies are automatically
anonymized (pitch-shifted) before storage, and both can be shared as branded
images or animated video cards.

Built for the **Wind of Faith 2026** event by Assemblies of God, Ghana —
Faith Assembly, Nungua.

---

## ✨ Features

### Public
- Submit **text** testimonies via a simple form
- Submit **voice** testimonies by recording directly in the browser
- Audio is anonymized server-side before being stored (privacy)
- Responsive design, works on mobile
- Social media links in the footer

### Admin (password-protected)
- Session-based authentication with 30-minute auto-logout
- View all **live** testimonies and a **trash** bin
- Soft-delete testimonies (moved to trash, kept for 15 days)
- Restore from trash or permanently delete
- Automatic purge of testimonies older than 15 days in trash
- Play back voice testimonies directly in the admin view
- **Share/Download** as:
  - **Text testimonies** → branded PNG image
  - **Voice testimonies** → animated MP4 with a live waveform, playhead,
    timer, and the voice recording as audio

---

## 🏗️ Architecture

The project uses **three services** running together:
