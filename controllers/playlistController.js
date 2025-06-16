// controllers/playlistController.js
const Playlist = require('../models/Playlist');
const Video = require('../models/Video');
const Like = require('../models/Like');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Get user's playlists
 * @route   GET /api/playlists
 * @access  Private
 */
exports.getUserPlaylists = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, type = 'all' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    let filter = { proprietaire: userId };
    
    if (type !== 'all') {
      filter.type_playlist = type.toUpperCase();
    }
    
    const total = await Playlist.countDocuments(filter);
    
    const playlists = await Playlist.find(filter)
      .sort({ creation_date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('videos.video_id', 'titre artiste youtubeUrl type genre decennie vues likes')
      .lean();
    
    // Add computed fields
    const playlistsWithStats = playlists.map(playlist => {
      const totalDuration = playlist.videos.reduce((sum, video) => {
        return sum + (video.video_id?.duree || 0);
      }, 0);
      
      return {
        ...playlist,
        nb_videos: playlist.videos.length,
        duree_totale: totalDuration,
        derniere_modification: playlist.modified_date || playlist.creation_date
      };
    });
    
    res.json({
      success: true,
      data: playlistsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting user playlists:', err);
    next(err);
  }
};

/**
 * @desc    Get public playlists
 * @route   GET /api/public/playlists
 * @access  Public
 */
exports.getPublicPlaylists = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sortBy = 'recent', search = '' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    let filter = { visibilite: 'PUBLIC' };
    
    if (search.trim()) {
      filter.$or = [
        { nom: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') }
      ];
    }
    
    // Sort options
    let sortOptions;
    switch (sortBy) {
      case 'popular':
        sortOptions = { nb_favoris: -1, nb_lectures: -1 };
        break;
      case 'mostVideos':
        sortOptions = { 'videos.length': -1 };
        break;
      case 'alphabetical':
        sortOptions = { nom: 1 };
        break;
      case 'recent':
      default:
        sortOptions = { creation_date: -1 };
        break;
    }
    
    const total = await Playlist.countDocuments(filter);
    
    const playlists = await Playlist.find(filter)
      .populate('proprietaire', 'nom prenom photo_profil')
      .populate('videos.video_id', 'titre artiste youtubeUrl type genre')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Add computed fields and check user favorites
    const playlistsWithStats = await Promise.all(
      playlists.map(async (playlist) => {
        let isFavorite = false;
        if (req.user) {
          isFavorite = playlist.favori_par.some(id => id.equals(req.user._id));
        }
        
        return {
          ...playlist,
          nb_videos: playlist.videos.length,
          isFavorite,
          // Don't expose full video list in public view, just count
          videos: playlist.videos.slice(0, 4) // Show only first 4 for preview
        };
      })
    );
    
    res.json({
      success: true,
      data: playlistsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error getting public playlists:', err);
    next(err);
  }
};

/**
 * @desc    Get playlist by ID
 * @route   GET /api/playlists/:id
 * @access  Public/Private (based on visibility)
 */
exports.getPlaylistById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    const playlist = await Playlist.findById(id)
      .populate('proprietaire', 'nom prenom photo_profil')
      .populate('collaborateurs.utilisateur', 'nom prenom photo_profil')
      .populate({
        path: 'videos.video_id',
        select: 'titre artiste youtubeUrl type genre decennie annee vues likes duree meta',
        populate: {
          path: 'auteur',
          select: 'nom prenom'
        }
      });
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check visibility permissions
    const isOwner = userId && playlist.proprietaire._id.equals(userId);
    const isCollaborator = userId && playlist.collaborateurs.some(
      collab => collab.utilisateur._id.equals(userId)
    );
    
    if (playlist.visibilite === 'PRIVE' && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'This playlist is private'
      });
    }
    
    if (playlist.visibilite === 'AMIS' && !isOwner && !isCollaborator) {
      // TODO: Check if user is friend with owner
      return res.status(403).json({
        success: false,
        message: 'This playlist is only visible to friends'
      });
    }
    
    // Increment view count
    if (userId && !isOwner) {
      playlist.nb_lectures = (playlist.nb_lectures || 0) + 1;
      await playlist.save();
    }
    
    // Check if user has favorited this playlist
    let isFavorite = false;
    if (userId) {
      isFavorite = playlist.favori_par.some(id => id.equals(userId));
    }
    
    // Calculate total duration
    const totalDuration = playlist.videos.reduce((sum, video) => {
      return sum + (video.video_id?.duree || 0);
    }, 0);
    
    // Check user permissions
    let userPermissions = 'LECTURE';
    if (isOwner) {
      userPermissions = 'MODIFICATION';
    } else if (isCollaborator) {
      const collaboration = playlist.collaborateurs.find(
        collab => collab.utilisateur._id.equals(userId)
      );
      userPermissions = collaboration.permissions;
    }
    
    const playlistData = {
      ...playlist.toObject(),
      nb_videos: playlist.videos.length,
      duree_totale: totalDuration,
      isFavorite,
      userPermissions,
      canEdit: isOwner || (isCollaborator && userPermissions !== 'LECTURE')
    };
    
    res.json({
      success: true,
      data: playlistData
    });
  } catch (err) {
    console.error('Error getting playlist:', err);
    next(err);
  }
};

