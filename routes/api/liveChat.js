const express = require('express');
const router = express.Router();
const liveChatController = require('../../controllers/liveChatController');
const { protect } = require('../../middlewares/authMiddleware');

// Routes publiques
router.get('/:streamId', liveChatController.getMessages);

// Routes privées (nécessitent une authentification)
router.post('/:streamId', protect, liveChatController.addMessage);
router.post('/:streamId/messages/:messageId/like', protect, liveChatController.likeMessage);
router.delete('/:streamId/messages/:messageId', protect, liveChatController.deleteMessage);
router.post('/:streamId/messages/:messageId/report', protect, liveChatController.reportMessage);

module.exports = router;