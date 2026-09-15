import express from 'express';
import mongoose from 'mongoose';
import Testimony from './models/testimony.js';

const app = express();
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/anonymous_testimonies')
.then(() => console.log('MongoDB running'))
.catch((err) => console.error('Error', err));

app.get('/testimonies', async (req, res) => {
    const testimonies = await Testimony.find();
    res.json(testimonies);
});

app.listen(3000, () => console.log('Server running on port 3000'));