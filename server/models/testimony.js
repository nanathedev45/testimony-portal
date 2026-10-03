import mongoose from 'mongoose';

const testimonySchema = new mongoose.Schema(
    {
        text: {
            type: String,
            trim: true,
            // no longer required — voice testimonies won't have text
        },
        audioUrl: {
            type: String,
            default: null,
        },
        audioPublicId: {
            type: String,
            default: null,
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