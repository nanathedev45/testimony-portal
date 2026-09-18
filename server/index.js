import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import Testimony from './models/testimony.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
app.use(express.json());
app.use(cors());

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
    if(!key || key !== 'admin') {
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

// logic for submitting testimonies
app.post('/testimonies', async (req, res) => {
    try {
        const {text} = req.body;
        const newTestimony = await Testimony.create({text});
        res.status(201).json(newTestimony);
    } catch (err) {
        res.status(400).json({error: err.message});
    }
});

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
// Only active when a `dist/` folder exists (i.e. after `npm run build`).
// In dev, this block is skipped entirely — Vite handles the frontend.
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    // Catch-all: any non-API GET → serve index.html so React Router can take over.
    // MUST be the last route registered, after all API routes.
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log('Serving frontend from', distPath);
} else {
    console.log('No dist/ folder — API-only mode (dev)');
}

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));