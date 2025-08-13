// routes/api/memories.js
const express = require('express');
const router = express.Router();
const memoryController = require('../../controllers/memoryController');
const { protect } = require('../../middlewares/authMiddleware');

// Routes pour les souvenirs
router.get('/:id/memories', memoryController.getVideoMemories);
router.post('/:id/memories', protect, memoryController.addMemory);
router.get('/memories/recent', memoryController.getRecentMemories);

// Routes pour les interactions avec les souvenirs

// Dans routes/api/memories.js
router.get('/', memoryController.getAllMemories);
router.post('/:memoryId/like', protect, memoryController.likeMemory);

router.post('/memories/:id/like', protect, memoryController.likeMemory);
router.post('/memories/:id/dislike', protect, memoryController.dislikeMemory);
router.delete('/memories/:id', protect, memoryController.deleteMemory);
router.get('/memories/:id/replies', memoryController.getMemoryReplies);
router.post('/memories/:id/replies', protect, memoryController.addReply);
router.post('/memories/:id/report', protect, memoryController.reportMemory);

module.exports = router;