const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const createUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine upload path based on file field name
    if (file.fieldname.includes('nid')) {
      uploadPath += 'nid/';
    } else if (file.fieldname.includes('profile')) {
      uploadPath += 'profiles/';
    } else if (file.fieldname.includes('certificate') || file.fieldname.includes('degree')) {
      uploadPath += 'documents/';
    } else {
      uploadPath += 'others/';
    }
    
    createUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    const fileName = file.fieldname + '-' + uniqueSuffix + fileExtension;
    cb(null, fileName);
  }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter
});

// Different upload configurations for different use cases
const uploadConfigs = {
  // Patient registration uploads
  patientUploads: upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'nidFront', maxCount: 1 },
    { name: 'nidBack', maxCount: 1 }
  ]),
  
  // Doctor registration uploads
  doctorUploads: upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'nidFront', maxCount: 1 },
    { name: 'nidBack', maxCount: 1 },
    { name: 'nmcCertificate', maxCount: 1 },
    { name: 'degreeCertificate', maxCount: 1 }
  ]),
  
  // Single file upload
  single: (fieldName) => upload.single(fieldName),
  
  // Multiple files upload
  multiple: (fieldName, maxCount = 5) => upload.array(fieldName, maxCount)
};

module.exports = uploadConfigs;