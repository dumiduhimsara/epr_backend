import express from 'express';
import Order from '../../models/Order.js';
import https from 'https';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { upload, cpUpload, tempZipUpload } from '../middlewares/upload.js';

const router = express.Router();

// Create a new order
router.post('/orders/create', async (req, res) => {
     try {
        const { invNum, company, role, division, orderType, officialEmail, invoiceFile } = req.body;
        
        const newOrder = new Order({
            invNum, company, role, division, orderType, officialEmail,
            invoiceFile: invoiceFile, 
            createdAt: new Date() 
        });

        await newOrder.save();
        res.status(201).json({ message: "Order placed successfully!", order: newOrder });
    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: "Order failed to save" });
    }
});

// Get orders by user email and division
router.get('/orders/user/:email/:division', async (req, res) => {
    try {
        const { email, division } = req.params;
        const orders = await Order.find({ 
            officialEmail: email.toLowerCase(), 
            division: division 
        }).sort({ _id: -1 }); 

        res.status(200).json(orders);
    } catch (error) {
        console.error("Order Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch order history" });
    }
});

// Update order status (Admin use)
router.put('/orders/update-status/:id', async (req, res) => {
     try {
        const { status } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { status: status },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ message: "Order not found" });
        }

        console.log(`✅ Order ${req.params.id} updated to ${status}`);
        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: error.message });
    }
});

//upload zip file for order
router.post('/orders/upload-zip/:id', tempZipUpload.single('zipFile'), async (req, res) => {
     try {
        const orderId = req.params.id;
        if (!req.file) return res.status(400).send('No file uploaded.');

        const uploadResponse = await cloudinary.uploader.upload(req.file.path, {
            folder: 'qr_zips',
            resource_type: 'raw', 
            access_mode: 'public',
            public_id: `ZIP-${Date.now()}-${req.file.originalname.split('.')[0]}.zip`
        });

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { 
                status: 'QR Sent', 
                qrZipUrl: uploadResponse.secure_url 
            },
            { new: true }
        );

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.log("✅ ZIP Uploaded Correctly:", uploadResponse.secure_url);
        res.status(200).json({ success: true, url: uploadResponse.secure_url });

    } catch (error) {
        console.error("❌ Final ZIP Upload Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});


// Download invoice file
router.get('/orders/download-invoice', async (req, res) => {
      const { url, fileName } = req.query;
    if (!url) return res.status(400).send("URL is required");

    https.get(url, (response) => {
        if (response.statusCode !== 200) {
            return res.status(500).send("Download failed from Cloudinary");
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'invoice'}.pdf"`);
        
        response.pipe(res);
    }).on('error', (err) => {
        console.error("Download Error:", err.message);
        res.status(500).send("Download failed");
    });
});

// Get all orders
router.get('/orders/all', async (req, res) => {
       try {
        const orders = await Order.find().sort({ _id: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Fetching orders failed" });
    }
});

// Update order status
router.put('/orders/update/:id', async (req, res) => {
     try {
        const { status } = req.body; 
        const orderId = req.params.id;

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { status: status },
            { new: true } 
        );

        if (!updatedOrder) {
            return res.status(404).json({ message: "Order not found!" });
        }

        console.log(`✅ Order ${orderId} updated to: ${status}`);
        res.status(200).json(updatedOrder);

    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;