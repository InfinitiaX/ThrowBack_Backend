// routes/api/public.js - Routes API publiques
const express = require('express');
const router = express.Router();
const publicVideoController = require('../../controllers/publicVideoController');
const commentController = require('../../controllers/commentController');
const playlistController = require('../../controllers/playlistController');
const { protect } = require('../../middlewares/authMiddleware');
const optionalAuth = require('../../middlewares/optionalAuth');

// ==============================================
// ROUTES VIDÉOS PUBLIQUES
// ==============================================

/**
 * @route   GET /api/public/videos
 * @desc    Get all public videos with filters
 * @access  Public
 */
router.get('/videos', optionalAuth, publicVideoController.getPublicVideos);

/**
 * @route   GET /api/public/videos/trending
 * @desc    Get trending videos
 * @access  Public
 */
router.get('/videos/trending', optionalAuth, publicVideoController.getTrendingVideos);

/**
 * @route   GET /api/public/videos/search
 * @desc    Search videos
 * @access  Public
 */
router.get('/videos/search', optionalAuth, publicVideoController.searchVideos);

/**
 * @route   GET /api/public/videos/genre/:genre
 * @desc    Get videos by genre
 * @access  Public
 */
router.get('/videos/genre/:genre', optionalAuth, publicVideoController.getVideosByGenre);

/**
 * @route   GET /api/public/videos/decade/:decade
 * @desc    Get videos by decade
 * @access  Public
 */
router.get('/videos/decade/:decade', optionalAuth, publicVideoController.getVideosByDecade);

/**
 * @route   GET /api/public/videos/:id
 * @desc    Get single video by ID
 * @access  Public
 */
router.get('/videos/:id', optionalAuth, publicVideoController.getVideoById);

/**
 * @route   POST /api/public/videos/:id/like
 * @desc    Like a video
 * @access  Private
 */
router.post('/videos/:id/like', protect, publicVideoController.likeVideo);

/**
 * @route   POST /api/public/videos/:id/dislike
 * @desc    Dislike a video
 * @access  Private
 */
router.post('/videos/:id/dislike', protect, publicVideoController.dislikeVideo);

// ==============================================
// ROUTES COMMENTAIRES
// ==============================================

/**
 * @route   GET /api/public/videos/:videoId/comments
 * @desc    Get comments for a video
 * @access  Public
 */
router.get('/videos/:videoId/comments', optionalAuth, commentController.getVideoComments);

/**
 * @route   POST /api/public/videos/:videoId/comments
 * @desc    Add comment to a video
 * @access  Private
 */
router.post('/videos/:videoId/comments', protect, commentController.addComment);

/**
 * @route   GET /api/public/comments/:commentId/replies
 * @desc    Get replies for a comment
 * @access  Public
 */
router.get('/comments/:commentId/replies', optionalAuth, commentController.getCommentReplies);

/**
 * @route   PUT /api/public/comments/:commentId
 * @desc    Update a comment
 * @access  Private
 */
router.put('/comments/:commentId', protect, commentController.updateComment);

/**
 * @route   DELETE /api/public/comments/:commentId
 * @desc    Delete a comment
 * @access  Private
 */
router.delete('/comments/:commentId', protect, commentController.deleteComment);

/**
 * @route   POST /api/public/comments/:commentId/like
 * @desc    Like a comment
 * @access  Private
 */
router.post('/comments/:commentId/like', protect, commentController.likeComment);

/**
 * @route   POST /api/public/comments/:commentId/dislike
 * @desc    Dislike a comment
 * @access  Private
 */
router.post('/comments/:commentId/dislike', protect, commentController.dislikeComment);

/**
 * @route   POST /api/public/comments/:commentId/report
 * @desc    Report a comment
 * @access  Private
 */
router.post('/comments/:commentId/report', protect, commentController.reportComment);

// ==============================================
// ROUTES PLAYLISTS PUBLIQUES
// ==============================================

/**
 * @route   GET /api/public/playlists
 * @desc    Get public playlists
 * @access  Public
 */
router.get('/playlists', optionalAuth, playlistController.getPublicPlaylists);

/**
 * @route   GET /api/public/playlists/:id
 * @desc    Get playlist by ID
 * @access  Public/Private (based on visibility)
 */
router.get('/playlists/:id', optionalAuth, playlistController.getPlaylistById);

module.exports = router;
