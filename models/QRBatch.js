import mongoose from 'mongoose';

const qrBatchSchema = new mongoose.Schema({
    qrId: { type: String, required: true, unique: true },
    company: String,
    brand: String,
    product: String,
    serialNumber: String,
    mfd: String,
    qrImage: { type: String, default: "" }, 
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('QRBatch', qrBatchSchema);