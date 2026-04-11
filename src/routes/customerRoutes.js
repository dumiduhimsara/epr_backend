import express from 'express';
import bcrypt from 'bcryptjs';
import Customer from '../../models/Customer.js';
import Admin from '../../models/Admin.js';
import CoPartner from '../../models/CoPartner.js';
import Counter from '../../models/Counter.js';
import { upload, cpUpload, tempZipUpload } from '../middlewares/upload.js';
import Product from '../../models/Product.js';


const router = express.Router();

// Customer Registration Route
router.post('/register', async (req, res) => {
    try {
        const data = req.body;

        const checkEmail = data.officialEmail; 

        const exists1 = await Admin.findOne({ email: checkEmail });
        const exists2 = await Customer.findOne({ officialEmail: checkEmail }); 
        const exists3 = await CoPartner.findOne({ email: checkEmail });

        if (exists1 || exists2 || exists3) {
            return res.status(400).json({ error: "This email is already registered in our system!" });
        }

        const counter = await Counter.findOneAndUpdate(
            { id: 'customer_reg' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const sequenceStr = counter.seq.toString().padStart(7, '0');
        const currentYear = new Date().getFullYear();
        const regNo = `EPR-${currentYear}-${sequenceStr}`;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.password, salt);
        const newCustomer = new Customer({ 
            ...data, 
            password: hashedPassword,
            regNumber: regNo,   
            status: 'Pending',
            brcDocument: data.brcFile || null,
            vatDocument: data.vatFile || null,
            billingDocument: data.billingFile || null
        });

        await newCustomer.save();

        console.log(`✅ New Base64 Registration: ${regNo}`); 
        
        res.status(201).json({ 
            message: "Customer registered successfully! Admin approval pending.",
            regNumber: regNo 
        });

    } catch (error) {
        console.error("❌ Registration Error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});   


// Get Customer Details by Email
router.get('/user-details/:email', async (req, res) => {
       try {
        const userEmail = req.params.email;
        const updatedData = req.body; // Frontend එකෙන් එවන අලුත් දත්ත

        const updatedUser = await Customer.findOneAndUpdate(
            { officialEmail: userEmail },
            { $set: updatedData },
            { new: true } 
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "Update failed" });
    }
});

//photo upload route
router.post('/upload-photo', upload.single('image'), async (req, res) => {
     try {
        const { email, role } = req.body;
        const imageUrl = req.file.path; 

        if (role === 'admin') {
            await Admin.findOneAndUpdate({ email }, { profilePic: imageUrl });
        } else {
            await Customer.findOneAndUpdate({ officialEmail: email }, { profilePic: imageUrl });
        }

        res.status(200).json({ imageUrl });
    } catch (error) {
        console.error("Cloudinary Error:", error);
        res.status(500).json({ error: "Upload failed" });
    }
});

//delete photo route
router.post('/delete-photo', async (req, res) => {
  try {
        const { email, role } = req.body;
        if (role === 'admin') {
            await Admin.findOneAndUpdate({ email }, { profilePic: '' });
        } else {
            await Customer.findOneAndUpdate({ officialEmail: email }, { profilePic: '' });
        }
        res.status(200).json({ message: "Photo deleted" });
    } catch (error) {
        res.status(500).json({ error: "Delete failed" });
    }
});

//profilwe update route
router.get('/users/profile/:email', async (req, res) => {
try {
        const { email } = req.params;
        const user = await Customer.findOne({ officialEmail: email }); 

        if (!user) {
            console.log("User not found for email:", email);
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            orgRole: user.orgRole || "Not Assigned",
            companyName: user.companyName || "N/A"
        });
    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


//products route
router.post('/products/register', async (req, res) => {
    try {
        const productData = req.body;
        const newProduct = new Product(productData);
        await newProduct.save();

        console.log("✅ New Product Registered:", newProduct._id);
        res.status(201).json({ 
            success: true, 
            message: 'Product Registered Successfully!',
            productId: newProduct._id 
        });
    } catch (error) {
        console.error("❌ Registration Error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

export default router;    