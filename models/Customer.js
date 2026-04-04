import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    orgRole: { type: String, required: true },
    companyWebsite: { type: String }, 
    phone: { type: String, required: true },
    whatsapp: { type: String },
    officialEmail: { type: String, required: true, unique: true },
    address1: { type: String },
    address2: { type: String },
    postalCode: { type: String },
    country: { type: String },
    contactPersonName: { type: String, required: true },
    contactPersonMobile: { type: String, required: true },
    dob: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    status: { type: String, default: 'Pending' }, 
    regNumber: { type: String, unique: true },    
    registeredAt: { type: Date, default: Date.now },
    brcDocument: { type: String, default: '' },
    vatDocument: { type: String, default: '' },
    billingDocument: { type: String, default: '' },
    verificationDocs: { type: [String], default: [] }
   
});

export default mongoose.model('Customer', customerSchema);
