import mongoose from 'mongoose';

const testimonySchema = new mongoose.Schema({
    isTestimony: Boolean,
    message: String
});

const Testimony = mongoose.model('Testimony', testimonySchema);

export default Testimony;