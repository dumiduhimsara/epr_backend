import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../../models/Admin.js';
import Customer from '../../models/Customer.js';
import CoPartner from '../../models/CoPartner.js';
import Counter from '../../models/Counter.js';
//import { sendEmail } from '../utils/email.js';
import { sendEmail } from '../../index.js';

const router = express.Router();
let otpStore = {}; 
const JWT_SECRET = process.env.JWT_SECRET || 'EPR_SUPER_SECRET_2026';

//logging route
router.post('/login', async (req, res) => {
     try {
        const { email, password } = req.body;
        
        let user = await Admin.findOne({ email });
        let role = 'ADMIN';

        if (!user) {
            user = await Customer.findOne({ officialEmail: email });
            role = 'CUSTOMER';
        }

        if (!user) {
            user = await CoPartner.findOne({ email: email.trim() });
            role = 'PARTNER';
        }

        if (!user) return res.status(400).json({ error: "User not found!" });

        if (role === 'CUSTOMER' && user.status !== 'Approved') {
            return res.status(403).json({ 
                error: "Your account is pending approval. Please wait for the admin's confirmation email." 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials!" });

        const token = jwt.sign(
            { id: user._id, role: role }, 
           JWT_SECRET,
            { expiresIn: '1d' } 
        );

        res.status(200).json({ 
            message: "Login Successful",
            token: token, 
            role: role,
            user: { 
                fullName: user.fullName || user.contactPersonName || user.name, 
                email: user.email || user.officialEmail, 
                profilePic: user.profilePic || null,
                coPartnerId: user.coPartnerId || null,
                regNumber: user.regNumber || null,
                adminRole: user.adminRole
                
            } 
        });
    } catch (error) {
        res.status(500).json({ error: "Server error during login" });
    }
});

// Admin Register
router.post('/admin/register', async (req, res) => {
     try {
        const { fullName, email, adminSecretCode, password } = req.body;
        const exists1 = await Admin.findOne({ email: email });
        const exists2 = await Customer.findOne({ officialEmail: email }); 
        const exists3 = await CoPartner.findOne({ email: email });

        if (exists1 || exists2 || exists3) {
            return res.status(400).json({ error: "This email is already registered in our system!" });
        }
        const SYSTEM_SECRET_CODE = "EPR@2024"; 

        if (adminSecretCode !== SYSTEM_SECRET_CODE) {
            console.log("❌ Invalid Secret Code Attempted!"); 
            return res.status(401).json({ error: "Unauthorized! Invalid Admin Secret Code." });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newAdmin = new Admin({ fullName, email, adminSecretCode, password: hashedPassword });
        await newAdmin.save();
        
        res.status(201).json({ message: "Admin registered successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Registration failed" });
    }
});


// Forgot & Reset Password
router.post('/customers/forgot-password', async (req, res) => {
     const { email } = req.body;
    const lowerEmail = email.toLowerCase().trim(); 

    try {
        let user = await Admin.findOne({ email: lowerEmail });
        if (!user) {
            user = await Customer.findOne({ officialEmail: lowerEmail });
        }

        if (!user) {
            return res.status(404).json({ error: "Email address not found!" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[lowerEmail] = { 
     otp: otp, 
    expires: Date.now() + 300000 
};

await sendEmail(lowerEmail, otp);

        res.json({ message: "OTP has been sent to your email!" });
} catch (err) {
        console.log("❌ FULL ERROR DETAILS:", err); 
        res.status(500).json({ 
            error: "Failed to send email!", 
            debug_message: err.message,
            stack: err.stack 
        });
    }
});

//customer reset password
router.post('/customers/reset-password', async (req, res) => {
     const { email, newPassword } = req.body;
    const lowerEmail = email.toLowerCase().trim();
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        let user = await Admin.findOneAndUpdate(
            { email: lowerEmail }, 
            { password: hashedPassword }
        );

        if (!user) {
            user = await Customer.findOneAndUpdate(
                { officialEmail: lowerEmail }, 
                { password: hashedPassword }
            );
        }

        if (!user) {
            return res.status(404).json({ error: "User not found!" });
        }
        
        delete otpStore[lowerEmail]; 
        res.json({ success: true, message: "Password updated successfully!" });

    } catch (err) {
        res.status(500).json({ error: "Failed to update password!" });
    }
});



//customer verify OTP
router.post('/customers/verify-otp', (req, res) => {
     const { email, otp } = req.body;
    const lowerEmail = email.toLowerCase().trim();
    const data = otpStore[lowerEmail];

    if (data && data.otp.toString() === otp.toString() && data.expires > Date.now()) {
        res.json({ success: true, message: "OTP verified! Now you can set a new password." });
    } else {
        res.status(400).json({ success: false, error: "Invalid or expired OTP!" });
    }
});

export default router;