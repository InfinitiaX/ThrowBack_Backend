// routes/api/videoRoutes.js
const express = require('express');
const { protect, isAdmin } = require('../../middlewares/authMiddleware'); // Manque isAdmin ici
const uploadShort = require('../../middlewares/upload.middleware');
const videoCtrl = require('../../controllers/videoController');

const router = express.Router();

// Public routes
router.get('/', videoCtrl.listPublicVideos); // Utilise videoCtrl au lieu de videoController
router.get('/:id', videoCtrl.getPublicVideo); // Utilise videoCtrl au lieu de videoController

// Admin routes
router.get('/videos', protect, isAdmin, videoCtrl.listVideosForAdmin); // Ajout de protect
router.post('/videos', protect, isAdmin, videoCtrl.createVideo); // Ajout de protect
router.get('/videos/:id', protect, isAdmin, videoCtrl.getVideoForAdmin); // Ajout de protect
router.patch('/videos/:id', protect, isAdmin, videoCtrl.updateVideo); // Ajout de protect
router.delete('/videos/:id', protect, isAdmin, videoCtrl.deleteVideo); // Ajout de protect

// Shorts admin uniquement
// Ces méthodes n'existent pas dans votre contrôleur
router.get('/shorts', protect, isAdmin, (req, res) => {
  res.status(501).json({ message: "This feature is not yet implemented" });
});
router.post('/shorts', protect, isAdmin, (req, res) => {
  res.status(501).json({ message: "This feature is not yet implemented" });
});
router.delete('/shorts/:id', protect, isAdmin, videoCtrl.deleteVideo);
router.patch('/shorts/:id', protect, isAdmin, videoCtrl.updateVideo);

module.exports = router;