import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import Testimony from './models/testimony.js';

const app = express();
app.use(express.json());

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

// logic for retrieving testimonies with key
app.get('/testimonies', requireAdmin, async (req, res) => {
    const testimonies = await Testimony.find().sort({createdAt: -1});
    res.json(testimonies);
});

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));