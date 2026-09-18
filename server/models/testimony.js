import mongoose from 'mongoose';

const testimonySchema = new mongoose.Schema(
    {
        text: {
            type: String,
            required: true,
            trim: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

const Testimony = mongoose.model('Testimony', testimonySchema);

export default Testimony;