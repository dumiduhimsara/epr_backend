import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    productType: String,
    brandName: String,
    productModel: String,
    originCountry: String,
    annualQuantityWeight: Number,
    annualQuantityUnits: Number,
    packagingCategory: String,
    packagingMaterial: String,
    unitWeight: String,
    usageType: String,
    materials: [{ 
        materialName: String, 
        percentage: Number 
    }],
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Product', productSchema);