import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    adminSecretCode: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    adminRole: { type: String, default: 'Admin' }
});

export default mongoose.model('Admin', adminSchema);