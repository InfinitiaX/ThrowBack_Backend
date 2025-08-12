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

// Dans controllers/memoryController.js
exports.getAllMemories = async (req, res) => {
  try {
    const memories = await Memory.find()
      .populate('auteur', 'nom prenom photo_profil')
      .populate('video', 'titre artiste annee')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.status(200).json({
      success: true,
      count: memories.length,
      data: memories
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des souvenirs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des souvenirs'
    });
  }
};

router.post('/memories/:id/like', protect, memoryController.likeMemory);
router.post('/memories/:id/dislike', protect, memoryController.dislikeMemory);
router.delete('/memories/:id', protect, memoryController.deleteMemory);
router.get('/memories/:id/replies', memoryController.getMemoryReplies);
router.post('/memories/:id/replies', protect, memoryController.addReply);
router.post('/memories/:id/report', protect, memoryController.reportMemory);

module.exports = router;