/**
 * @desc    Create a new playlist
 * @route   POST /api/playlists
 * @access  Private
 */
exports.createPlaylist = async (req, res, next) => {
  try {
    const {
      nom,
      description,
      visibilite = 'PUBLIC',
      tags = [],
      type_playlist = 'MANUELLE',
      criteres_auto
    } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!nom || nom.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Playlist name is required'
      });
    }
    
    if (nom.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Playlist name cannot exceed 100 characters'
      });
    }
    
    // Check if user already has a playlist with this name
    const existingPlaylist = await Playlist.findOne({
      proprietaire: userId,
      nom: nom.trim()
    });
    
    if (existingPlaylist) {
      return res.status(400).json({
        success: false,
        message: 'You already have a playlist with this name'
      });
    }
    
    // Create playlist
    const playlistData = {
      nom: nom.trim(),
      description: description?.trim(),
      proprietaire: userId,
      visibilite,
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim().length > 0) : [],
      type_playlist,
      videos: []
    };
    
    // Handle automatic playlists
    if (type_playlist !== 'MANUELLE' && criteres_auto) {
      playlistData.criteres_auto = criteres_auto;
      
      // Auto-populate based on criteria
      const videoFilter = {};
      if (criteres_auto.genre) videoFilter.genre = criteres_auto.genre;
      if (criteres_auto.decennie) videoFilter.decennie = criteres_auto.decennie;
      if (criteres_auto.artiste) videoFilter.artiste = new RegExp(criteres_auto.artiste, 'i');
      
      const autoVideos = await Video.find(videoFilter)
        .limit(criteres_auto.limite || 50)
        .sort({ vues: -1, likes: -1 });
      
      playlistData.videos = autoVideos.map((video, index) => ({
        video_id: video._id,
        ordre: index + 1,
        ajoute_par: userId
      }));
    }
    
    const playlist = await Playlist.create(playlistData);
    
    // Populate the created playlist
    await playlist.populate('videos.video_id', 'titre artiste youtubeUrl type genre');
    
    // Log action
    await LogAction.create({
      type_action: 'PLAYLIST_CREATED',
      description_action: `Created playlist: ${nom}`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        type_playlist: type_playlist
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Playlist created successfully',
      data: {
        ...playlist.toObject(),
        nb_videos: playlist.videos.length,
        isFavorite: false,
        userPermissions: 'MODIFICATION',
        canEdit: true
      }
    });
  } catch (err) {
    console.error('Error creating playlist:', err);
    next(err);
  }
};

/**
 * @desc    Update a playlist
 * @route   PUT /api/playlists/:id
 * @access  Private
 */
