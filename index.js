import jwt from 'jsonwebtoken';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import SibApiV3Sdk from 'sib-api-v3-sdk';
import PDFDocument from 'pdfkit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({
  origin: [
        'https://dumidu.vercel.app', 
        'http://localhost:5173', 
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

const docDir = './documents';
if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
    console.log("✅ Created 'documents' directory automatically!");
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));


app.get('/', (req, res) => {
    res.status(200).send("✅ EPR Backend is Live and Running!");
});
//................................................................................................................

// 🚨 මේක තමයි ටෝකන් එකේ ආරක්ෂාව තහවුරු කරන රහස් කෝඩ් එක (Secret Key)
const JWT_SECRET = process.env.JWT_SECRET; 

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
    process.exit(1);
}
// 🛡️ Authentication Middleware..................................................................................................
// මේකෙන් තමයි ඉදිරියට හැම පේජ් එකකදීම ටෝකන් එක ඇත්තද කියලා චෙක් කරන්නේ
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ error: "Access Denied. No session found." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Your session has expired. Please login again." });
        }
        req.user = user; 
        next();
    });
};

// 4. Static Folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/invoices', express.static(path.join(__dirname, 'invoices')));
app.use('/qr-images', express.static(path.join(__dirname, 'qr-images')));

// --- ඊළඟට ඔයාගේ MongoDB Connection එක ---
// මේ විදිහට කෝඩ් එක අප්ඩේට් කරන්න
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://dumidu:su123@cluster0.zkbmh7n.mongodb.net/epr_portal?retryWrites=true&w=majority&family=4';

// 2. Connection එක මේ විදිහට ලියන්න
mongoose.connect(mongoURI)
  .then(() => {
    console.log("✅ Database Connected Successfully!");
  })
  .catch((err) => {
    console.log("❌ DB Connection Error Details:");
    console.error(err.message);
  });


let otpStore = {}; 

// Brevo API Configuration
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY; 

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// ඊමේල් යවන පොදු Function එක
const sendEmail = async (email, otp) => {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = "OTP Code - EPR System";
    sendSmtpEmail.htmlContent = `<html><body><h3>Your OTP code is: <b>${otp}</b></h3><p>This code will expire in 5 minutes.</p></body></html>`;
    sendSmtpEmail.sender = { "name": "EPR Admin", "email": "email02emaileeee@gmail.com" }; // ඔයා Verify කරපු email එක
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


// --- uploadcloudinary STORAGE SETUP ---.................................................................................................
cloudinary.config({
  cloud_name: 'de2uxpvdz',
  api_key: '362669515799133',
  api_secret: 'BitZ3Bk0EqyFGocmYuwE1nP1gBw'
});

// --- PROFILE PICTURE STORAGE --------------------------------------------------------------------------------------------
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'user_profiles',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        public_id: (req, file) => 'profile-' + Date.now(),
    },
});

const upload = multer({ storage }); 

// --- 1. INVOICE CLOUDINARY STORAGE SETUP ---------------------------------------------------------------------------------
const invoiceCloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'invoices', 
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'], 
        public_id: (req, file) => 'inv-' + Date.now(),
    },
});

const uploadInvoice = multer({ storage: invoiceCloudinaryStorage });


// --- 2. DOCUMENTS (BRC/VAT/BILLING) CLOUDINARY STORAGE SETUP ---------------------------------------------------------------
const docCloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'customer_documents', 
        allowed_formats: ['pdf', 'jpg', 'png', 'jpeg'],
        // ❌ resource_type: 'auto' වෙනුවට පල්ලෙහා තියෙන එකම දාන්න
        resource_type: 'raw', // 🔥 PDF වලට resource_type එක අනිවාර්යයෙන්ම 'raw' විය යුතුයි
        type: 'upload',
        access_mode: 'public', 
        public_id: (req, file) => 'DOC-' + Date.now() + '-' + file.originalname.split('.')[0],
    },
});
const uploadDocs = multer({ storage: docCloudinaryStorage });
const cpUpload = uploadDocs.fields([
    { name: 'brc', maxCount: 1 },
    { name: 'vat', maxCount: 1 },
    { name: 'billing', maxCount: 1 }
]);

// --- 3. ZIP FILES CLOUDINARY STORAGE SETUP ---------------------------------------------------------------------------
const zipCloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'qr_zips', 
        resource_type: 'raw', 
        public_id: (req, file) => 'ZIP-' + Date.now() + '-' + file.originalname.split('.')[0],
    },
});

