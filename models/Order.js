   import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    invNum: String,
    company: String,
    role: String,
    officialEmail: String,
    division: String,  
    orderType: String,
    invoiceFile: String, 
    date: { type: String, default: () => new Date().toISOString().split('T')[0] },
    time: { type: String, default: () => new Date().toLocaleTimeString() },
    status: { type: String, default: 'Pending' },
    qrZipUrl: { type: String, default: null } 

});

export default mongoose.models.Order || mongoose.model('Order', orderSchema);