import mongoose from 'mongoose';

const qrProductSchema = new mongoose.Schema({
    category: { type: String, required: true },
    brand: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('QRProduct', qrProductSchema);


