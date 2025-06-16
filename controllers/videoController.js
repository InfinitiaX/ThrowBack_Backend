// controllers/videoController.js
const Video = require('../models/Video');
const mongoose = require('mongoose');
const LogAction = require('../models/LogAction');

/**
 * @desc    Get list of all available genres
 * @route   GET /api/videos/genres
 * @access  Public
 */
exports.getGenres = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: Video.GENRES
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get video statistics
 * @route   GET /api/admin/videos/stats
 * @access  Private/Admin
 */
exports.getVideoStats = async (req, res, next) => {
  try {
    console.log('Fetching video statistics');
    
    // Count total videos
    const total = await Video.countDocuments();
    
    // Count by type
    const music = await Video.countDocuments({ type: 'music' });
    const podcast = await Video.countDocuments({ type: 'podcast' });
    const short = await Video.countDocuments({ type: 'short' });
    
    // Count by most popular genres (top 5)
    const genreCounts = await Video.aggregate([
      { $match: { genre: { $ne: null } } },
      { $group: { _id: "$genre", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    // Map genre counts to a more readable format
    const genres = genreCounts.map(g => ({
      genre: g._id,
      count: g.count
    }));
    
    // Get top 3 most viewed videos
    const mostViewed = await Video.find()
      .sort({ vues: -1 })
      .limit(3)
      .select('titre artiste vues type');
    
    console.log('Video stats:', { total, music, podcast, short, genres });
    
    // Return stats
    res.json({
      success: true,
      stats: {
        total,
        music,
        podcast,
        short,
        genres,
        mostViewed
      }
    });
  } catch (err) {
    console.error('Error getting video stats:', err);
    next(err);
  }
};

/**
 * @desc    Get all videos with filters and pagination (public)
 * @route   GET /api/videos
 * @access  Public
 */
exports.listPublicVideos = async (req, res, next) => {
  try {
    const { 
      type, 
      search = '', 
      decade = '',
      genre = '', 
      page = 1, 
      limit = 10 
    } = req.query;
    
    const filter = {};
    if (type) filter.type = type;
    if (decade) filter.decennie = decade;
    if (genre) filter.genre = genre;
    
    if (search) {
      filter.$or = [
        { titre: new RegExp(search, 'i') },
        { artiste: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { 'meta.tags': new RegExp(search, 'i') }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total documents for pagination
    const total = await Video.countDocuments(filter);
    
    // Get videos
    const videos = await Video.find(filter)
      .populate('auteur', '_id nom prenom')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Return response with pagination info
    res.json({
      success: true,
      data: videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error listing videos:', err);
    next(err);
  }
};

/**
 * @desc    Get a single video by ID
 * @route   GET /api/videos/:id
 * @access  Public
 */
exports.getPublicVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('auteur', 'nom prenom');
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Increment view count
    video.vues = (video.vues || 0) + 1;
    await video.save();
    
    // Get related videos (same genre or artist)
    let relatedVideos = [];
    if (video.genre || video.artiste) {
      const relatedQuery = { _id: { $ne: video._id } }; // Not the current video
      
      if (video.genre) {
        relatedQuery.genre = video.genre;
      }
      
      if (video.artiste) {
        relatedQuery.$or = relatedQuery.$or || [];
        relatedQuery.$or.push({ artiste: video.artiste });
      }
      
      relatedVideos = await Video.find(relatedQuery)
        .select('titre artiste type genre youtubeUrl vues annee')
        .limit(6);
    }
    
    res.json({
      success: true,
      data: video,
      related: relatedVideos
    });
  } catch (err) {
    console.error('Error getting video:', err);
    next(err);
  }
};

/**
 * @desc    Create a new video (admin only)
 * @route   POST /api/admin/videos
 * @access  Private/Admin
 */
exports.createVideo = async (req, res, next) => {
  try {
    const { 
      titre, 
      youtubeUrl, 
      type, 
      duree, 
      description, 
      artiste,
      annee,
      decennie,
      genre
    } = req.body;
    
    const userId = req.user._id || req.user.id;

    // Convert year to number
    const yearNumber = annee ? parseInt(annee) : new Date().getFullYear();
    
    // Determine decade based on year if not provided
    let videoDecennie = decennie;
    if (!videoDecennie) {
      if (yearNumber >= 1960 && yearNumber <= 1969) videoDecennie = '60s';
      else if (yearNumber >= 1970 && yearNumber <= 1979) videoDecennie = '70s';
      else if (yearNumber >= 1980 && yearNumber <= 1989) videoDecennie = '80s';
      else if (yearNumber >= 1990 && yearNumber <= 1999) videoDecennie = '90s';
      else if (yearNumber >= 2000 && yearNumber <= 2009) videoDecennie = '2000s';
      else if (yearNumber >= 2010 && yearNumber <= 2019) videoDecennie = '2010s';
      else if (yearNumber >= 2020 && yearNumber <= 2029) videoDecennie = '2020s';
    }

    // Create video
    const video = new Video({
      titre,
      youtubeUrl,
      type,
      duree: type === 'short' ? duree : undefined,
      description,
      artiste,
      annee: yearNumber,
      decennie: videoDecennie,
      genre,
      auteur: userId,
      vues: 0,  // Initialize views
      likes: 0,
      dislikes: 0
    });

    // Skip duration validation if admin is creating a short
    if (type === 'short' && isAdmin(req.user)) {
      video._skipDureeValidation = true;
    }

    // Save video
    await video.save();

    // Log action
    await LogAction.create({
      type_action: 'CREATE_VIDEO',
      description_action: `Created video: ${titre} (${genre || 'No genre'})`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId
    });

    res.status(201).json({
      success: true,
      data: video
    });
  } catch (err) {
    console.error('Error creating video:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(err.errors).map(val => val.message).join(', ')
      });
    }
    
    next(err);
  }
};

/**
 * @desc    Update a video
 * @route   PATCH /api/admin/videos/:id
 * @access  Private/Admin
 */
exports.updateVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    // Find video
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Check permissions for non-admin users
    if (!isAdmin(req.user)) {
      if (video.type !== 'short' || !video.auteur.equals(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Prevent changing type for non-admins
      if (req.body.type && req.body.type !== 'short') {
        return res.status(403).json({
          success: false,
          message: 'Cannot change video type'
        });
      }
      
      // Validate short duration for non-admins
      if (req.body.duree && (req.body.duree < 10 || req.body.duree > 30)) {
        return res.status(400).json({
          success: false,
          message: 'Short duration must be between 10 and 30 seconds'
        });
      }
    }

    // Fields to update
    const updatableFields = [
      'titre', 'youtubeUrl', 'type', 'duree', 'description', 
      'artiste', 'annee', 'decennie', 'genre'
    ];
    
    // Update fields
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Convert year to number
        if (field === 'annee' && req.body[field]) {
          video[field] = parseInt(req.body[field]);
        } else {
          video[field] = req.body[field];
        }
      }
    });
    
    // If year is updated but decennie isn't, recalculate decennie
    if (req.body.annee && !req.body.decennie) {
      const yearNumber = parseInt(req.body.annee);
      if (yearNumber >= 1960 && yearNumber <= 1969) video.decennie = '60s';
      else if (yearNumber >= 1970 && yearNumber <= 1979) video.decennie = '70s';
      else if (yearNumber >= 1980 && yearNumber <= 1989) video.decennie = '80s';
      else if (yearNumber >= 1990 && yearNumber <= 1999) video.decennie = '90s';
      else if (yearNumber >= 2000 && yearNumber <= 2009) video.decennie = '2000s';
      else if (yearNumber >= 2010 && yearNumber <= 2019) video.decennie = '2010s';
      else if (yearNumber >= 2020 && yearNumber <= 2029) video.decennie = '2020s';
    }
    
    // Skip duration validation if admin is updating
    if (video.type === 'short' && isAdmin(req.user)) {
      video._skipDureeValidation = true;
    }
    
    // Save updates
    await video.save();
    
    // Log action
    await LogAction.create({
      type_action: 'UPDATE_VIDEO',
      description_action: `Updated video: ${video.titre} (${video.genre || 'No genre'})`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId
    });
    
    res.json({
      success: true,
      data: video
    });
  } catch (err) {
    console.error('Error updating video:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(err.errors).map(val => val.message).join(', ')
      });
    }
    
    next(err);
  }
};

