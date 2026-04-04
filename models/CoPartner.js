import mongoose from 'mongoose';

const coPartnerSchema = new mongoose.Schema({
    coPartnerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    nic: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    district: { type: String, required: true },
    pradeshiyaSabha: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('CoPartner', coPartnerSchema);


