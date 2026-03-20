import jwt from 'jsonwebtoken';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer'; 
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// 1. Env Config එක (අනිත් හැමදේටම කලින් මේක තියෙන්න ඕනේ)
dotenv.config();

// 2. ES Module වලට __dirname හදාගන්න එක
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


// 3. Middlewares
app.use(express.json());
app.use(cors());

// index.js (Backend)

// 🚨 මේක තමයි ටෝකන් එකේ ආරක්ෂාව තහවුරු කරන රහස් කෝඩ් එක (Secret Key)
const JWT_SECRET = process.env.JWT_SECRET || 'EPR_PORTAL_SECURE_2024_@#$';

// 🛡️ Authentication Middleware
// මේකෙන් තමයි ඉදිරියට හැම පේජ් එකකදීම ටෝකන් එක ඇත්තද කියලා චෙක් කරන්නේ
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Header එකෙන් Token එක වෙන් කරගන්නවා

    if (!token) {
        return res.status(401).json({ error: "Access Denied. No session found." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Your session has expired. Please login again." });
        }
        req.user = user; // ටෝකන් එකේ තියෙන විස්තර Request එකට දානවා
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


// --- EMAIL CONFIGURATION (මෙන්න මේකයි Transporter එක) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

let otpStore = {}; // OTP තාවකාලිකව මතක තියාගන්න මේකත් ඕනේ.............................ok


// --- MULTER STORAGE SETUP ---
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });
const invoiceStorage = multer.diskStorage({
    destination: './invoices/',
    filename: (req, file, cb) => {
        cb(null, 'inv-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadInvoice = multer({ storage: invoiceStorage });

// --- SCHEMAS ---

// Company Schema (QR Management සඳහා)
const qrCompanySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});
// මෙන්න මේ පේළිය අනිවාර්යයි
const QRCompany = mongoose.model('QRCompany', qrCompanySchema);

// Product Schema (QR Management සඳහා)
const qrProductSchema = new mongoose.Schema({
    category: { type: String, required: true },
    brand: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
// මෙන්න මේ පේළියත් අනිවාර්යයි
const QRProduct = mongoose.model('QRProduct', qrProductSchema);


const adminSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    adminSecretCode: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: '' }
});
const Admin = mongoose.model('Admin', adminSchema);


//............................................................................................................................
// 1. අංක පිළිවෙළට තියාගන්න Counter Model එක
const counterSchema = new mongoose.Schema({
    id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

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
    status: { type: String, default: 'Pending' }, // Admin approve කරනකම් Pending
    regNumber: { type: String, unique: true },    // EPR-2026-0000001 වගේ අංකය
    registeredAt: { type: Date, default: Date.now }
});
const Customer = mongoose.model('Customer', customerSchema);


// 1. Order Schema එක (qrZipFile එකත් එක්ක)
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

// 2. Model එක (මෙතන 'export' කියන වචනය අයින් කරලා තියෙන්නේ)
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

// --- QR REGISTRATION SCHEMA---

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


// --- CO-PARTNER SCHEMA ---
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


// --- RECYCLE REQUEST SCHEMA ---
const recycleRequestSchema = new mongoose.Schema({
    qrId: { type: String, required: true },
    cuName: String,
    cuPhone: String,
    cuAddress: String,
    cuCompany: String,
    cuProduct: String,
    cuBrand: String,
    status: { type: String, default: 'Pending' }, // Pending, Collected
    registeredAt: { type: Date },                 // මුලින්ම Register වුණු දිනය
    requestedAt: { type: Date, default: Date.now }, // Recycle Request එක දාපු දිනය
    collectedAt: { type: Date,default: null },                   // Co-partner එකතු කරපු දිනය
    collectedBy: { type: String, default: null },    // Co-partner ගේ නම
    cpId: { type: String, default: null },
    cpNum: { type: String, default: '' }           // Co-partner ගේ ෆෝන් නම්බර් එක
});
const RecycleRequest = mongoose.model('RecycleRequest', recycleRequestSchema);

//...........................................................................................
// --- ROUTES ---

app.post('/api/admin/register', async (req, res) => {
    try {
        const { fullName, email, adminSecretCode, password } = req.body;

        // --- 🔴 මෙන්න මේ කෑල්ල තමයි වැදගත්ම 🔴 ---
        const SYSTEM_SECRET_CODE = "EPR@2024"; // ඔයා කැමති කෝඩ් එක මෙතන තියෙන්න ඕනේ

        if (adminSecretCode !== SYSTEM_SECRET_CODE) {
            console.log("❌ Invalid Secret Code Attempted!"); // Backend එකේ වැටෙනවා බලන්න
            return res.status(401).json({ error: "Unauthorized! Invalid Admin Secret Code." });
        }
        // ------------------------------------------

        // මීට පල්ලෙහායින් තමයි අනිත් ටික එන්න ඕනේ (Bcrypt, Save, etc.)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newAdmin = new Admin({ fullName, email, adminSecretCode, password: hashedPassword });
        await newAdmin.save();
        
        res.status(201).json({ message: "Admin registered successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Registration failed" });
    }
});



// --- 2. UNIFIED LOGIN (Admin, Customer & Partner) ---.................................................................
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
            process.env.JWT_SECRET || 'EPR_SUPER_SECRET_2026', 
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
                regNumber: user.regNumber || null
                
            } 
        });
    } catch (error) {
        res.status(500).json({ error: "Server error during login" });
    }
});
//...........................................................................................................................

