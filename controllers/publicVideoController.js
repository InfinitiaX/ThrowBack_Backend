// controllers/publicVideoController.js
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const Playlist = require('../models/Playlist');
const Like = require('../models/Like');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Get all public videos with filters, search and pagination
 * @route   GET /api/public/videos
 * @access  Public
 */
exports.getPublicVideos = async (req, res, next) => {
  try {
    const { 
      type, 
      genre,
      decade, 
      search = '', 
      sortBy = 'recent',
      page = 1, 
      limit = 12 
    } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (genre && genre !== 'all') {
      filter.genre = genre;
    }
    
    if (decade && decade !== 'all') {
      filter.decennie = decade;
    }
    
    // Search functionality
    if (search.trim()) {
      filter.$or = [
        { titre: new RegExp(search, 'i') },
        { artiste: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { 'meta.tags': new RegExp(search, 'i') }
      ];
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'popular':
        sortOptions = { vues: -1, likes: -1 };
        break;
      case 'mostLiked':
        sortOptions = { likes: -1, vues: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'recent':
      default:
        sortOptions = { createdAt: -1 };
        break;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total documents
    const total = await Video.countDocuments(filter);
    
    // Get videos
    const videos = await Video.find(filter)
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists'); // Exclude sensitive data
    
    // If user is authenticated, check their likes
    let userLikes = [];
    if (req.user) {
      const videoIds = videos.map(v => v._id);
      userLikes = await Like.find({
        type_entite: 'VIDEO',
        entite_id: { $in: videoIds },
        utilisateur: req.user._id
      }).select('entite_id type_action');
    }
    
    // Add user interaction info to videos
    const videosWithInteraction = videos.map(video => {
      const videoObj = video.toObject();
      
      if (req.user) {
        const userLike = userLikes.find(like => 
          like.entite_id.equals(video._id)
        );
        videoObj.userInteraction = {
          liked: userLike?.type_action === 'LIKE',
          disliked: userLike?.type_action === 'DISLIKE'
        };
      }
      
      return videoObj;
    });
    
    res.json({
      success: true,
      data: videosWithInteraction,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: page < Math.ceil(total / parseInt(limit)),
        hasPrevPage: page > 1
      },
      filters: {
        availableGenres: Video.GENRES,
        availableDecades: ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'],
        availableTypes: ['music', 'podcast', 'short']
      }
    });
  } catch (err) {
    console.error('Error getting public videos:', err);
    next(err);
  }
};

/**
 * @desc    Get a single video by ID with related videos
 * @route   GET /api/public/videos/:id
 * @access  Public
 */
exports.getVideoById = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    
    // Get the video
    const video = await Video.findById(videoId)
      .populate('auteur', 'nom prenom photo_profil');
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Increment view count (only once per user per day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let shouldIncrementView = true;
    if (req.user) {
      // Check if user already viewed today
      const existingView = await LogAction.findOne({
        type_action: 'VIDEO_VIEW',
        id_user: req.user._id,
        'donnees_supplementaires.video_id': videoId,
        creation_date: { $gte: today }
      });
      
      shouldIncrementView = !existingView;
    }
    
    if (shouldIncrementView) {
      video.vues = (video.vues || 0) + 1;
      await video.save();
      
      // Log the view
      if (req.user) {
        await LogAction.create({
          type_action: 'VIDEO_VIEW',
          description_action: `Viewed video: ${video.titre}`,
          id_user: req.user._id,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          created_by: req.user._id,
          donnees_supplementaires: {
            video_id: videoId,
            video_titre: video.titre
          }
        });
      }
    }
    
    // Get related videos (same genre or artist, excluding current video)
    const relatedFilter = { 
      _id: { $ne: videoId }
    };
    
    if (video.genre) {
      relatedFilter.genre = video.genre;
    } else if (video.artiste) {
      relatedFilter.artiste = new RegExp(video.artiste, 'i');
    } else {
      relatedFilter.type = video.type;
    }
    
    const relatedVideos = await Video.find(relatedFilter)
      .populate('auteur', 'nom prenom')
      .limit(6)
      .select('titre artiste type genre youtubeUrl vues likes annee decennie')
      .sort({ vues: -1, likes: -1 });
    
    // Check user interactions
    let userInteraction = {};
    if (req.user) {
      const userLike = await Like.findOne({
        type_entite: 'VIDEO',
        entite_id: videoId,
        utilisateur: req.user._id
      });
      
      userInteraction = {
        liked: userLike?.type_action === 'LIKE',
        disliked: userLike?.type_action === 'DISLIKE'
      };
    }
    
    const videoObj = video.toObject();
    videoObj.userInteraction = userInteraction;
    
    res.json({
      success: true,
      data: videoObj,
      related: relatedVideos
    });
  } catch (err) {
    console.error('Error getting video:', err);
    next(err);
  }
};

/**
 * @desc    Like or unlike a video
 * @route   POST /api/public/videos/:id/like
 * @access  Private
 */
exports.likeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id;
    
    // Check if video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Check existing like/dislike
    const existingLike = await Like.findOne({
      type_entite: 'VIDEO',
      entite_id: videoId,
      utilisateur: userId
    });
    
    if (existingLike) {
      if (existingLike.type_action === 'LIKE') {
        // User is un-liking
        await existingLike.deleteOne();
        video.likes = Math.max((video.likes || 0) - 1, 0);
        
        // Remove from favorisBy
        video.meta.favorisBy = video.meta.favorisBy.filter(
          id => !id.equals(userId)
        );
        
        await video.save();
        
        return res.json({
          success: true,
          message: 'Video unliked',
          data: {
            liked: false,
            disliked: false,
            likes: video.likes,
            dislikes: video.dislikes
          }
        });
      } else {
        // User is changing from dislike to like
        existingLike.type_action = 'LIKE';
        await existingLike.save();
        
        video.likes = (video.likes || 0) + 1;
        video.dislikes = Math.max((video.dislikes || 0) - 1, 0);
        
        // Add to favorisBy
        if (!video.meta.favorisBy.includes(userId)) {
          video.meta.favorisBy.push(userId);
        }
        
        await video.save();
        
        return res.json({
          success: true,
          message: 'Video liked',
          data: {
            liked: true,
            disliked: false,
            likes: video.likes,
            dislikes: video.dislikes
          }
        });
      }
    } else {
      // New like
      await Like.create({
        type_entite: 'VIDEO',
        entite_id: videoId,
        utilisateur: userId,
        type_action: 'LIKE'
      });
      
      video.likes = (video.likes || 0) + 1;
      
      // Add to favorisBy
      if (!video.meta.favorisBy.includes(userId)) {
        video.meta.favorisBy.push(userId);
      }
      
      await video.save();
      
      // Log action
      await LogAction.create({
        type_action: 'VIDEO_LIKED',
        description_action: `Liked video: ${video.titre}`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          video_id: videoId,
          video_titre: video.titre
        }
      });
      
      res.json({
        success: true,
        message: 'Video liked',
        data: {
          liked: true,
          disliked: false,
          likes: video.likes,
          dislikes: video.dislikes
        }
      });
    }
  } catch (err) {
    console.error('Error liking video:', err);
    next(err);
  }
};