exports.updatePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nom, description, visibilite, tags } = req.body;
    const userId = req.user._id;
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check permissions
    const isOwner = playlist.proprietaire.equals(userId);
    const hasEditPermission = playlist.collaborateurs.some(
      collab => collab.utilisateur.equals(userId) && 
      ['AJOUT', 'MODIFICATION'].includes(collab.permissions)
    );
    
    if (!isOwner && !hasEditPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this playlist'
      });
    }
    
    // Update fields
    if (nom !== undefined) {
      if (!nom.trim() || nom.trim().length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid playlist name'
        });
      }
      playlist.nom = nom.trim();
    }
    
    if (description !== undefined) {
      playlist.description = description?.trim();
    }
    
    if (visibilite !== undefined && isOwner) {
      playlist.visibilite = visibilite;
    }
    
    if (tags !== undefined) {
      playlist.tags = Array.isArray(tags) ? 
        tags.filter(tag => tag.trim().length > 0) : [];
    }
    
    playlist.modified_by = userId;
    playlist.modified_date = new Date();
    await playlist.save();
    
    await playlist.populate('videos.video_id', 'titre artiste youtubeUrl type genre');
    
    res.json({
      success: true,
      message: 'Playlist updated successfully',
      data: playlist
    });
  } catch (err) {
    console.error('Error updating playlist:', err);
    next(err);
  }
};

/**
 * @desc    Delete a playlist
 * @route   DELETE /api/playlists/:id
 * @access  Private
 */
exports.deletePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Only owner can delete
    if (!playlist.proprietaire.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only the playlist owner can delete it'
      });
    }
    
    await playlist.deleteOne();
    
    // Remove from video metadata
    await Video.updateMany(
      { 'meta.playlists': id },
      { $pull: { 'meta.playlists': id } }
    );
    
    // Log action
    await LogAction.create({
      type_action: 'PLAYLIST_DELETED',
      description_action: `Deleted playlist: ${playlist.nom}`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: id,
        playlist_nom: playlist.nom
      }
    });
    
    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting playlist:', err);
    next(err);
  }
};

/**
 * @desc    Add video to playlist
 * @route   POST /api/playlists/:id/videos
 * @access  Private
 */
exports.addVideoToPlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { video_id } = req.body;
    const userId = req.user._id;
    
    if (!video_id) {
      return res.status(400).json({
        success: false,
        message: 'Video ID is required'
      });
    }
    
    // Check if video exists
    const video = await Video.findById(video_id);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check permissions
    const isOwner = playlist.proprietaire.equals(userId);
    const hasAddPermission = playlist.collaborateurs.some(
      collab => collab.utilisateur.equals(userId) && 
      ['AJOUT', 'MODIFICATION'].includes(collab.permissions)
    );
    
    if (!isOwner && !hasAddPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add videos to this playlist'
      });
    }
    
    // Check if video is already in playlist
    const videoExists = playlist.videos.some(v => v.video_id.equals(video_id));
    if (videoExists) {
      return res.status(400).json({
        success: false,
        message: 'Video is already in this playlist'
      });
    }
    
    // Add video
    const ordre = playlist.videos.length + 1;
    playlist.videos.push({
      video_id: video_id,
      ordre: ordre,
      ajoute_par: userId
    });
    
    playlist.modified_by = userId;
    playlist.modified_date = new Date();
    await playlist.save();
    
    // Update video metadata
    if (!video.meta.playlists.includes(id)) {
      video.meta.playlists.push(id);
      await video.save();
    }
    
    // Log action
    await LogAction.create({
      type_action: 'VIDEO_ADDED_TO_PLAYLIST',
      description_action: `Added video "${video.titre}" to playlist "${playlist.nom}"`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: id,
        video_id: video_id
      }
    });
    
    await playlist.populate('videos.video_id', 'titre artiste youtubeUrl type genre');
    
    res.json({
      success: true,
      message: 'Video added to playlist successfully',
      data: playlist
    });
  } catch (err) {
    console.error('Error adding video to playlist:', err);
    next(err);
  }
};

/**
 * @desc    Remove video from playlist
 * @route   DELETE /api/playlists/:id/videos/:videoId
 * @access  Private
 */
