const multer  = require('multer');
const path    = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/shorts'));
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `short-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('video/')) {
    return cb(new Error('Seuls les fichiers vidéo sont autorisés'), false);
  }
  cb(null, true);
};


const limits = {
  fileSize: 50 * 1024 * 1024, // 50MB max file size
  files: 1 
};

module.exports = multer({ storage, fileFilter, limits }); 