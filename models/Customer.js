const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    orgRole: { type: String, required: true },
    companyWebsite: String,
    phone: { type: String, required: true },
    whatsapp: String,
    officialEmail: { type: String, required: true, unique: true },
    address1: String,
    address2: String,
    postalCode: String,
    country: String,
    contactPersonName: String,
    contactPersonMobile: String,
    dob: String, // උපන් දිනය [cite: 2026-02-13]
    password: { type: String, required: true }
});

module.exports = mongoose.model('Customer', CustomerSchema);