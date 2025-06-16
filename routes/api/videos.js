// routes/api/videos.js - Routes privées pour les vidéos utilisateurs
const express = require('express');
const router = express.Router();
const publicVideoController = require('../../controllers/publicVideoController');
const { protect } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   GET /api/videos/my-favorites
 * @desc    Get user's favorite videos
 * @access  Private
 */
router.get('/my-favorites', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const userId = req.user._id;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get videos favorited by user
    const favoriteVideos = await Video.find({
      'meta.favorisBy': userId
    })
    .populate('auteur', 'nom prenom')
    .sort({ 'meta.favorisBy': -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Video.countDocuments({
      'meta.favorisBy': userId
    });
    
    // Add user interaction info
    const videosWithInteraction = favoriteVideos.map(video => {
      const videoObj = video.toObject();
      videoObj.userInteraction = {
        liked: true, // They're in favorites, so they liked it
        disliked: false
      };
      return videoObj;
    });
    
    res.json({
      success: true,
      data: videosWithInteraction,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting favorite videos:', err);
    next(err);
  }
});

/**
 * @route   GET /api/videos/my-history
 * @desc    Get user's viewing history
 * @access  Private
 */
router.get('/my-history', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const userId = req.user._id;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get viewing history from logs
    const viewLogs = await LogAction.find({
      type_action: 'VIDEO_VIEW',
      id_user: userId
    })
    .sort({ creation_date: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate({
      path: 'donnees_supplementaires.video_id',
      model: 'Video',
      populate: {
        path: 'auteur',
        select: 'nom prenom'
      }
    });
    
    const total = await LogAction.countDocuments({
      type_action: 'VIDEO_VIEW',
      id_user: userId
    });
    
    // Extract unique videos (user might have viewed same video multiple times)
    const videoMap = new Map();
    const historyVideos = [];
    
    for (const log of viewLogs) {
      const videoId = log.donnees_supplementaires?.video_id;
      if (videoId && !videoMap.has(videoId.toString())) {
        videoMap.set(videoId.toString(), true);
        
        const video = await Video.findById(videoId)
          .populate('auteur', 'nom prenom');
        
        if (video) {
          const videoObj = video.toObject();
          videoObj.lastViewed = log.creation_date;
          
          // Check if user has liked this video
          const userLike = await Like.findOne({
            type_entite: 'VIDEO',
            entite_id: videoId,
            utilisateur: userId
          });
          
          videoObj.userInteraction = {
            liked: userLike?.type_action === 'LIKE',
            disliked: userLike?.type_action === 'DISLIKE'
          };
          
          historyVideos.push(videoObj);
        }
      }
    }
    
    res.json({
      success: true,
      data: historyVideos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting viewing history:', err);
    next(err);
  }
});




module.exports = router;