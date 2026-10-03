import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import Testimony from './models/testimony.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

const app = express();
app.use(express.json());
app.use(cors());

// ---- Multer (in-memory, for forwarding files to Python) ----
const upload = multer({ storage: multer.memoryStorage() });

// ---- Cloudinary config ----
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---- Trash config ----
const TRASH_DAYS = 15;
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

// ---- ESM __dirname shim ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB is running'))
    .catch((err) => console.error('Error', err));


// auth middleware
function requireAdmin(req, res, next) {
    const key = req.headers['authorization']?.replace('Bearer ', '');
    if(!key || key !== process.env.ADMIN_KEY) {
        return res.status(401).json({error: 'Unauthorized'});
    }
    next();
}

// helper — purges testimonies past the trash window
async function purgeExpired() {
    const cutoff = new Date(Date.now() - TRASH_MS);
    return Testimony.deleteMany({
        deletedAt: { $ne: null, $lt: cutoff },
    });
}

// ---- Cloudinary signature route (public) ----
app.post('/cloudinary/signature', (req, res) => {
    try {
        const timestamp = Math.round(Date.now() / 1000);
        const paramsToSign = {
            timestamp,
            folder: 'testimonies',
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDINARY_API_SECRET
        );

        res.json({
            signature,
            timestamp,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            folder: 'testimonies',
            resourceType: 'video',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- logic for submitting testimonies (text OR voice) ----
app.post('/testimonies', async (req, res) => {
    try {
        const { text, audioUrl, audioPublicId } = req.body;

        if (!text?.trim() && !audioUrl) {
            return res.status(400).json({ error: 'Provide text or a voice recording' });
        }

        // ---- Text testimony: save as-is ----
        if (text?.trim()) {
            const newTestimony = await Testimony.create({
                text: text.trim(),
            });
            return res.status(201).json(newTestimony);
        }

        // ---- Voice testimony: anonymize first ----
        const pyRes = await fetch(`${process.env.PYTHON_SERVICE_URL}/anonymize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: audioUrl }),
        });

        if (!pyRes.ok) {
            const errBody = await pyRes.text();
            console.error('Python anonymize failed:', errBody);
            return res.status(500).json({ error: 'Voice anonymization failed' });
        }

        const { audio_url: anonymizedUrl, public_id: anonymizedPublicId } =
            await pyRes.json();

        if (audioPublicId) {
            try {
                await cloudinary.uploader.destroy(audioPublicId, {
                    resource_type: 'video',
                });
            } catch (err) {
                console.error('Failed to delete original audio:', err.message);
            }
        }

        const newTestimony = await Testimony.create({
            audioUrl: anonymizedUrl,
            audioPublicId: anonymizedPublicId,
        });

        res.status(201).json(newTestimony);
    } catch (err) {
        console.error('POST /testimonies failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---- Render a voice testimony as a video ----
// The frontend sends the rendered PNG (multipart) + audio URL.
// We forward both to Python, which runs ffmpeg and returns an MP4.
app.post(
    '/testimonies/render-video',
    requireAdmin,
    upload.single('image'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No image provided' });
            }

            const { audio_url } = req.body;
            if (!audio_url) {
                return res.status(400).json({ error: 'No audio_url provided' });
            }

            const formData = new FormData();
            formData.append(
                'image',
                new Blob([req.file.buffer], { type: 'image/png' }),
                'card.png'
            );
            formData.append('audio_url', audio_url);

            const pyRes = await fetch(
                `${process.env.PYTHON_SERVICE_URL}/render-video`,
                { method: 'POST', body: formData }
            );

            if (!pyRes.ok) {
                const errText = await pyRes.text();
                console.error('Python render-video failed:', errText);
                return res.status(500).json({ error: 'Video render failed' });
            }

            const arrayBuffer = await pyRes.arrayBuffer();
            res.set('Content-Type', 'video/mp4');
            res.set('Content-Disposition', 'attachment; filename="testimony.mp4"');
            res.send(Buffer.from(arrayBuffer));
        } catch (err) {
            console.error('render-video proxy failed:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

// live testimonies only (admin)
app.get('/testimonies', requireAdmin, async (req, res) => {
    const testimonies = await Testimony.find({ deletedAt: null }).sort({createdAt: -1});
    res.json(testimonies);
});

// trash bin — purges expired first, then returns what's left (admin)
app.get('/testimonies/trash', requireAdmin, async (req, res) => {
    await purgeExpired();
    const trashed = await Testimony.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 });
    res.json(trashed);
});

// soft delete (admin) — moves to trash
app.delete('/testimonies/:id', requireAdmin, async (req, res) => {
    try {
        const updated = await Testimony.findByIdAndUpdate(
            req.params.id,
            { deletedAt: new Date() },
            { new: true }
        );
        if (!updated) return res.status(404).json({error: 'Not found'});
        res.json(updated);
    } catch (err) {
        res.status(400).json({error: err.message});
    }
});

// TEMPORARY — remove after testing
app.get('/debug/audio-url', async (req, res) => {
    const t = await Testimony.findOne({ audioUrl: { $ne: null } });
    res.json({ audioUrl: t?.audioUrl || null });
});

// restore from trash (admin)
app.post('/testimonies/:id/restore', requireAdmin, async (req, res) => {
    try {
        const updated = await Testimony.findByIdAndUpdate(
            req.params.id,
            { deletedAt: null },
            { new: true }
        );
        if (!updated) return res.status(404).json({error: 'Not found'});
        res.json(updated);
    } catch (err) {
        res.status(400).json({error: err.message});
    }
});

// permanent delete (admin) — only works on items already in trash
app.delete('/testimonies/:id/permanent', requireAdmin, async (req, res) => {
    try {
        const deleted = await Testimony.findOneAndDelete({
            _id: req.params.id,
            deletedAt: { $ne: null },
        });
        if (!deleted) return res.status(404).json({ error: 'Not found or not in trash' });

        if (deleted.audioPublicId) {
            try {
                await cloudinary.uploader.destroy(deleted.audioPublicId, {
                    resource_type: 'video',
                });
            } catch (err) {
                console.error('Cloudinary delete failed:', err.message);
            }
        }

        res.json({ ok: true, _id: deleted._id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// background purge — every hour
setInterval(async () => {
    try {
        const result = await purgeExpired();
        if (result.deletedCount) {
            console.log(`Purged ${result.deletedCount} testimonies past trash window`);
        }
    } catch (err) {
        console.error('Purge error:', err);
    }
}, 60 * 60 * 1000);

// ---- Static frontend (production only) ----
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log('Serving frontend from', distPath);
} else {
    console.log('No dist/ folder — API-only mode (dev)');
}

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));