/**
 * @desc    Dislike or un-dislike a video
 * @route   POST /api/public/videos/:id/dislike
 * @access  Private
 */
exports.dislikeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id;
    
    // Check if video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Check existing like/dislike
    const existingLike = await Like.findOne({
      type_entite: 'VIDEO',
      entite_id: videoId,
      utilisateur: userId
    });
    
    if (existingLike) {
      if (existingLike.type_action === 'DISLIKE') {
        // User is un-disliking
        await existingLike.deleteOne();
        video.dislikes = Math.max((video.dislikes || 0) - 1, 0);
        await video.save();
        
        return res.json({
          success: true,
          message: 'Video un-disliked',
          data: {
            liked: false,
            disliked: false,
            likes: video.likes,
            dislikes: video.dislikes
          }
        });
      } else {
        // User is changing from like to dislike
        existingLike.type_action = 'DISLIKE';
        await existingLike.save();
        
        video.likes = Math.max((video.likes || 0) - 1, 0);
        video.dislikes = (video.dislikes || 0) + 1;
        
        // Remove from favorisBy
        video.meta.favorisBy = video.meta.favorisBy.filter(
          id => !id.equals(userId)
        );
        
        await video.save();
        
        return res.json({
          success: true,
          message: 'Video disliked',
          data: {
            liked: false,
            disliked: true,
            likes: video.likes,
            dislikes: video.dislikes
          }
        });
      }
    } else {
      // New dislike
      await Like.create({
        type_entite: 'VIDEO',
        entite_id: videoId,
        utilisateur: userId,
        type_action: 'DISLIKE'
      });
      
      video.dislikes = (video.dislikes || 0) + 1;
      await video.save();
      
      res.json({
        success: true,
        message: 'Video disliked',
        data: {
          liked: false,
          disliked: true,
          likes: video.likes,
          dislikes: video.dislikes
        }
      });
    }
  } catch (err) {
    console.error('Error disliking video:', err);
    next(err);
  }
};