/**
 * @desc    Delete a video
 * @route   DELETE /api/admin/videos/:id
 * @access  Private/Admin
 */
exports.deleteVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    // Find video
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Check permissions for non-admin users
    if (!isAdmin(req.user)) {
      if (video.type !== 'short' || !video.auteur.equals(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }
    
    // Delete video
    await video.deleteOne();
    
    // Log action
    await LogAction.create({
      type_action: 'DELETE_VIDEO',
      description_action: `Deleted video: ${video.titre} (${video.genre || 'No genre'})`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId
    });
    
    res.json({
      success: true,
      message: 'Video deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting video:', err);
    next(err);
  }
};

/**
 * @desc    List videos for admin
 * @route   GET /api/admin/videos
 * @access  Private/Admin
 */
exports.listVideosForAdmin = async (req, res, next) => {
  try {
    const { 
      type, 
      search = '', 
      decade = '', 
      genre = '',
      page = 1, 
      limit = 12  // Increased to 12 for better grid layout
    } = req.query;
    
    console.log('Fetching admin videos with params:', { type, search, decade, genre, page, limit });
    
    const filter = {};
    if (type) filter.type = type;
    if (decade) filter.decennie = decade;
    if (genre) filter.genre = genre;
    
    if (search) {
      filter.$or = [
        { titre: new RegExp(search, 'i') },
        { artiste: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { 'meta.tags': new RegExp(search, 'i') }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total documents for pagination
    const total = await Video.countDocuments(filter);
    
    console.log(`Found ${total} videos matching filter`);
    
    // Get videos
    const videos = await Video.find(filter)
      .populate('auteur', '_id nom prenom')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    console.log(`Returning ${videos.length} videos`);
      
    // Return response with pagination info
    res.json({
      success: true,
      videos,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error listing admin videos:', err);
    next(err);
  }
};

// For backwards compatibility with routes that might still use this name
exports.listPublicVideosForAdmin = exports.listVideosForAdmin;

/**
 * @desc    Get a single video by ID (admin)
 * @route   GET /api/admin/videos/:id
 * @access  Private/Admin
 */
exports.getVideoForAdmin = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('auteur', 'nom prenom');
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    res.json({
      success: true,
      data: video
    });
  } catch (err) {
    console.error('Error getting admin video:', err);
    next(err);
  }
};

/**
 * @desc    Like a video
 * @route   POST /api/videos/:id/like
 * @access  Private
 */
exports.likeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    // Find video
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Check if user already liked or disliked the video
    const userIndex = video.meta.favorisBy.indexOf(userId);
    
    if (userIndex === -1) {
      // Add like and add user to favorisBy
      video.likes = (video.likes || 0) + 1;
      video.meta.favorisBy.push(userId);
      
      await video.save();
      
      // Log action
      await LogAction.create({
        type_action: 'LIKE_VIDEO',
        description_action: `Liked video: ${video.titre}`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId
      });
      
      res.json({
        success: true,
        message: 'Video liked successfully',
        likes: video.likes
      });
    } else {
      // Already liked, remove like
      video.likes = Math.max((video.likes || 0) - 1, 0);
      video.meta.favorisBy.splice(userIndex, 1);
      
      await video.save();
      
      res.json({
        success: true,
        message: 'Video unliked successfully',
        likes: video.likes
      });
    }
  } catch (err) {
    console.error('Error liking video:', err);
    next(err);
  }
};

/**
 * @desc    Dislike a video
 * @route   POST /api/videos/:id/dislike
 * @access  Private
 */
exports.dislikeVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user._id || req.user.id;
    
    // Find video
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Add dislike
    video.dislikes = (video.dislikes || 0) + 1;
    await video.save();
    
    // Log action
    await LogAction.create({
      type_action: 'DISLIKE_VIDEO',
      description_action: `Disliked video: ${video.titre}`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId
    });
    
    res.json({
      success: true,
      message: 'Video disliked successfully',
      dislikes: video.dislikes
    });
  } catch (err) {
    console.error('Error disliking video:', err);
    next(err);
  }
};



