// routes/api/public.js
const express = require('express');
const router = express.Router();
const publicVideoController = require('../../controllers/publicVideoController');
const commentController = require('../../controllers/commentController');
const memoryController = require('../../controllers/memoryController');
const { protect } = require('../../middlewares/authMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');

// Routes vidéos publiques
router.get('/videos', optionalAuth, publicVideoController.getPublicVideos);
router.get('/videos/trending', optionalAuth, publicVideoController.getTrendingVideos);
router.get('/videos/genre/:genre', optionalAuth, publicVideoController.getVideosByGenre);
router.get('/videos/decade/:decade', optionalAuth, publicVideoController.getVideosByDecade);
router.get('/videos/search', optionalAuth, publicVideoController.searchVideos);
router.get('/videos/:id', optionalAuth, publicVideoController.getVideoById);

// Routes d'interaction (likes, dislikes)
router.post('/videos/:id/like', protect, publicVideoController.likeVideo);
router.post('/videos/:id/dislike', protect, publicVideoController.dislikeVideo);
router.post('/videos/:id/share', protect, (req, res) => {
  // Simple log de partage
  res.json({ success: true, message: 'Share recorded' });
});

// Routes pour les souvenirs/commentaires
router.get('/videos/:id/memories', optionalAuth, memoryController.getVideoMemories);
router.post('/videos/:id/memories', protect, memoryController.addMemory);
router.get('/memories/recent', memoryController.getRecentMemories);

// Routes pour les souvenirs spécifiques
router.get('/memories/:id', memoryController.getMemory);
router.post('/memories/:id/like', protect, memoryController.likeMemory);
router.post('/memories/:id/dislike', protect, memoryController.dislikeMemory);

// Routes pour les réponses
router.get('/memories/:id/replies', memoryController.getMemoryReplies);
router.post('/memories/:id/replies', protect, memoryController.addReply);

module.exports = router;