/**
 * @desc    Get trending videos
 * @route   GET /api/public/videos/trending
 * @access  Public
 */
exports.getTrendingVideos = async (req, res, next) => {
  try {
    const { limit = 10, period = 'week' } = req.query;
    
    // Calculate date range for trending
    const now = new Date();
    let dateLimit;
    
    switch (period) {
      case 'day':
        dateLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'week':
      default:
        dateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
    
    // Get trending videos based on recent views and likes
    const trendingVideos = await Video.aggregate([
      {
        $match: {
          createdAt: { $gte: dateLimit }
        }
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$vues", 1] },
              { $multiply: ["$likes", 2] },
              { $multiply: [{ $subtract: ["$likes", "$dislikes"] }, 1.5] }
            ]
          }
        }
      },
      {
        $sort: { trendingScore: -1, createdAt: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $lookup: {
          from: 'users',
          localField: 'auteur',
          foreignField: '_id',
          as: 'auteur',
          pipeline: [
            { $project: { nom: 1, prenom: 1 } }
          ]
        }
      },
      {
        $unwind: '$auteur'
      },
      {
        $project: {
          'meta.favorisBy': 0,
          'meta.playlists': 0,
          trendingScore: 0
        }
      }
    ]);
    
    res.json({
      success: true,
      data: trendingVideos,
      period,
      message: `Trending videos for the last ${period}`
    });
  } catch (err) {
    console.error('Error getting trending videos:', err);
    next(err);
  }
};

/**
 * @desc    Get videos by genre
 * @route   GET /api/public/videos/genre/:genre
 * @access  Public
 */
exports.getVideosByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 12, sortBy = 'popular' } = req.query;
    
    // Validate genre
    if (!Video.GENRES.includes(genre)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid genre',
        availableGenres: Video.GENRES
      });
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'recent':
        sortOptions = { createdAt: -1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'popular':
      default:
        sortOptions = { vues: -1, likes: -1 };
        break;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments({ genre });
    
    const videos = await Video.find({ genre })
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      genre,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting videos by genre:', err);
    next(err);
  }
};

/**
 * @desc    Get videos by decade
 * @route   GET /api/public/videos/decade/:decade
 * @access  Public
 */
exports.getVideosByDecade = async (req, res, next) => {
  try {
    const { decade } = req.params;
    const { page = 1, limit = 12, sortBy = 'popular' } = req.query;
    
    const validDecades = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
    if (!validDecades.includes(decade)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid decade',
        availableDecades: validDecades
      });
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'recent':
        sortOptions = { createdAt: -1 };
        break;
      case 'alphabetical':
        sortOptions = { titre: 1 };
        break;
      case 'chronological':
        sortOptions = { annee: 1 };
        break;
      case 'popular':
      default:
        sortOptions = { vues: -1, likes: -1 };
        break;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments({ decennie: decade });
    
    const videos = await Video.find({ decennie: decade })
      .populate('auteur', 'nom prenom')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      decade,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting videos by decade:', err);
    next(err);
  }
};

/**
 * @desc    Search videos
 * @route   GET /api/public/videos/search
 * @access  Public
 */
exports.searchVideos = async (req, res, next) => {
  try {
    const { 
      q: query, 
      type, 
      genre, 
      decade,
      page = 1, 
      limit = 12 
    } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }
    
    // Build search filter
    const filter = {
      $or: [
        { titre: new RegExp(query, 'i') },
        { artiste: new RegExp(query, 'i') },
        { description: new RegExp(query, 'i') },
        { 'meta.tags': new RegExp(query, 'i') }
      ]
    };
    
    // Add additional filters
    if (type && type !== 'all') filter.type = type;
    if (genre && genre !== 'all') filter.genre = genre;
    if (decade && decade !== 'all') filter.decennie = decade;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Video.countDocuments(filter);
    
    const videos = await Video.find(filter)
      .populate('auteur', 'nom prenom')
      .sort({ 
        // Boost exact title matches
        $expr: {
          $cond: [
            { $regexMatch: { input: "$titre", regex: new RegExp(`^${query}`, 'i') } },
            0,
            1
          ]
        },
        vues: -1,
        likes: -1
      })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-meta.favorisBy -meta.playlists');
    
    res.json({
      success: true,
      data: videos,
      query,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error searching videos:', err);
    next(err);
  }
};