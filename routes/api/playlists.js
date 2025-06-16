// routes/api/playlists.js - Routes privées pour les playlists
const express = require('express');
const router = express.Router();
const playlistController = require('../../controllers/playlistController');
const { protect } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   GET /api/playlists
 * @desc    Get user's playlists
 * @access  Private
 */
router.get('/', protect, playlistController.getUserPlaylists);

/**
 * @route   POST /api/playlists
 * @desc    Create a new playlist
 * @access  Private
 */
router.post('/', 
  protect, 
  logAction('PLAYLIST_CREATION_ATTEMPT', 'Attempted to create playlist'),
  playlistController.createPlaylist
);

/**
 * @route   PUT /api/playlists/:id
 * @desc    Update a playlist
 * @access  Private
 */
router.put('/:id', 
  protect, 
  logAction('PLAYLIST_UPDATE_ATTEMPT', 'Attempted to update playlist'),
  playlistController.updatePlaylist
);

/**
 * @route   DELETE /api/playlists/:id
 * @desc    Delete a playlist
 * @access  Private
 */
router.delete('/:id', 
  protect, 
  logAction('PLAYLIST_DELETE_ATTEMPT', 'Attempted to delete playlist'),
  playlistController.deletePlaylist
);

/**
 * @route   POST /api/playlists/:id/videos
 * @desc    Add video to playlist
 * @access  Private
 */
router.post('/:id/videos', 
  protect, 
  logAction('VIDEO_ADD_TO_PLAYLIST_ATTEMPT', 'Attempted to add video to playlist'),
  playlistController.addVideoToPlaylist
);

/**
 * @route   DELETE /api/playlists/:id/videos/:videoId
 * @desc    Remove video from playlist
 * @access  Private
 */
router.delete('/:id/videos/:videoId', 
  protect, 
  logAction('VIDEO_REMOVE_FROM_PLAYLIST_ATTEMPT', 'Attempted to remove video from playlist'),
  playlistController.removeVideoFromPlaylist
);

/**
 * @route   PUT /api/playlists/:id/reorder
 * @desc    Reorder videos in playlist
 * @access  Private
 */
router.put('/:id/reorder', 
  protect, 
  logAction('PLAYLIST_REORDER_ATTEMPT', 'Attempted to reorder playlist'),
  playlistController.reorderPlaylistVideos
);

/**
 * @route   POST /api/playlists/:id/favorite
 * @desc    Favorite/unfavorite a playlist
 * @access  Private
 */
router.post('/:id/favorite', 
  protect, 
  logAction('PLAYLIST_FAVORITE_ATTEMPT', 'Attempted to favorite/unfavorite playlist'),
  playlistController.favoritePlaylist
);

module.exports = router;
