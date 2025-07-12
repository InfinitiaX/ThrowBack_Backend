// routes/api/userplaylists.js
const express = require('express');
const router = express.Router();
const playlistController = require('../../controllers/userPlaylistController');
const { protect } = require('../../middlewares/authMiddleware');

// Routes publiques
router.get('/popular', playlistController.getPopularPlaylists);

// Routes protégées
router.post('/', protect, playlistController.createPlaylist);
router.get('/user', protect, playlistController.getUserPlaylists);

// Routes avec paramètres
router.get('/:id', playlistController.getPlaylistById);
router.put('/:id', protect, playlistController.updatePlaylist);
router.delete('/:id', protect, playlistController.deletePlaylist);
router.post('/:id/favorite', protect, playlistController.toggleFavorite);

// Routes pour les vidéos d'une playlist
router.post('/:id/videos', protect, playlistController.addVideoToPlaylist);
router.delete('/:id/videos/:videoId', protect, playlistController.removeVideoFromPlaylist);

module.exports = router;