const uploadZip = multer({ storage: zipCloudinaryStorage });
//................................................................................................................................
// --- (SCHEMAS) ---
// Company Schema (QR Management)
const qrCompanySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const QRCompany = mongoose.model('QRCompany', qrCompanySchema);


// Product Schema (QR Management)
const qrProductSchema = new mongoose.Schema({
    category: { type: String, required: true },
    brand: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const QRProduct = mongoose.model('QRProduct', qrProductSchema);


//admin schema
const adminSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    adminSecretCode: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    adminRole: { type: String, default: 'Admin' }
});
const Admin = mongoose.model('Admin', adminSchema);


// Counter schema
const counterSchema = new mongoose.Schema({
    id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);


//customer schema
const customerSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    orgRole: { type: String, required: true },
    companyWebsite: { type: String }, 
    phone: { type: String, required: true },
    whatsapp: { type: String },
    officialEmail: { type: String, required: true, unique: true },
    address1: { type: String },
    address2: { type: String },
    postalCode: { type: String },
    country: { type: String },
    contactPersonName: { type: String, required: true },
    contactPersonMobile: { type: String, required: true },
    dob: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' },
    status: { type: String, default: 'Pending' }, 
    regNumber: { type: String, unique: true },    
    registeredAt: { type: Date, default: Date.now },
    brcDocument: { type: String, default: '' },
    vatDocument: { type: String, default: '' },
    billingDocument: { type: String, default: '' },

    verificationDocs: { 
        type: [String], 
        default: [] 
    }
});
const Customer = mongoose.model('Customer', customerSchema);


// Order Schema (qrZipFile)
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
    qrZipFile: { type: String, default: null } 
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);



const qrBatchSchema = new mongoose.Schema({
    qrId: { type: String, required: true, unique: true },
    company: String,
    brand: String,
    product: String,
    serialNumber: String,
    mfd: String,
    createdAt: { type: Date, default: Date.now }
});
const QRBatch = mongoose.model('QRBatch', qrBatchSchema);


// QR REGISTRATION SCHEMA
const qrRegistrationSchema = new mongoose.Schema({
    cuSerial: String,
    cuName: String,
    cuPhone: String,
    cuAddress: String,
    cuCompany: String,
    cuProduct: String,
    cuBrand: String,
    cuDate: { type: Date, default: Date.now }
});
const QRRegistration = mongoose.model('QRRegistration', qrRegistrationSchema);