app.post('/api/customers/forgot-password', async (req, res) => {
    const { email } = req.body;
    const lowerEmail = email.toLowerCase().trim(); // Email එක පිරිසිදු කරගන්නවා

    try {
        // Partner ව මෙතන චෙක් කරන්නේ නැහැ, ඒ නිසා එයාට Reset කරන්න බැහැ
        let user = await Admin.findOne({ email: lowerEmail });
        if (!user) {
            user = await Customer.findOne({ officialEmail: lowerEmail });
        }

        if (!user) {
            return res.status(404).json({ error: "Email address not found!" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // OTP එක save කරන්නේ Simple Email එකට
        otpStore[lowerEmail] = { otp, expires: Date.now() + 300000 }; 

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: lowerEmail,
            subject: 'Password Reset OTP',
            text: `Your OTP code is ${otp}. This code will expire in 5 minutes.`
        });

        res.json({ message: "OTP has been sent to your email!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to send email!" });
    }
});


app.post('/api/customers/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const lowerEmail = email.toLowerCase().trim();
    const data = otpStore[lowerEmail];

    // OTP එකයි වෙලාවයි දෙකම බලනවා
    if (data && data.otp.toString() === otp.toString() && data.expires > Date.now()) {
        res.json({ success: true, message: "OTP verified! Now you can set a new password." });
    } else {
        res.status(400).json({ success: false, error: "Invalid or expired OTP!" });
    }
});


app.post('/api/customers/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    const lowerEmail = email.toLowerCase().trim();
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 1. මුලින්ම Admin collection එකේ update කරමු
        let user = await Admin.findOneAndUpdate(
            { email: lowerEmail }, 
            { password: hashedPassword }
        );

        // 2. Admin කෙනෙක් නෙමෙයි නම් Customer collection එකේ update කරමු
        if (!user) {
            user = await Customer.findOneAndUpdate(
                { officialEmail: lowerEmail }, 
                { password: hashedPassword }
            );
        }

        if (!user) {
            return res.status(404).json({ error: "User not found!" });
        }
        
        delete otpStore[lowerEmail]; // පාවිච්චි කරපු OTP එක අයින් කරනවා
        res.json({ success: true, message: "Password updated successfully!" });

    } catch (err) {
        res.status(500).json({ error: "Failed to update password!" });
    }
});

// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////


app.post('/api/partner/confirm-collection', async (req, res) => {
    try {
        // 1. Frontend එකෙන් එවන ඔක්කොම දත්ත ටික මෙතනින් ගන්නවා
        const { qrId, partnerId, partnerName, partnerPhone } = req.body;

        // QR ID එකෙන් අදාළ රික්වෙස්ට් එක හොයාගන්නවා
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

        // 2. Schema එකේ තියෙන පිරිසිදු නම් වලට දත්ත Update කරනවා
        request.status = 'Collected';
        request.collectedBy = partnerName;
        request.cpNum = partnerPhone;       // <--- දැන් ෆෝන් නම්බර් එකත් සේව් වෙනවා (Schema එකේ තියෙන විදිහට)
        request.collectedAt = new Date();   // ස්කෑන් කරපු වෙලාව
        request.cpId = partnerId; 

        // 3. Database එකට Save කරනවා
        await request.save();

        res.json({ 
            success: true, 
            message: `Collection confirmed successfully by ${partnerName}` 
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, error: "Server Error" });
    }
});///////////////////////////////////////////////////////////////////////////////////////////////////////////////



// 3. Photo Upload
app.post('/api/upload-photo', upload.single('image'), async (req, res) => {
    try {
        const { email, role } = req.body;
       
        const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;
        if (role === 'admin') {
            await Admin.findOneAndUpdate({ email }, { profilePic: imageUrl });
        } else {
            await Customer.findOneAndUpdate({ officialEmail: email }, { profilePic: imageUrl });
        }
        res.status(200).json({ imageUrl });
    } catch (error) {
        res.status(500).json({ error: "Upload failed" });
    }
});

