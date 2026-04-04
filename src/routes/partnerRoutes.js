import express from 'express';
import CoPartner from '../../models/CoPartner.js';
import RecycleRequest from '../../models/RecycleRequest.js';
import bcrypt from 'bcryptjs';
import Admin from '../../models/Admin.js';
import Customer from '../../models/Customer.js';
import { upload, cpUpload, tempZipUpload } from '../middlewares/upload.js';

const router = express.Router();

// Partner registration route
router.post('/partners/register', async (req, res) => {
    try {

        const checkEmail = req.body.email;
        const exists1 = await Admin.findOne({ email: checkEmail });
        const exists2 = await Customer.findOne({ officialEmail: checkEmail }); 
        const exists3 = await CoPartner.findOne({ email: checkEmail });

        if (exists1 || exists2 || exists3) {
            return res.status(400).json({ error: "This email is already registered in our system!" });
        }
        const { password } = req.body;
        const lastPartner = await CoPartner.findOne().sort({ createdAt: -1 });
        
        let newIdNumber = 1;
        if (lastPartner && lastPartner.coPartnerId) {
            const lastIdStr = lastPartner.coPartnerId.replace('CP', ''); 
            newIdNumber = parseInt(lastIdStr) + 1;
        }

        const generatedId = `CP${newIdNumber.toString().padStart(3, '0')}`;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newPartner = new CoPartner({ 
            ...req.body, 
            coPartnerId: generatedId, 
            password: hashedPassword 
        });

        await newPartner.save();
        res.status(201).json({ 
            message: "Co-Partner registered successfully!", 
            partnerId: generatedId 
        });

    } catch (error) {
        console.error("Reg Error:", error);
        res.status(500).json({ error: "Registration failed. NIC or Email might already exist." });
    }
});

//Partner confirms collection
router.post('/partner/confirm-collection', async (req, res) => {
    try {
        const { qrId, partnerId, partnerName, partnerPhone } = req.body;

        const request = await RecycleRequest.findOne({ 
            qrId: qrId.trim(), 
            status: 'Pending' 
        });

        if (!request) {
            return res.status(400).json({ 
                success: false, 
                message: "Pending request not found for this QR!" 
            });
        }

        request.status = 'Collected';
        request.collectedBy = partnerName;
        request.cpNum = partnerPhone;       
        request.collectedAt = new Date();   
        request.cpId = partnerId; 

        await request.save();

        res.json({ 
            success: true, 
            message: `Collection confirmed successfully by ${partnerName}` 
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

//partner deletion route
router.delete('/partners/delete/:id', async (req, res) => {
        try {
        await CoPartner.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Partner deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete partner" });
    }
});

//get all partners route
router.get('/partners/all', async (req, res) => {
     try {
        const partners = await CoPartner.find().sort({ createdAt: -1 });
        res.status(200).json(partners);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch partners" });
    }
});

//partner update route
router.put('/partners/update/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;
        const existingPartner = await CoPartner.findById(id);
        if (!existingPartner) {
            return res.status(404).json({ error: "Partner not found" });
        }

        if (updateData.password) {
            if (updateData.password === existingPartner.password) {
                delete updateData.password;
            } else {
                const salt = await bcrypt.genSalt(10);
                updateData.password = await bcrypt.hash(updateData.password, salt);
            }
        } else {
            delete updateData.password;
        }

        await CoPartner.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        
        res.status(200).json({ message: "Partner updated successfully!" });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "Failed to update partner" });
    }
});


export default router;