exports.removeVideoFromPlaylist = async (req, res, next) => {
  try {
    const { id, videoId } = req.params;
    const userId = req.user._id;
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check permissions
    const isOwner = playlist.proprietaire.equals(userId);
    const hasEditPermission = playlist.collaborateurs.some(
      collab => collab.utilisateur.equals(userId) && 
      ['AJOUT', 'MODIFICATION'].includes(collab.permissions)
    );
    
    if (!isOwner && !hasEditPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to remove videos from this playlist'
      });
    }
    
    // Remove video
    const videoIndex = playlist.videos.findIndex(v => v.video_id.equals(videoId));
    if (videoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Video not found in playlist'
      });
    }
    
    playlist.videos.splice(videoIndex, 1);
    
    // Reorder remaining videos
    playlist.videos.forEach((video, index) => {
      video.ordre = index + 1;
    });
    
    playlist.modified_by = userId;
    playlist.modified_date = new Date();
    await playlist.save();
    
    // Update video metadata
    await Video.findByIdAndUpdate(videoId, {
      $pull: { 'meta.playlists': id }
    });
    
    res.json({
      success: true,
      message: 'Video removed from playlist successfully'
    });
  } catch (err) {
    console.error('Error removing video from playlist:', err);
    next(err);
  }
};

/**
 * @desc    Reorder videos in playlist
 * @route   PUT /api/playlists/:id/reorder
 * @access  Private
 */
exports.reorderPlaylistVideos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { videoOrder } = req.body;
    const userId = req.user._id;
    
    if (!Array.isArray(videoOrder)) {
      return res.status(400).json({
        success: false,
        message: 'Video order must be an array'
      });
    }
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check permissions
    const isOwner = playlist.proprietaire.equals(userId);
    const hasEditPermission = playlist.collaborateurs.some(
      collab => collab.utilisateur.equals(userId) && 
      ['MODIFICATION'].includes(collab.permissions)
    );
    
    if (!isOwner && !hasEditPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reorder this playlist'
      });
    }
    
    // Validate that all videos in order exist in playlist
    const playlistVideoIds = playlist.videos.map(v => v.video_id.toString());
    const orderVideoIds = videoOrder.map(id => id.toString());
    
    if (playlistVideoIds.length !== orderVideoIds.length ||
        !playlistVideoIds.every(id => orderVideoIds.includes(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid video order'
      });
    }
    
    // Reorder videos
    const reorderedVideos = videoOrder.map((videoId, index) => {
      const video = playlist.videos.find(v => v.video_id.equals(videoId));
      return {
        ...video.toObject(),
        ordre: index + 1
      };
    });
    
    playlist.videos = reorderedVideos;
    playlist.modified_by = userId;
    playlist.modified_date = new Date();
    await playlist.save();
    
    res.json({
      success: true,
      message: 'Playlist reordered successfully'
    });
  } catch (err) {
    console.error('Error reordering playlist:', err);
    next(err);
  }
};

/**
 * @desc    Favorite/unfavorite a playlist
 * @route   POST /api/playlists/:id/favorite
 * @access  Private
 */
exports.favoritePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check if already favorited
    const isFavorited = playlist.favori_par.includes(userId);
    
    if (isFavorited) {
      // Unfavorite
      playlist.favori_par = playlist.favori_par.filter(id => !id.equals(userId));
      playlist.nb_favoris = Math.max((playlist.nb_favoris || 0) - 1, 0);
      await playlist.save();
      
      res.json({
        success: true,
        message: 'Playlist removed from favorites',
        data: { isFavorite: false, nb_favoris: playlist.nb_favoris }
      });
    } else {
      // Favorite
      playlist.favori_par.push(userId);
      playlist.nb_favoris = (playlist.nb_favoris || 0) + 1;
      await playlist.save();
      
      res.json({
        success: true,
        message: 'Playlist added to favorites',
        data: { isFavorite: true, nb_favoris: playlist.nb_favoris }
      });
    }
  } catch (err) {
    console.error('Error favoriting playlist:', err);
    next(err);
  }
};