// 4. Photo Delete
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
//..............................................................................................................................
app.post('/api/customers/register', async (req, res) => {
    try {
        const data = req.body;

        // 1. Counter එකෙන් ඊළඟට එන අංකය ලබා ගැනීම (Atomic Update)
        // මේකෙන් තමයි මිලියන ගණනක් ආවත් අංක පටලැවෙන්නේ නැතුව පිළිවෙළට දෙන්නේ
        const counter = await Counter.findOneAndUpdate(
            { id: 'customer_reg' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        // 2. අංකය Format කිරීම (උදා: EPR-2026-0000001)
        const sequenceStr = counter.seq.toString().padStart(7, '0');
        const currentYear = new Date().getFullYear();
        const regNo = `EPR-${currentYear}-${sequenceStr}`;

        // 3. Password එක Hash කිරීම (ඔයාගේ පරණ කෝඩ් එකමයි)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.password, salt);

        // 4. අලුත් Customer ව සාදා ගැනීම
        // මෙතනදී පරණ දත්ත වලට අමතරව regNumber සහ status අපි එකතු කරනවා
        const newCustomer = new Customer({ 
            ...data, 
            password: hashedPassword,
            regNumber: regNo,       // අලුතින් එක් කළා
            status: 'Pending'      // අලුතින් එක් කළා (Default)
        });

        await newCustomer.save();

        console.log(`✅ New Registration: ${regNo}`); // Backend එකේ බලාගන්න
        
        res.status(201).json({ 
            message: "Customer registered successfully! Admin approval pending.",
            regNumber: regNo 
        });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// --- ලොග් වෙලා ඉන්න යූසර්ගේ දත්ත ලබාගැනීමේ API එක ---..............................................................................
app.get('/api/user-details/:email', async (req, res) => {
    try {
        const userEmail = req.params.email; // URL එකෙන් ඊමේල් එක ගන්නවා
        
        // Database එකේ (Customer model එකේ) ඒ ඊමේල් එක තියෙන කෙනාව හොයනවා
        const user = await Customer.findOne({ officialEmail: userEmail });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // මුලින්ම password එක අයින් කරලා ඉතිරි දත්ත ටික විතරක් යවනවා (Security එකට)
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

        // Email එක අනුව යූසර්ව හොයාගෙන අලුත් දත්ත ටික Update කරනවා
        const updatedUser = await Customer.findOneAndUpdate(
            { officialEmail: userEmail },
            { $set: updatedData },
            { new: true } // Update වුණු අලුත් දත්ත ටිකම ආපහු එවන්න කියලා කියනවා
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
        const { name, email } = req.body;
        const newCompany = new QRCompany({ name, email });
        await newCompany.save();
        res.status(201).json({ message: "Company registered successfully!" });
    } catch (error) {
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
        const { status } = req.body; // Frontend එකෙන් එවන Status එක (Approved / QR Sent)
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
  
// ZIP files save කරන්න folder එකක් හදනවා
const zipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/qrzips';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const uploadZip = multer({ storage: zipStorage });

// index.js එකේ මේක මෙහෙම වෙනස් කරන්න
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

app.post('/api/orders/upload-zip/:id', uploadZip.single('zipFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded.');

        const orderId = req.params.id;
        
        // 🚨 මෙන්න මේ පේළිය තමයි වැදගත්ම! 
        // අපි ලස්සනට path එක හදාගන්නවා database එකේ save කරන්න
        const zipPath = req.file.path.replace(/\\/g, '/'); 

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { 
                status: 'QR Sent', 
                qrZipFile: zipPath  // 👈 මෙන්න මේක දැන් හරියට save වෙයි
            },
            { new: true }
        );

        console.log("✅ ZIP Path Saved:", zipPath);
        res.status(200).json({ message: 'ZIP Uploaded successfully!', updatedOrder });
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
            collectedBy: partnerName, // 👈 Frontend එකෙන් එවන නම මෙතනට වැටෙනවා
            cpId: partnerId,
            cpNum: partnerPhone, 
            collectedAt: new Date()
        },
        { new: true }
    );
    // ...
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server is live on port ${PORT}`);

});


// Admin විසින් Customer ව Approve කරන Route එක
app.post('/api/admin/approve-customer/:id', async (req, res) => {
    try {
        const customerId = req.params.id;

        // 1. Customer ව සොයාගෙන Status එක Approved කිරීම
        const customer = await Customer.findByIdAndUpdate(
            customerId,
            { status: 'Approved' },
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // 2. Email එක යැවීමට ලෑස්ති වීම (Nodemailer)
        // ඔයා කලින් හදපු transporter එක මෙතන පාවිච්චි කරන්න
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: customer.officialEmail,
            subject: 'Congratulations! Your EPR Registration is Approved',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #e0e0e0; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #2ecc71; text-align: center;">Registration Approved!</h2>
                    <p>Dear <strong>${customer.companyName}</strong>,</p>
                    <p>We are pleased to inform you that your registration with the EPR Portal has been reviewed and <strong>Approved</strong> by our admin team.</p>
                    
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Registration Number:</strong> ${customer.regNumber}</p>
                        <p style="margin: 5px 0;"><strong>Login Email:</strong> ${customer.officialEmail}</p>
                        <p style="margin: 5px 0;"><strong>Password:</strong> (The password you set during registration)</p>
                    </div>

                    <p>You can now log in to your dashboard and access all the features.</p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://your-site-url.com/login" style="background: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login Now</a>
                    </div>
                    <br>
                    <p>Best Regards,<br><strong>EPR Administration Team</strong></p>
                </div>
            `
        };

        // 3. Email එක යැවීම
        await transporter.sendMail(mailOptions);

        console.log(`✅ Approved & Email Sent to: ${customer.officialEmail}`);
        res.status(200).json({ message: "Customer approved and email sent successfully!" });

    } catch (error) {
        console.error("❌ Approval Error:", error);
        res.status(500).json({ error: "Failed to approve customer" });
    }
});
