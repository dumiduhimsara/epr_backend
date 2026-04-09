import jwt from 'jsonwebtoken';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import SibApiV3Sdk from 'sib-api-v3-sdk';
import PDFDocument from 'pdfkit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// --- (IMPORT models) ---
import Admin from './models/Admin.js';
import Customer from './models/Customer.js';
import Order from './models/Order.js';
import CoPartner from './models/CoPartner.js';
import Counter from './models/Counter.js';
import QRBatch from './models/QRBatch.js';
import QRRegistration from './models/QRRegistration.js';
import RecycleRequest from './models/RecycleRequest.js';
import Feedback from './models/Feedback.js';
import Product from './models/Product.js';
import QRCompany from './models/QRCompany.js';
import QRProduct from './models/QRProduct.js';

// --- (IMPORT ROUTES) ---
import authRoutes from './src/routes/authRoutes.js';
import customerRoutes from './src/routes/customerRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import qrRoutes from './src/routes/qrRoutes.js';
import partnerRoutes from './src/routes/partnerRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- 1. MIDDLEWARES ---
app.use(cors({
    origin: [
        'https://dumidu.vercel.app', 
        'http://localhost:5173', 
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 2. STATIC FILES & DIRECTORIES ---
const docDir = './documents';
if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
    console.log("✅ Created 'documents' directory automatically!");
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));
app.use('/invoices', express.static(path.join(__dirname, 'invoices')));
app.use('/qr-images', express.static(path.join(__dirname, 'qr-images'))); 

// --- 3. DATABASE CONNECTION ---
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://dumidu:su123@cluster0.zkbmh7n.mongodb.net/epr_portal?retryWrites=true&w=majority&family=4';

mongoose.connect(mongoURI)
  .then(() => {
    console.log("✅ Database Connected Successfully!");
  })
  .catch((err) => {
    console.log("❌ DB Connection Error Details:");
    console.error(err.message);
  });

// --- 4. JWT & AUTH MIDDLEWARE ---
const JWT_SECRET = process.env.JWT_SECRET; 
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
    process.exit(1);
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ error: "Access Denied. No session found." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Your session has expired. Please login again." });
        req.user = user; 
        next();
    });
};

// --- 5. OTP STORE ---
let otpStore = {}; 
export { otpStore };

// --- 6. BREVO EMAIL CONFIGURATION ---
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY; 

export const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

export const sendEmail = async (email, otp) => {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = "OTP Code - EPR System";
    sendSmtpEmail.htmlContent = `<html><body><h3>Your OTP code is: <b>${otp}</b></h3><p>This code will expire in 5 minutes.</p></body></html>`;
    sendSmtpEmail.sender = { "name": "EPR Admin", "email": "email02emaileeee@gmail.com" }; 
    sendSmtpEmail.to = [{ "email": email }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`✅ Email sent successfully to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Brevo API Error:', error);
        return false;
    }
};

// --- 7. ROUTES ---
app.get('/', (req, res) => {
    res.status(200).send("✅ EPR Backend is Live and Running!");
});

app.use('/api/auth', authRoutes);         
//app.post('/api/customers/register', customerRoutes); 
app.use('/api/customers', customerRoutes);
app.use('/api/orders', authenticateToken, orderRoutes);     
app.use('/api/qr', qrRoutes);             
app.use('/api/partners', partnerRoutes);   
app.use('/api/admin', adminRoutes);

// --- 8. START SERVER ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});