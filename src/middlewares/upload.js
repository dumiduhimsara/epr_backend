import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Cloudinary Config
cloudinary.config({
  cloud_name: 'de2uxpvdz',
  api_key: '362669515799133',
  api_secret: 'BitZ3Bk0EqyFGocmYuwE1nP1gBw'
});

// Profile Picture Storage
export const upload = multer({
    storage: new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'user_profiles',
            allowed_formats: ['jpg', 'png', 'jpeg'],
            public_id: (req, file) => 'profile-' + Date.now(),
        },
    })
});

// Documents Storage
export const uploadDocs = multer({
    storage: new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'customer_documents', 
            resource_type: 'raw',
            access_mode: 'public',
            public_id: (req, file) => `DOC-${Date.now()}-${file.originalname.split('.')[0]}.pdf`,
        },
    })
});

export const cpUpload = uploadDocs.fields([
    { name: 'brc', maxCount: 1 },
    { name: 'vat', maxCount: 1 },
    { name: 'billing', maxCount: 1 }
]);

export const tempZipUpload = multer({ dest: 'uploads/' });