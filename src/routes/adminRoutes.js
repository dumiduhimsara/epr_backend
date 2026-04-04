import express from 'express';
import mongoose from 'mongoose';
import Admin from '../../models/Admin.js';
import Customer from '../../models/Customer.js';
import Feedback from '../../models/Feedback.js';
import PDFDocument from 'pdfkit';
import SibApiV3Sdk from 'sib-api-v3-sdk';
import Product from '../../models/Product.js';

const router = express.Router();

// Admin dashboard route
router.get('/pending-customers', async (req, res) => {
       try {
       const pendingList = await Customer.find({ status: 'Pending' });
        res.status(200).json(pendingList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Admin delete route
router.delete('/admin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Admin.findByIdAndDelete(id);
        res.status(200).json({ message: "Admin deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete admin" });
    }
});

//feedbacks route
router.get('/feedbacks', async (req, res) => {
      try {
        const feedbacks = await Feedback.find().sort({ date: -1 });
        res.status(200).json(feedbacks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Feedback Route
router.post('/feedbacks', async (req, res) => {
     try {
        const newFeedback = new Feedback(req.body);
        await newFeedback.save();
        res.status(201).json(newFeedback);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Feedback Route
router.put('/feedbacks/:id', async (req, res) => {
        try {
        const updated = await Feedback.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Feedback Route
router.delete('/feedbacks/:id', async (req, res) => {
        try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Feedback deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Delete Customer Route
router.delete('/customer/:id', async (req, res) => {
        try {
        const { id } = req.params;
        await Customer.findByIdAndDelete(id);
        res.status(200).json({ message: "Customer deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete customer" });
    }
});

//get all users route
router.get('/users/all', async (req, res) => {
       try {
        const admins = await Admin.find().select('-password');
        const customers = await Customer.find().select('-password');
        res.status(200).json({ admins, customers });
    } catch (error) {
        res.status(500).json({ error: "Fetching failed" });
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

//products route get all products
router.get('/products', async (req, res) => {
       try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

//customer approval route
router.put('/approve-customer/:id', async (req, res) => {
    try {
        const CustomerModel = mongoose.model('Customer');
        const updatedCustomer = await CustomerModel.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        );
        
        if (!updatedCustomer) return res.status(404).json({ error: "Customer not found" });

        const generateCertificateBuffer = (customer) => {
            return new Promise((resolve, reject) => {
                const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
                let buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
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

// Customer statistics route
router.get('/customer-stats', async (req, res) => {
        try {
        const CustomerModel = mongoose.model('Customer');
        const total = await Customer.countDocuments();
        const pending = await Customer.countDocuments({ status: 'Pending' });
        const approved = await Customer.countDocuments({ status: 'Approved' });

        res.status(200).json({
            total,
            pending,
            approved
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;