/**
 * @desc    List shorts for admin with specific filters
 * @route   GET /api/admin/shorts
 * @access  Private/Admin
 */
exports.listShortsForAdmin = async (req, res, next) => {
  try {
    const { 
      search = '', 
      page = 1, 
      limit = 12 
    } = req.query;
    
    console.log('Fetching admin shorts with params:', { search, page, limit });
    
    const filter = { type: 'short' }; // Toujours filtrer par type short
    
    if (search) {
      filter.$or = [
        { titre: new RegExp(search, 'i') },
        { artiste: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Count total documents for pagination
    const total = await Video.countDocuments(filter);
    
    console.log(`Found ${total} shorts matching filter`);
    
    // Get shorts
    const videos = await Video.find(filter)
      .populate('auteur', '_id nom prenom')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    console.log(`Returning ${videos.length} shorts`);
      
    // Return response with pagination info
    res.json({
      success: true,
      videos,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Error listing admin shorts:', err);
    next(err);
  }
};


/**
 * Helper function to check if user is admin
 */
function isAdmin(user) {
  if (!user) return false;
  
  // Check role field
  if (user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }
  
  // Check roles array
  if (Array.isArray(user.roles)) {
    // Check for role strings
    if (user.roles.includes('admin') || user.roles.includes('superadmin')) {
      return true;
    }
    
    // Check for role objects
    return user.roles.some(r => 
      (r.libelle_role === 'admin' || r.libelle_role === 'superadmin')
    );
  }
  
  return false;
}