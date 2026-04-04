import mongoose from 'mongoose';

const qrRegistrationSchema = new mongoose.Schema({
    cuSerial: String,
    cuName: String,
    cuPhone: String,
    cuAddress: String,
    cuCompany: String,
    cuProduct: String,
    cuBrand: String,
    cuDate: { type: Date, default: Date.now }
});

export default mongoose.model('QRRegistration', qrRegistrationSchema);