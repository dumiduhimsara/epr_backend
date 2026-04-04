import express from 'express';
import mongoose from 'mongoose';
import QRBatch from '../../models/QRBatch.js';
import QRRegistration from '../../models/QRRegistration.js';
import QRCompany from '../../models/QRCompany.js';
import QRProduct from '../../models/QRProduct.js';
import Product from '../../models/Product.js';
import RecycleRequest from '../../models/RecycleRequest.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

router.post('/save-qr-batch', async (req, res) => {
    const operations = req.body.batch.map(item => ({
        updateOne: { filter: { qrId: item.qrId }, update: { $set: item }, upsert: true }
    }));
    await QRBatch.bulkWrite(operations);
    res.json({ message: "Batch saved!" });
});

//add product route
router.post('/add-product', async (req, res) => {
      try {
        const { category, brand } = req.body;
        const newProduct = new QRProduct({ category, brand });
        await newProduct.save();
        res.status(201).json({ message: "Product saved successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save product" });
    }
});

// Get all products route
router.get('/get-products', async (req, res) => {
      try {
        const products = await QRProduct.find().sort({ createdAt: -1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});
    

// Admin delete product route
router.delete('/delete-product/:id', async (req, res) => {
     try {
        const { id } = req.params;
        await QRProduct.findByIdAndDelete(id);
        res.status(200).json({ message: "Product deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete product" });
    }
});

//QR registration route
router.get('/qr-registrations/all', async (req, res) => {
     try {
        const registrations = await QRRegistration.find({}).sort({ cuDate: -1 });
        res.status(200).json(registrations);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch registrations" });
    }
});

//recycle requests route
router.get('/recycle-requests/all', async (req, res) => {
     try {
    const requests = await RecycleRequest.find()
      .sort({ requestedAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch recycle requests" });
  }
});

// Co-Partner dashboard route
router.get('/co-partner/dashboard', async (req, res) => {
      try {
        const totalRegistered = await QRRegistration.countDocuments();
        const pending = await RecycleRequest.countDocuments({ status: 'Pending' });
        const collected = await RecycleRequest.countDocuments({ status: 'Collected' });
        const recentCollected = await RecycleRequest.find().sort({ requestedAt: -1 }).limit(10);
          

        res.json({
            success: true,
            totalQR: totalRegistered, 
            pending,
            collected,
            recentCollected,
            myCollected: 0 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

//get all generated qrs route
router.get('/get-all-generated-qrs', async (req, res) => {
      try {
        const QRBatchModel = mongoose.model('QRBatch');
        const QRCompanyModel = mongoose.model('QRCompany');
        const allGeneratedQRs = await QRBatchModel.find({}).sort({ createdAt: -1 });
        const companies = await QRCompanyModel.find({}); 
        const enrichedData = allGeneratedQRs.map(qr => {
        const qrObj = qr.toObject();
            
            if (!qrObj.registrationId) {
                const foundCompany = companies.find(c => c.name === qrObj.company);
                qrObj.registrationId = foundCompany ? foundCompany.registrationId : "REG-N/A";
            }

            if (!qrObj.qrImage) {
                qrObj.qrImage = 'https://cdn-icons-png.flaticon.com/512/7141/7141731.png';
            }

            return qrObj;
        });

        res.status(200).json(enrichedData);
    } catch (error) {
        console.error("❌ Error fetching QR log:", error.message);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});


// New route to verify QR code and check registration status
router.post('/verify-product', async (req, res) => {
    try {
        const { cuSerial } = req.body;

        const isValidQR = await QRBatch.findOne({ qrId: cuSerial });
        if (!isValidQR) {
            return res.status(404).json({ error: "Invalid QR!" });
        }

        const alreadyRegistered = await QRRegistration.findOne({ cuSerial: cuSerial });

        if (alreadyRegistered) {
            const lastRecycleRequest = await RecycleRequest.findOne({ qrId: cuSerial }).sort({ requestedAt: -1 });

            if (lastRecycleRequest) {
                const now = new Date();
                const requestDate = new Date(lastRecycleRequest.requestedAt);
                const diffInHours = (now - requestDate) / (1000 * 60 * 60); // පැය ගණන ගණනය කිරීම

               if (diffInHours < 48) {
    const totalLimitMs = 48 * 60 * 60 * 1000;
    const timePassedMs = now - requestDate;
    const remainingMs = totalLimitMs - timePassedMs;

    return res.status(200).json({ 
        status: "PENDING_LIMIT", 
        remainingTime: remainingMs
    });
                } else {
                    return res.status(200).json({ 
                        status: "SHOW_REMINDER", 
                        userData: alreadyRegistered 
                    });
                }
            }

            return res.status(200).json({ 
                status: "EXISTING", 
                userData: alreadyRegistered 
            });
        }
        res.status(200).json({ 
            status: "NEW", 
            details: isValidQR 
        });

    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});

// New route to add a company
router.post('/add-company', async (req, res) => {
    try {
        const { name, email, registrationId } = req.body;
        const newCompany = new QRCompany({ name, email, registrationId });
        await newCompany.save();
        res.status(201).json({ message: "Company registered successfully!" });
    } catch (error) {
        console.error("Company Save Error:", error);
        res.status(500).json({ error: "Failed to register company" });
    }
});

// Get all companies
router.get('/get-companies', async (req, res) => {
       try {
        const companies = await QRCompany.find().sort({ createdAt: -1 });
        res.status(200).json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch companies" });
    }
});

//top companies by number of registered products
router.get('/dashboard/top-companies', async (req, res) => {
      try {
        const topFive = await QRCompany.aggregate([
            {
                $lookup: {
                    from: "qrbatches",
                    localField: "name",
                    foreignField: "company",
                    as: "all_qrs"
                }
            },
            {
                $addFields: {
                    qrCount: { $size: "$all_qrs" }
                }
            },
            { $project: { all_qrs: 0 } },
            { $sort: { qrCount: -1 } },
            { $limit: 5 } 
        ]);
        res.status(200).json(topFive);
    } catch (error) {
        res.status(500).json({ error: "Dashboard data fetch failed" });
    }
});

// Admin delete company route
router.delete('/delete-company/:id', async (req, res) => {
       try {
        const { id } = req.params;
        await QRCompany.findByIdAndDelete(id);
        res.status(200).json({ message: "Company deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete company" });
    }
});

//save batch of generated QR codes with company info
router.post('/save-qr-batch', async (req, res) => {
    try {
        const { batch } = req.body;
        if (!batch || batch.length === 0) return res.status(400).json({ error: "No data provided" });

        const QRBatchModel = mongoose.model('QRBatch');
        const operations = batch.map(item => ({
            updateOne: {
                filter: { qrId: item.qrId },
                update: { $set: {
                    company: item.company,
                    brand: item.brand,
                    product: item.product,
                    serialNumber: item.serialNumber,
                    mfd: item.mfd,
                }},
                upsert: true 
            }
        }));

        await QRBatchModel.bulkWrite(operations);

        console.log(`✅ ${batch.length} QR batch processed successfully.`);
        res.status(200).json({ message: "Batch saved successfully!" });
    } catch (error) {
        console.error("❌ Batch Save Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// New route to save QR registration details
router.post('/save-registration', async (req, res) => {
        try {
        const { cuSerial, cuName, cuPhone, cuAddress } = req.body;

        const isValidQR = await QRBatch.findOne({ qrId: cuSerial });
        if (!isValidQR) {
            return res.status(404).json({ error: "Invalid QR!" });
        }
        const alreadyRegistered = await QRRegistration.findOne({ cuSerial });
        if (alreadyRegistered) {
            return res.status(400).json({ 
                error: "මේ QR කේතය දැනටමත් ලියාපදිංචි කර තිබෙනවා!" 
            });
        }
                const newEntry = new QRRegistration({
            cuSerial,
            cuName,
            cuPhone,
            cuAddress,
            cuCompany: isValidQR.company,
            cuProduct: isValidQR.product,
            cuBrand: isValidQR.brand
        });

        await newEntry.save();
        res.status(200).json({ message: "Success!", details: isValidQR });
    } catch (error) {
        res.status(500).json({ error: "Registration Failed" });
    }
});

// New route to save recycle request
router.post('/save-recycle-request', async (req, res) => {
     try {
        const { qrId, cuName, cuPhone, cuAddress, cuCompany, cuProduct, cuBrand } = req.body;

        const existing = await RecycleRequest.findOne({ qrId, status: 'Pending' });
        if (existing) return res.status(400).json({ message: "Request already pending!" });

        const registration = await QRRegistration.findOne({ cuSerial: qrId });
        if (!registration) {
            return res.status(404).json({ error: "QR registration not found!" });
        }

        const batchInfo = await mongoose.model('QRBatch').findOne({ qrId: qrId });
        const imageUrl = batchInfo ? batchInfo.qrImage : "";
        const newRequest = new RecycleRequest({
            qrId,
            cuName,
            cuPhone,
            cuAddress,
            cuCompany,
            cuProduct,
            cuBrand,
            qrImage: imageUrl,
            registeredAt: registration.cuDate,
            requestedAt: new Date(),
            status: 'Pending',
            collectedBy: null
        });

        await newRequest.save();
        res.status(201).json({ success: true, message: "Recycle request sent successfully!" });

    } catch (error) {
        console.error("Save Request Error:", error);
        res.status(500).json({ error: "Failed to send request" });
    }
});

// New route to save QR registration details
router.post('/save-qr', async (req, res) => {
     try {
        const { qrId, qrData } = req.body;
        const QRBatchModel = mongoose.model('QRBatch');
        const uploadResponse = await cloudinary.uploader.upload(qrData, {
            folder: 'generated_qrs',
            public_id: qrId,
            resource_type: 'image'
        });

        await QRBatchModel.findOneAndUpdate(
            { qrId: qrId }, 
            { $set: { qrImage: uploadResponse.secure_url } }, 
            { upsert: true, new: true }
        );

        console.log(`✅ QR Saved to Cloudinary: ${qrId}`);
        res.json({ success: true, url: uploadResponse.secure_url });
    } catch (error) {
        console.error("❌ QR Save Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

//Co-Partner to confirm collection of a product
router.post('/partner/confirm-collection', async (req, res) => {
       const { qrId, partnerId, partnerName, partnerPhone } = req.body;

    const updatedRequest = await RecycleRequest.findOneAndUpdate(
        { qrId: qrId, status: 'Pending' },
        { 
            status: 'Collected',
            collectedBy: partnerName, 
            cpId: partnerId,
            cpNum: partnerPhone, 
            collectedAt: new Date()
        },
        { new: true }
    );
});


export default router;

