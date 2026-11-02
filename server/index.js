import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import Testimony from './models/testimony.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { v2 as cloudinary } from 'cloudinary';

const app = express();
app.use(express.json());
app.use(cors());

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const TRASH_DAYS = 15;
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;
const MAX_VOICE_SECONDS = 300;

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB is running'))
    .catch((err) => console.error('Error connecting to MongoDB:', err.message));

// Rate limiting
// Store is in-memory, so limits reset on process restart.
// Swap to a Redis store before scaling horizontally.
const publicLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
});

const adminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
});

// Auth middleware. Compares against ADMIN_KEY.
// No server-side session state; the key is the credential and rotates by env change.
function requireAdmin(req, res, next) {
    const key = req.headers.authorization?.replace('Bearer ', '');
    if (!key || key !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Extract the Cloudinary public_id from a secure_url.
// Returns null if the URL does not belong to this Cloudinary account
// or falls outside the expected folder prefix.
function parseCloudinaryPublicId(url, { expectedFolder }) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'res.cloudinary.com') return null;

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const parts = parsed.pathname.split('/').filter(Boolean);
        // Expected: [cloudName, resourceType, deliveryType, version, ...publicIdPath]
        if (parts.length < 5) return null;
        if (parts[0] !== cloudName) return null;
        if (parts[1] !== 'video') return null;
        if (parts[2] !== 'upload') return null;

        // Strip version segment (v\d+) and file extension
        const publicIdPath = parts.slice(4).join('/').replace(/\.[^.]+$/, '');
        if (expectedFolder && !publicIdPath.startsWith(expectedFolder)) return null;

        return publicIdPath;
    } catch {
        return null;
    }
}

// Delete a Cloudinary video asset. Throws on failure so callers can decide.
async function deleteCloudinaryAsset(publicId) {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
}

// Purge testimonies past the trash window.
// Deletes the Cloudinary asset first; skips records whose media cannot be removed
// so an orphaned file is never stranded without its DB row.
async function purgeExpired() {
    const cutoff = new Date(Date.now() - TRASH_MS);
    const expired = await Testimony.find({
        deletedAt: { $ne: null, $lt: cutoff },
    });

    if (expired.length === 0) return { deletedCount: 0 };

    const removableIds = [];
    for (const t of expired) {
        if (t.audioPublicId) {
            try {
                await deleteCloudinaryAsset(t.audioPublicId);
            } catch (err) {
                console.error(`Purge: Cloudinary delete failed for ${t._id}:`, err.message);
                continue;
            }
        }
        removableIds.push(t._id);
    }

    if (removableIds.length === 0) return { deletedCount: 0 };

    const result = await Testimony.deleteMany({ _id: { $in: removableIds } });
    return { deletedCount: result.deletedCount };
}

// Sign a Cloudinary upload. Public — the client uses this to upload raw audio.
app.post('/cloudinary/signature', publicLimiter, (req, res) => {
    try {
        const timestamp = Math.round(Date.now() / 1000);
        const paramsToSign = { timestamp, folder: 'testimonies' };

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
        console.error('Cloudinary signature failed:', err.message);
        res.status(500).json({ error: 'Signature generation failed' });
    }
});