// CO-PARTNER SCHEMA 
const coPartnerSchema = new mongoose.Schema({
    coPartnerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
phone: { type: String, required: true },
    nic: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    district: { type: String, required: true },
    pradeshiyaSabha: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const CoPartner = mongoose.model('CoPartner', coPartnerSchema);


// RECYCLE REQUEST SCHEMA
const recycleRequestSchema = new mongoose.Schema({
    qrId: { type: String, required: true },
    cuName: String,
    cuPhone: String,
    cuAddress: String,
    cuCompany: String,
    cuProduct: String,
    cuBrand: String,
    status: { type: String, default: 'Pending' }, 
    registeredAt: { type: Date },                 
    requestedAt: { type: Date, default: Date.now },
    collectedAt: { type: Date,default: null },                   
    collectedBy: { type: String, default: null },    
    cpId: { type: String, default: null },
    cpNum: { type: String, default: '' }          
});
const RecycleRequest = mongoose.model('RecycleRequest', recycleRequestSchema);


//FEEDBACK SCHEMA
const feedbackSchema = new mongoose.Schema({
    user: { type: String, required: true },       
    officialEmail: { type: String },              
    rating: { type: Number, required: true, min: 1, max: 5 }, 
    text: { type: String, required: true },       
    reply: { type: String, default: "" },         
    date: { type: Date, default: Date.now }      
});
const Feedback = mongoose.model('Feedback', feedbackSchema);


// PRODUCT REGISTRATION MODEL
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
const Product = mongoose.model('Product', productSchema);


//...................................................................................................................

// --- (ROUTES) ---
// --- FEEDBACK API ROUTES ---
app.get('/api/feedbacks', async (req, res) => {
    try {
        const feedbacks = await Feedback.find().sort({ date: -1 });
        res.status(200).json(feedbacks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Feedback  (Create)
app.post('/api/feedbacks', async (req, res) => {
    try {
        const newFeedback = new Feedback(req.body);
        await newFeedback.save();
        res.status(201).json(newFeedback);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Feedback  (Update)
app.put('/api/feedbacks/:id', async (req, res) => {
    try {
        const updated = await Feedback.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Feedback (Delete)
app.delete('/api/feedbacks/:id', async (req, res) => {
    try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Feedback deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
//............................................................................................................................

//admin register
app.post('/api/admin/register', async (req, res) => {
    try {
        const { fullName, email, adminSecretCode, password } = req.body;

              // --- 🛡️ EMAIL CROSS-CHECK (අකුරක්වත් වෙනස් නොකර) ---
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

//customer registration
app.post('/api/customers/register', cpUpload, async (req, res) => {
try {
        const data = req.body;

      const checkEmail = data.officialEmail; 

        const exists1 = await Admin.findOne({ email: checkEmail });
        const exists2 = await Customer.findOne({ officialEmail: checkEmail }); 
        const exists3 = await CoPartner.findOne({ email: checkEmail });

        if (exists1 || exists2 || exists3) {
            return res.status(400).json({ error: "This email is already registered in our system!" });
        }

        const brcPath = req.files['brc'] ? req.files['brc'][0].path : null;
        const vatPath = req.files['vat'] ? req.files['vat'][0].path : null;
        const billingPath = req.files['billing'] ? req.files['billing'][0].path : null;

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
            brcDocument: brcPath,
            vatDocument: vatPath,
            billingDocument: billingPath
        });

        await newCustomer.save();

        console.log(`✅ New Registration: ${regNo}`); 
        
        res.status(201).json({ 
            message: "Customer registered successfully! Admin approval pending.",
            regNumber: regNo 
        });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});


// UNIFIED LOGIN (Admin, Customer & Partner) login
app.post('/api/login', async (req, res) => {
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
           // process.env.JWT_SECRET || 'EPR_SUPER_SECRET_2026', 
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


//customer forgot password
app.post('/api/customers/forgot-password', async (req, res) => {
    const { email } = req.body;
    const lowerEmail = email.toLowerCase().trim(); // Email එක පිරිසිදු කරගන්නවා

    try {
        let user = await Admin.findOne({ email: lowerEmail });
        if (!user) {
            user = await Customer.findOne({ officialEmail: lowerEmail });
        }

        if (!user) {
            return res.status(404).json({ error: "Email address not found!" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        otpStore[lowerEmail] = { otp, expires: Date.now() + 300000 }; 

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


//customer verify OTP
app.post('/api/customers/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const lowerEmail = email.toLowerCase().trim();
    const data = otpStore[lowerEmail];

    if (data && data.otp.toString() === otp.toString() && data.expires > Date.now()) {
        res.json({ success: true, message: "OTP verified! Now you can set a new password." });
    } else {
        res.status(400).json({ success: false, error: "Invalid or expired OTP!" });
    }
});

//customer reset password
app.post('/api/customers/reset-password', async (req, res) => {
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


//partner confirm collection
app.post('/api/partner/confirm-collection', async (req, res) => {
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
//..............................................................................................................................


// Photo Upload

// Photo Upload (Cloudinary Version)
app.post('/api/upload-photo', upload.single('image'), async (req, res) => {
    try {
        const { email, role } = req.body;
        
        // 🚨 පරණ baseUrl සහ imageUrl පේළි දෙකම අයින් කරන්න.
        // 🔥 දැන් Cloudinary පාවිච්චි කරද්දී req.file.path එකේ එන්නේ සම්පූර්ණ URL එකයි.
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


//  Photo Delete
app.post('/api/delete-photo', async (req, res) => {
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




// --- ලොග් වෙලා ඉන්න යූසර්ගේ දත්ත ලබාගැනීමේ API එක .
app.get('/api/user-details/:email', async (req, res) => {
    try {

        const userEmail = req.params.email;
        
        const user = await Customer.findOne({ officialEmail: userEmail });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const { password, ...userData } = user._doc;
        
        res.status(200).json({ user: userData });
    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});





// යූසර්ගේ දත්ත Update කරන API එක
app.put('/api/user-details/update/:email', async (req, res) => {
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



// 6. Get All Users
app.get('/api/users/all', async (req, res) => {
    try {
        const admins = await Admin.find().select('-password');
        const customers = await Customer.find().select('-password');
        res.status(200).json({ admins, customers });
    } catch (error) {
        res.status(500).json({ error: "Fetching failed" });
    }
});

//user detils pennanan 
app.get('/api/users/profile/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        // 🚨 වැදගත්: Database එකේ තියෙන්නේ 'officialEmail' නිසා මෙහෙම හොයන්න
        const user = await Customer.findOne({ officialEmail: email }); 

        if (!user) {
            console.log("User not found for email:", email);
            return res.status(404).json({ message: "User not found" });
        }

        // Database එකේ තියෙන අකුරු වලටම (orgRole, companyName) මෙතනින් යවනවා
        res.status(200).json({
            orgRole: user.orgRole || "Not Assigned",
            companyName: user.companyName || "N/A"
        });
    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/orders/user/:email/:division', async (req, res) => {
    try {
        const { email, division } = req.params;
        
        // දෙපැත්තෙම අකුරු small කරලා සසඳන්න (Case-insensitive search)
        const orders = await Order.find({ 
            officialEmail: email.toLowerCase(), 
            division: division 
        }).sort({ _id: -1 }); // createdAt නැතිනම් _id එකෙන් sort කරන්න පුළුවන්

        res.status(200).json(orders);
    } catch (error) {
        console.error("Order Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch order history" });
    }
});

// --- මෙතනින් පල්ලෙහා මම අලුතින් ඇතුළත් කළා (Delete Routes) 
// 7. Delete Admin
app.delete('/api/admin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Admin.findByIdAndDelete(id);
        res.status(200).json({ message: "Admin deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete admin" });
    }
});

// 8. Delete Customer
app.delete('/api/customer/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Customer.findByIdAndDelete(id);
        res.status(200).json({ message: "Customer deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete customer" });
    }
});

// 9. Create Order with Invoice PDF (Updated with officialEmail)
app.post('/api/orders/create', uploadInvoice.single('invoice'), async (req, res) => {
    try {
        // 1. req.body එකෙන් සියලුම දත්ත ලබා ගැනීම
        const { invNum, company, role, division, orderType, officialEmail } = req.body;
        
        const newOrder = new Order({
            invNum,
            company,
            role,
            division,  
            orderType,
            officialEmail: officialEmail, // User ගේ email එක save කිරීම
            invoiceFile: req.file ? req.file.filename : '',
            
            // 2. 🔥 Date සහ Time එකතු කිරීම
            createdAt: new Date() 
        });

        // 3. Database එකට save කිරීම
        await newOrder.save();

        // 4. සාර්ථක පණිවිඩය සහ අලුත් order එකේ දත්ත යැවීම
        res.status(201).json({ 
            message: "Order placed successfully!", 
            order: newOrder 
        });

    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).json({ error: "Order failed to save" });
    }
});
// 10. Get All Orders
app.get('/api/orders/all', async (req, res) => {
    try {
        const orders = await Order.find().sort({ _id: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Fetching orders failed" });
    }
});
//.........................................................................................


// 12. Register Company (QR Management)
app.post('/api/add-company', async (req, res) => {
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

// 13. Get All Companies
app.get('/api/get-companies', async (req, res) => {
    try {
        const companies = await QRCompany.find().sort({ createdAt: -1 });
        res.status(200).json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch companies" });
    }
});

// 📍 Dashboard එකේ Top 5 පෙන්වන්න විතරක් පාවිච්චි කරන අලුත් API එක
app.get('/api/dashboard/top-companies', async (req, res) => {
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

// 14. Delete Company
app.delete('/api/delete-company/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await QRCompany.findByIdAndDelete(id);
        res.status(200).json({ message: "Company deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete company" });
    }
});
//..........................................................................................
// 15. Add Product (QR Management)
app.post('/api/add-product', async (req, res) => {
    try {
        const { category, brand } = req.body;
        const newProduct = new QRProduct({ category, brand });
        await newProduct.save();
        res.status(201).json({ message: "Product saved successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save product" });
    }
});

// 16. Get All Products
app.get('/api/get-products', async (req, res) => {
    try {
        const products = await QRProduct.find().sort({ createdAt: -1 });
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// 17. Delete Product
app.delete('/api/delete-product/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await QRProduct.findByIdAndDelete(id);
        res.status(200).json({ message: "Product deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete product" });
    }
});



// 18. Add New Co-Partner (Auto-Generate ID version)
app.post('/api/partners/register', async (req, res) => {
    try {

        const checkEmail = req.body.email;

        const exists1 = await Admin.findOne({ email: checkEmail });
        const exists2 = await Customer.findOne({ officialEmail: checkEmail }); // Schema එකේ නම officialEmail නිසා
        const exists3 = await CoPartner.findOne({ email: checkEmail });

        if (exists1 || exists2 || exists3) {
            return res.status(400).json({ error: "This email is already registered in our system!" });
        }
        const { password } = req.body;

        // 1. අන්තිමටම register වුණු partner ව හොයාගන්න (ID එක generate කරන්න)
        const lastPartner = await CoPartner.findOne().sort({ createdAt: -1 });
        
        let newIdNumber = 1;
        if (lastPartner && lastPartner.coPartnerId) {
            // උදා: "CP005" නම්, එකෙන් "005" අරන් number එකක් කරනවා
            const lastIdStr = lastPartner.coPartnerId.replace('CP', ''); 
            newIdNumber = parseInt(lastIdStr) + 1;
        }

        // 2. අලුත් ID එක හදනවා (උදා: CP001, CP010, CP100 වගේ ලස්සනට pad කරනවා)
        const generatedId = `CP${newIdNumber.toString().padStart(3, '0')}`;

        // 3. Password එක Hash කිරීම
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // 4. අලුත් දත්ත සමඟ Save කිරීම (req.body එකේ එන coPartnerId එක අපි generate කරපු එකෙන් replace කරනවා)
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




// 19. Get All Co-Partners
app.get('/api/partners/all', async (req, res) => {
    try {
        const partners = await CoPartner.find().sort({ createdAt: -1 });
        res.status(200).json(partners);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch partners" });
    }
});

// 20. Update Co-Partner (NIC and Email are protected by Frontend logic)
app.put('/api/partners/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // 1. කලින් database එකේ ඉන්න partner ගේ දත්ත ගන්න
        const existingPartner = await CoPartner.findById(id);
        if (!existingPartner) {
            return res.status(404).json({ error: "Partner not found" });
        }

        // 2. Password එකක් එවලා තියෙනවා නම් පමණක් පරීක්ෂා කරන්න
        if (updateData.password) {
            // එවපු password එක දැනට database එකේ තියෙන (hashed) password එකට සමානද බලන්න
            // සමාන නම් ඒ කියන්නේ password එක වෙනස් කරලා නැහැ
            if (updateData.password === existingPartner.password) {
                // වෙනස් කරලා නැති නිසා updateData එකෙන් password එක අයින් කරනවා
                // එවිට පරණ එකම database එකේ ඉතුරු වේවි
                delete updateData.password;
            } else {
                // Password එක අලුත් එකක් නම් (Plain text එකක් නම්) පමණක් hash කරන්න
                const salt = await bcrypt.genSalt(10);
                updateData.password = await bcrypt.hash(updateData.password, salt);
            }
        } else {
            // Request එකේ password එකක් එවලාම නැත්නම් ඒක අයින් කරන්න
            delete updateData.password;
        }

        // 3. දැන් Update එක සිදු කරන්න
        await CoPartner.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        
        res.status(200).json({ message: "Partner updated successfully!" });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "Failed to update partner" });
    }
});

// 21. Delete Co-Partner
app.delete('/api/partners/delete/:id', async (req, res) => {
    try {
        await CoPartner.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Partner deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete partner" });
    }
});

// 22. Get All Registered QR Users
app.get('/api/qr-registrations/all', async (req, res) => {
    try {
        const registrations = await QRRegistration.find({}).sort({ cuDate: -1 });
        res.status(200).json(registrations);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch registrations" });
    }
});



// Get All Recycle Requests for Admin
app.get('/api/recycle-requests/all', async (req, res) => {
  try {
    const requests = await RecycleRequest.find()
      .sort({ requestedAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch recycle requests" });
  }
});



// index.js ඇතුළත Co-Partner Dashboard API එක මෙහෙම වෙන්න ඕනේ

app.get('/api/co-partner/dashboard', async (req, res) => {
    try {
        // ලියාපදිංචි වූ මුළු QR ගණන (Registered QR Count)
        const totalRegistered = await QRRegistration.countDocuments();

        // Recycle requests stats
        const pending = await RecycleRequest.countDocuments({ status: 'Pending' });
        const collected = await RecycleRequest.countDocuments({ status: 'Collected' });
        
        // මේකෙන් තමයි Frontend එකේ "Recent Collected" table එකට data යන්නේ
     const recentCollected = await RecycleRequest.find().sort({ requestedAt: -1 }).limit(10);
          

        res.json({
            success: true,
            totalQR: totalRegistered, // මෙතනින් තමයි dashboard එකට count එක යන්නේ
            pending,
            collected,
            recentCollected,
            myCollected: 0 // පසුව partner ID එක අනුව filter කළ හැක
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// 23. Save Generated QR Batch to Database
app.post('/api/save-qr-batch', async (req, res) => {
    try {
        const { batch } = req.body; // Frontend එකෙන් එවපු array එක

        if (!batch || batch.length === 0) {
            return res.status(400).json({ error: "No data provided" });
        }


        await QRBatch.insertMany(batch.map(item => ({
            qrId: item.qrId,
            company: item.company,
            brand: item.brand,
            product: item.product,
            serialNumber: item.serialNumber,
            mfd: item.mfd
        })));

        console.log(`✅ ${batch.length} QR IDs saved to Database.`);
        res.status(200).json({ message: "Batch saved successfully!" });
    } catch (error) {
        console.error("❌ Batch Save Error:", error);
        res.status(500).json({ error: "Failed to save QR batch to database" });
    }});

// --- 24.5 පාරිභෝගිකයා ලියාපදිංචි කිරීම (REGISTER) ---
app.post('/api/save-registration', async (req, res) => {
    try {
        const { cuSerial, cuName, cuPhone, cuAddress } = req.body;

// 1. QR එක valid ද කියලා බලන්න
        const isValidQR = await QRBatch.findOne({ qrId: cuSerial });
        if (!isValidQR) {
            return res.status(404).json({ error: "Invalid QR!" });
        }
// 2. මේ QR එක දැනටමත් register වෙලා තියෙනවද කියලා බලන්න
        const alreadyRegistered = await QRRegistration.findOne({ cuSerial });
        if (alreadyRegistered) {
            return res.status(400).json({ 
                error: "මේ QR කේතය දැනටමත් ලියාපදිංචි කර තිබෙනවා!" 
            });
        }

// 3. නව registration එක save කරන්න
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



// --- 24. VERIFICATION API (SCAN කරපු ගමන් ක්‍රියාත්මක වේ) ---
app.post('/api/verify-product', async (req, res) => {
    try {
        const { cuSerial } = req.body;

        // 1. QR එක Batch එකේ තියෙනවද බලනවා
        const isValidQR = await QRBatch.findOne({ qrId: cuSerial });
        if (!isValidQR) {
            return res.status(404).json({ error: "Invalid QR!" });
        }

        // 2. මේ QR එක කලින් Register වෙලාද බලනවා
        const alreadyRegistered = await QRRegistration.findOne({ cuSerial: cuSerial });

        if (alreadyRegistered) {
            // --- අලුත් කොටස: Recycle Request එකක් දාලා තියෙනවද බලනවා ---
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
        remainingTime: remainingMs // ඉතුරු වෙලාව මිලිසෙකන්ඩ් වලින්
    });
                } else {
                    // පැය 48 පැනලා නම් - Reminder එකක් යවන්න පුළුවන් status එක යවනවා
                    return res.status(200).json({ 
                        status: "SHOW_REMINDER", 
                        userData: alreadyRegistered 
                    });
                }
            }

            // කිසිම Recycle Request එකක් දාලා නැති පරණ පාරිභෝගිකයෙක් නම්
            return res.status(200).json({ 
                status: "EXISTING", 
                userData: alreadyRegistered 
            });
        }

        // 3. අලුත් එකක් නම් (Register වෙලාවත් නැති කෙනෙක් නම්)
        res.status(200).json({ 
            status: "NEW", 
            details: isValidQR 
        });

    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});


/// --- 25. RECYCLE REQUEST SAVE ---
app.post('/api/save-recycle-request', async (req, res) => {
    try {
        const { qrId, cuName, cuPhone, cuAddress, cuCompany, cuProduct, cuBrand } = req.body;

        // 1. දැනටමත් Pending Request එකක් තියෙනවද බලනවා
        const existing = await RecycleRequest.findOne({ qrId, status: 'Pending' });
        if (existing) return res.status(400).json({ message: "Request already pending!" });

        // 2. QR එක Register වුණු දත්ත ලබාගන්නවා
        const registration = await QRRegistration.findOne({ cuSerial: qrId });
        if (!registration) {
            return res.status(404).json({ error: "QR registration not found!" });
        }

        // 3. අලුත් Request එක සේව් කරනවා (status එක 'Pending' ලෙස)
        const newRequest = new RecycleRequest({
            qrId,
            cuName,
            cuPhone,
            cuAddress,
            cuCompany,
            cuProduct,
            cuBrand,
            registeredAt: registration.cuDate,
            requestedAt: new Date(),
            status: 'Pending', // මෙතන තමයි වැදගත්ම දේ
            collectedBy: null
        });

        await newRequest.save();
        res.status(201).json({ success: true, message: "Recycle request sent successfully!" });

    } catch (error) {
        console.error("Save Request Error:", error);
        res.status(500).json({ error: "Failed to send request" });
    }
});

        // QR save folder එකට image save කරන API එක (QR Management සඳහා)

app.post('/api/save-qr', async (req, res) => {
    try {
        const { qrId, qrData } = req.body;
        const base64Data = qrData.replace(/^data:image\/png;base64,/, "");
        const folderPath = path.join(__dirname, 'qr-images');
        const filePath = path.join(folderPath, `${qrId}.png`);

        // ෆෝල්ඩර් එක නැත්නම් හදනවා
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        fs.writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) return res.status(500).json({ error: "File write error" });
            res.json({ success: true });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ORDER STATUS UPDATE ROUTE (ADMIN පාවිච්චි කරන එක) ---
app.put('/api/orders/update/:id', async (req, res) => {
    try {
        const { status } = req.body; 
        const orderId = req.params.id;

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { status: status },
            { new: true } // Update වුණු අලුත් record එකම ආපහු එවන්න
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
  

// index.js එකේ path එක update-status විදිහට හදමු
app.put('/api/orders/update-status/:id', async (req, res) => {
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

app.post('/api/orders/upload-zip/:id', uploadZip.single('zipFile'), async(req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded.');

        const orderId = req.params.id;
        const zipPath = req.file.path; 

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { 
                status: 'QR Sent', 
                qrZipFile: zipPath 
            },
            { new: true }
        );
        console.log("✅ Cloudinary ZIP URL Saved:", zipPath);
        res.status(200).json({ message: 'ZIP Uploaded to Cloudinary successfully!', updatedOrder });
    } catch (error) {
        console.error("❌ Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});


// index.js (Backend)
app.post('/api/partner/confirm-collection', async (req, res) => {
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
    // ...
});

// Pending ඉන්න අය විතරක් ගන්න Route එක..........................................................................
app.get('/api/admin/pending-customers', async (req, res) => {
    try {
        // mongoose හරහා කෙලින්ම model එක ලබා ගැනීම (is not defined error එක වැළැක්වීමට)
        const CustomerModel = mongoose.model('Customer');
        const pendingList = await CustomerModel.find({ status: 'Pending' });
        res.status(200).json(pendingList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Dashboard Stats ගන්න Route එක
app.get('/api/admin/customer-stats', async (req, res) => {
    try {
        const CustomerModel = mongoose.model('Customer');
        const total = await CustomerModel.countDocuments();
        const pending = await CustomerModel.countDocuments({ status: 'Pending' });
        const approved = await CustomerModel.countDocuments({ status: 'Approved' });

        res.status(200).json({
            total,
            pending,
            approved
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put('/api/admin/approve-customer/:id', async (req, res) => {
    try {
        const CustomerModel = mongoose.model('Customer');
        const updatedCustomer = await CustomerModel.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        );
        
        if (!updatedCustomer) return res.status(404).json({ error: "Customer not found" });

        // --- 1. PDF Certificate එක Generate කිරීම ---
        const generateCertificateBuffer = (customer) => {
            return new Promise((resolve, reject) => {
                const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
                let buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));

                // Certificate Design එක (Border සහ Text)
                doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(10).stroke('#1a1a1a');
                doc.rect(35, 35, doc.page.width - 70, doc.page.height - 70).lineWidth(2).stroke('#c5a059');

                doc.fillColor('#27ae60').fontSize(50).text('CERTIFICATE', { align: 'center' }).moveDown(0.5);
                doc.fillColor('#555').fontSize(20).text('OF REGISTRATION', { align: 'center', characterSpacing: 2 }).moveDown(1.5);
                
                doc.fillColor('#333').fontSize(18).text('This is to certify that', { align: 'center' }).moveDown(0.5);
                doc.fillColor('#1a1a1a').fontSize(35).text(customer.companyName.toUpperCase(), { align: 'center' }).moveDown(0.5);
                doc.fillColor('#333').fontSize(18).text('is a registered and approved partner of the', { align: 'center' }).moveDown(0.3);
                doc.fillColor('#27ae60').fontSize(22).text('EPR SUSTAINABILITY NETWORK', { align: 'center' }).moveDown(2);

                doc.fontSize(14).fillColor('#333');
                doc.text(`Registration No: ${customer.regNumber}`, 60, 450);
                doc.text(`Approval Date: ${new Date().toLocaleDateString()}`, doc.page.width - 200, 450);

                doc.end();
            });
        };

        const pdfBuffer = await generateCertificateBuffer(updatedCustomer);

        // --- 2. Professional Email එක සමඟ PDF එක Attachment එකක් ලෙස යැවීම ---
        try {
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.subject = `Welcome to EPR System - Account Approved! 🎉 (${updatedCustomer.regNumber})`;
            
            // ඔයාගේ ලස්සන HTML Design එක මෙතන තියෙනවා
            sendSmtpEmail.htmlContent = `
            <!DOCTYPE html>
            <html>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4; padding: 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1a1a1a; border-radius: 15px; overflow: hidden;">
                                <tr>
                                    <td align="center" style="background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%); padding: 40px 20px;">
                                        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">EPR SYSTEM</h1>
                                        <p style="color: #e0e0e0;">Registration Certificate Attached</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 40px 30px; background-color: #ffffff;">
                                        <h2 style="color: #2c3e50;">Congratulations, ${updatedCustomer.contactPersonName}!</h2>
                                        <p style="color: #555;">Your registration for <b>${updatedCustomer.companyName}</b> has been officially approved. We have attached your Official Registration Certificate to this email.</p>
                                        
                                        <div style="background-color: #f9f9f9; border-left: 4px solid #2ecc71; padding: 20px; margin: 30px 0;">
                                            <p style="margin: 0; font-weight: bold;">Login Credentials:</p>
                                            <p><b>Username:</b> ${updatedCustomer.officialEmail}</p>
                                            <p><b>Password:</b> [Your provided password]</p>
                                        </div>

                                        <div align="center">
                                            <a href="https://dumidu.vercel.app" style="background: #2ecc71; color: #ffffff; padding: 15px 35px; text-decoration: none; border-radius: 30px; font-weight: bold;">Login Now</a>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>`;

            sendSmtpEmail.sender = { "name": "EPR Admin", "email": "email02emaileeee@gmail.com" };
            sendSmtpEmail.to = [{ "email": updatedCustomer.officialEmail }];

            // මෙන්න Attachment එක එකතු කරන පේළිය 👈
            sendSmtpEmail.attachment = [{
                "content": pdfBuffer.toString('base64'),
                "name": `Certificate_${updatedCustomer.regNumber}.pdf`,
                "type": "application/pdf"
            }];

            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            console.log(`✅ Professional Approval email with Certificate sent to ${updatedCustomer.officialEmail}`);

        } catch (mailError) {
            console.error("❌ Email Error:", mailError);
        }

        res.status(200).json({ message: "Customer Approved & Certificate Sent!", updatedCustomer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PRODUCT REGISTRATION ROUTE ---
app.post('/api/products/register', async (req, res) => {
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

// index.js එකට මේක දාන්න (නැත්නම් දාලා තියෙනවද බලන්න)
app.get('/api/admin/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});



// 🛠️ API එක හරියටම මේ විදිහට තියෙන්න ඕනේ
app.get('/api/get-all-generated-qrs', async (req, res) => {
    try {
        const allGeneratedQRs = await QRBatch.find({}).sort({ createdAt: -1 });
        const companies = await QRCompany.find({}); 

        const enrichedData = allGeneratedQRs.map(qr => {
            const qrObj = qr.toObject();
            if (!qrObj.registrationId) {
                const foundCompany = companies.find(c => c.name === qrObj.company);
                qrObj.registrationId = foundCompany ? foundCompany.registrationId : "REG-N/A";
            }
            return qrObj;
        });

        res.status(200).json(enrichedData);
    } catch (error) {
        console.error("Error fetching QR log:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server is live on port ${PORT}`);

});


