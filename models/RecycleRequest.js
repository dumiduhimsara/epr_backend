import mongoose from 'mongoose';

const recycleRequestSchema = new mongoose.Schema({
    qrId: { type: String, required: true },
    cuName: String,
    cuPhone: String,
    cuAddress: String,
    cuCompany: String,
    cuProduct: String,
    cuBrand: String,
    qrImage: { type: String, default: "" },
    status: { type: String, default: 'Pending' }, 
    registeredAt: { type: Date },                 
    requestedAt: { type: Date, default: Date.now },
    collectedAt: { type: Date,default: null },                   
    collectedBy: { type: String, default: null },    
    cpId: { type: String, default: null },
    cpNum: { type: String, default: '' }         
});

export default mongoose.model('RecycleRequest', recycleRequestSchema);