// Submit a testimony (text or voice).
// Voice path: anonymize via Python, delete the original upload, save the result.
// The original's public_id is derived from the submitted URL, never trusted from the client.
app.post('/testimonies', publicLimiter, async (req, res) => {
    try {
        const { text, audioUrl } = req.body;

        const hasText = typeof text === 'string' && text.trim().length > 0;
        const hasAudio = typeof audioUrl === 'string' && audioUrl.trim().length > 0;

        if (!hasText && !hasAudio) {
            return res.status(400).json({ error: 'Provide text or a voice recording' });
        }

        if (hasText) {
            const newTestimony = await Testimony.create({ text: text.trim() });
            return res.status(201).json(newTestimony);
        }

        if (!process.env.PYTHON_SERVICE_URL) {
            console.error('PYTHON_SERVICE_URL is not configured.');
            return res.status(500).json({ error: 'Voice processing is unavailable' });
        }

        // Reject audio URLs that are not from our Cloudinary folder.
        // Prevents the Python service from being coerced into fetching arbitrary URLs.
        const originalPublicId = parseCloudinaryPublicId(audioUrl, {
            expectedFolder: 'testimonies/',
        });
        if (!originalPublicId) {
            return res.status(400).json({ error: 'Invalid audio URL' });
        }

        // Anonymize
        const pyRes = await fetch(`${process.env.PYTHON_SERVICE_URL}/anonymize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: audioUrl }),
        });

        if (!pyRes.ok) {
            const errText = await pyRes.text();
            console.error('Anonymize failed:', errText);
            return res.status(500).json({ error: 'Voice anonymization failed' });
        }

        const pyData = await pyRes.json();
        const anonymizedUrl = pyData.audio_url;
        const anonymizedPublicId = pyData.public_id;
        const durationSeconds = pyData.duration_seconds;
        const waveformData = Array.isArray(pyData.waveform) ? pyData.waveform : null;

        if (!anonymizedUrl || !anonymizedPublicId) {
            console.error('Anonymize returned incomplete data:', pyData);
            return res.status(500).json({ error: 'Voice anonymization failed' });
        }

        if (typeof durationSeconds === 'number' && durationSeconds > MAX_VOICE_SECONDS) {
            // Clean up the anonymized file since we're rejecting.
            try {
                await deleteCloudinaryAsset(anonymizedPublicId);
            } catch (err) {
                console.error('Cleanup of rejected anonymized file failed:', err.message);
            }
            return res.status(400).json({
                error: `Voice recordings must be ${MAX_VOICE_SECONDS} seconds or shorter`,
            });
        }

        // Delete the original upload. Failure is non-fatal — the anonymized version
        // is what's persisted and what the user sees.
        try {
            await deleteCloudinaryAsset(originalPublicId);
        } catch (err) {
            console.error('Failed to delete original upload:', err.message);
        }

        const newTestimony = await Testimony.create({
            audioUrl: anonymizedUrl,
            audioPublicId: anonymizedPublicId,
            waveformData,
        });

        return res.status(201).json(newTestimony);
    } catch (err) {
        console.error('POST /testimonies failed:', err.message);
        return res.status(500).json({ error: 'Submission failed' });
    }
});

// Render a voice testimony as an MP4.
// Streams the Python response directly to the client.
app.post('/testimonies/render-video', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const { audio_url, waveform, duration_seconds, created_at } = req.body;

        if (!audio_url || typeof audio_url !== 'string') {
            return res.status(400).json({ error: 'No audio_url provided' });
        }
        if (!Array.isArray(waveform) || waveform.length === 0) {
            return res.status(400).json({ error: 'No waveform provided' });
        }
        if (typeof duration_seconds !== 'number' || duration_seconds <= 0) {
            return res.status(400).json({ error: 'No duration provided' });
        }
        if (!created_at || typeof created_at !== 'string') {
            return res.status(400).json({ error: 'No created_at provided' });
        }
        if (!parseCloudinaryPublicId(audio_url, { expectedFolder: 'testimonies-anon/' })) {
            return res.status(400).json({ error: 'Invalid audio URL' });
        }
        if (!process.env.PYTHON_SERVICE_URL) {
            return res.status(500).json({ error: 'Video service unavailable' });
        }

        const pyRes = await fetch(`${process.env.PYTHON_SERVICE_URL}/render-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_url,
                waveform,
                duration_seconds,
                created_at,
            }),
        });

        if (!pyRes.ok) {
            const errText = await pyRes.text();
            console.error('render-video failed:', errText);
            return res.status(500).json({ error: 'Video render failed' });
        }

        // Stream instead of buffering the whole MP4 in memory.
        res.set('Content-Type', 'video/mp4');
        res.set('Content-Disposition', 'attachment; filename="testimony.mp4"');
        const reader = pyRes.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) {
                await new Promise((resolve) => res.once('drain', resolve));
            }
        }
        res.end();
    } catch (err) {
        console.error('render-video proxy failed:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Video render failed' });
        }
        res.end();
    }
});

// Live testimonies (admin)
app.get('/testimonies', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const testimonies = await Testimony.find({ deletedAt: null }).sort({ createdAt: -1 });
        return res.json(testimonies);
    } catch (err) {
        console.error('GET /testimonies failed:', err.message);
        return res.status(500).json({ error: 'Failed to load testimonies' });
    }
});

// Trash bin (admin). Purges expired entries first.
app.get('/testimonies/trash', adminLimiter, requireAdmin, async (req, res) => {
    try {
        await purgeExpired();
        const trashed = await Testimony.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 });
        return res.json(trashed);
    } catch (err) {
        console.error('GET /testimonies/trash failed:', err.message);
        return res.status(500).json({ error: 'Failed to load trash' });
    }
});

// Soft delete — moves to trash
app.delete('/testimonies/:id', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const updated = await Testimony.findByIdAndUpdate(
            req.params.id,
            { deletedAt: new Date() },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        return res.json(updated);
    } catch (err) {
        console.error('Soft delete failed:', err.message);
        return res.status(500).json({ error: 'Delete failed' });
    }
});

// Restore from trash
app.post('/testimonies/:id/restore', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const updated = await Testimony.findByIdAndUpdate(
            req.params.id,
            { deletedAt: null },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        return res.json(updated);
    } catch (err) {
        console.error('Restore failed:', err.message);
        return res.status(500).json({ error: 'Restore failed' });
    }
});

// Permanent delete.
// Cloudinary asset is deleted first; the DB row is only removed once
// Cloudinary confirms success, so a failure leaves the record intact for retry.
app.delete('/testimonies/:id/permanent', adminLimiter, requireAdmin, async (req, res) => {
    try {
        const record = await Testimony.findOne({
            _id: req.params.id,
            deletedAt: { $ne: null },
        });
        if (!record) return res.status(404).json({ error: 'Not found or not in trash' });

        if (record.audioPublicId) {
            try {
                await deleteCloudinaryAsset(record.audioPublicId);
            } catch (err) {
                console.error('Cloudinary delete failed:', err.message);
                return res.status(500).json({
                    error: 'Failed to delete media. Testimony was not removed — retry.',
                });
            }
        }

        await Testimony.deleteOne({ _id: record._id });
        return res.json({ ok: true, _id: record._id });
    } catch (err) {
        console.error('Permanent delete failed:', err.message);
        return res.status(500).json({ error: 'Delete failed' });
    }
});

// Background purge — runs hourly
setInterval(async () => {
    try {
        const result = await purgeExpired();
        if (result.deletedCount) {
            console.log(`Purged ${result.deletedCount} testimonies past trash window`);
        }
    } catch (err) {
        console.error('Purge error:', err.message);
    }
}, 60 * 60 * 1000);

// Static frontend (production only)
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    // Express 5 requires named wildcards; `*` alone throws at registration.
    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log('Serving frontend from', distPath);
} else {
    console.log('No dist/ folder — API-only mode (dev)');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));