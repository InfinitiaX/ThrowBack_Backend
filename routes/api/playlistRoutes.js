// routes/api/playlistRoutes.js
const express = require('express');
const router = express.Router();
const userPlaylistController = require('../../controllers/userPlaylistController');
const { protect } = require('../../middlewares/authMiddleware');

// Routes publiques
router.get('/popular', userPlaylistController.getPopularPlaylists);

// Routes protégées
router.post('/', protect, userPlaylistController.createPlaylist);
router.get('/user', protect, userPlaylistController.getUserPlaylists);

// Routes avec paramètres
router.get('/:id', userPlaylistController.getPlaylistById);
router.put('/:id', protect, userPlaylistController.updatePlaylist);
router.delete('/:id', protect, userPlaylistController.deletePlaylist);
router.post('/:id/favorite', protect, userPlaylistController.toggleFavorite);
router.post('/:id/share', protect, userPlaylistController.sharePlaylist);

// Routes pour les vidéos d'une playlist
router.post('/:id/videos', protect, userPlaylistController.addVideoToPlaylist);
router.delete('/:id/videos/:videoId', protect, userPlaylistController.removeVideoFromPlaylist);
router.put('/:id/reorder', protect, userPlaylistController.reorderPlaylist);

module.exports = router;