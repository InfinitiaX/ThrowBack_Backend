const multer = require('multer');
const path   = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/profil'));
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    
    cb(null, `${file.fieldname}-${req.user.id}-${Date.now()}.${ext}`);
  }
});

module.exports = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 } 
}); 