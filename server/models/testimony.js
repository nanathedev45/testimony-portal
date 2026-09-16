import mongoose from 'mongoose';

const testimonySchema = new mongoose.Schema(
    {
        text: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { timestamps: true }
);

const Testimony = mongoose.model('Testimony', testimonySchema);

export default Testimony;