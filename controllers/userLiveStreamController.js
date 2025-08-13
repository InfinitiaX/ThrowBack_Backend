// controllers/userLiveStreamController.js
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

// Niveau de log configurable
const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'error';

// Fonction de log personnalisée
const logger = {
  debug: (...args) => LOG_LEVEL === 'debug' && console.log(...args),
  info: (...args) => ['debug', 'info'].includes(LOG_LEVEL) && console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args)
};

/**
 * Fonction utilitaire pour mettre à jour automatiquement les statuts
 */
const updateStreamStatuses = async () => {
  const now = new Date();
  
  try {
    // Démarrer automatiquement les streams programmés dont l'heure est arrivée
    const streamsToStart = await LiveStream.updateMany(
      {
        status: 'SCHEDULED',
        scheduledStartTime: { $lte: now },
        scheduledEndTime: { $gt: now }
      },
      {
        $set: {
          status: 'LIVE',
          actualStartTime: now
        }
      }
    );

    if (streamsToStart.modifiedCount > 0) {
      logger.info(`Auto-started ${streamsToStart.modifiedCount} scheduled streams`);
    }

    // Terminer automatiquement les streams dont l'heure de fin est dépassée depuis au moins 2 minutes
    // Cette marge permet d'éviter d'interrompre une vidéo en cours de lecture
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const streamsToEnd = await LiveStream.updateMany(
      {
        status: 'LIVE',
        scheduledEndTime: { $lte: twoMinutesAgo }
      },
      {
        $set: {
          status: 'COMPLETED',
          actualEndTime: now
        }
      }
    );

    if (streamsToEnd.modifiedCount > 0) {
      logger.info(`Auto-ended ${streamsToEnd.modifiedCount} expired streams`);
    }
    
    return {
      started: streamsToStart.modifiedCount,
      ended: streamsToEnd.modifiedCount
    };
  } catch (error) {
    logger.error('Error updating stream statuses:', error);
    return { started: 0, ended: 0 };
  }
};

/**
 * Fonction pour gérer la progression des compilations vidéo
 * CORRIGÉE: Calcul précis des temps, prise en compte des durées vidéo
 */
const updateCompilationProgress = async (streamId) => {
  try {
    const stream = await LiveStream.findById(streamId);
    if (!stream || stream.compilationType !== 'VIDEO_COLLECTION') return null;

    const videos = stream.compilationVideos;
    if (!videos || videos.length === 0) return null;

    const now = new Date();
    const startTime = stream.actualStartTime || stream.scheduledStartTime;
    
    // Calculer le temps écoulé en secondes pour plus de précision (au lieu de minutes)
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    
    // Fonction pour obtenir la durée d'une vidéo (en secondes)
    const getVideoDuration = (video) => {
      // Utiliser la durée réelle de la vidéo si disponible
      if (video.duration) return video.duration;
      
      // Sinon estimer en fonction du type
      if (video.sourceType === 'YOUTUBE' && video.sourceId && video.sourceId.length === 11) {
        return 240; // Durée YouTube moyenne en secondes (4 minutes)
      }
      return 180; // Durée par défaut (3 minutes)
    };

    // Calculer l'index courant en fonction du temps réellement écoulé
    let accumulatedTime = 0;
    let newIndex = 0;
    
    // Simuler la progression à travers la playlist pour trouver l'index actuel
    for (let i = 0; i < videos.length; i++) {
      const videoDuration = getVideoDuration(videos[i]);
      if (accumulatedTime + videoDuration > elapsedSeconds) {
        newIndex = i;
        break;
      }
      accumulatedTime += videoDuration;
      
      // Si on a parcouru toute la playlist, recommencer (mode boucle)
      if (i === videos.length - 1) {
        // Si on atteint la fin, recommencer au début en mode boucle
        i = -1; // -1 car l'incrémentation du for le fera passer à 0
        
        // Mais seulement si on n'a pas dépassé un nombre raisonnable de répétitions
        if (accumulatedTime > elapsedSeconds * 3) {
          newIndex = 0;
          break;
        }
      }
    }

    // Ne mettre à jour que si l'index a changé ou si currentVideoStartTime n'existe pas
    if (stream.currentVideoIndex !== newIndex || !stream.currentVideoStartTime) {
      // Stocker l'ancien index pour logging
      const oldIndex = stream.currentVideoIndex;
      
      // Mettre à jour l'index
      stream.currentVideoIndex = newIndex;
      
      // Stocker également le temps de démarrage de la vidéo actuelle
      stream.currentVideoStartTime = new Date(startTime.getTime() + (accumulatedTime * 1000));
      
      await stream.save();
      logger.debug(`Updated compilation progress for stream ${streamId}, video index: ${oldIndex} -> ${newIndex}, start time: ${stream.currentVideoStartTime}`);
    }
    
    return stream;
  } catch (error) {
    logger.error('Error updating compilation progress:', error);
    return null;
  }
};

/**
 * @desc    Récupérer tous les livestreams actifs pour les utilisateurs
 * @route   GET /api/user/livestreams
 * @access  Public
 */
exports.getActiveLiveStreams = async (req, res) => {
  try {
    logger.debug('Fetching active livestreams for users');
    
    // D'abord, mettre à jour automatiquement les statuts
    await updateStreamStatuses();
    
    const now = new Date();
    
    // Filtre strict : SEULEMENT les streams LIVE qui ne sont pas expirés
    const baseFilter = { 
      status: 'LIVE',
      scheduledEndTime: { $gt: now }, // S'assurer que la date de fin n'est pas dépassée
      $or: [
        { actualStartTime: { $lte: now } }, // Déjà commencé
        { scheduledStartTime: { $lte: now } } // L'heure de début est arrivée
      ]
    };
    
    // Ajouter la condition de visibilité selon l'authentification
    let filter = { ...baseFilter };
    
    if (req.user) {
      filter = {
        ...baseFilter,
        $and: [
          baseFilter,
          {
            $or: [
              { isPublic: true },
              { author: req.user.id }
            ]
          }
        ]
      };
    } else {
      filter.isPublic = true;
    }
    
    logger.debug('Using filter:', JSON.stringify(filter));
    
    const livestreams = await LiveStream.find(filter)
      .populate('author', 'nom prenom photo_profil')
      .sort('-actualStartTime -scheduledStartTime');

    // Mettre à jour la progression des compilations pour chaque stream
    for (const stream of livestreams) {
      if (stream.compilationType === 'VIDEO_COLLECTION') {
        await updateCompilationProgress(stream._id);
      }
    }

    // Recharger les streams avec les informations mises à jour
    const updatedLivestreams = await LiveStream.find(filter)
      .populate('author', 'nom prenom photo_profil')
      .sort('-actualStartTime -scheduledStartTime');

    logger.debug(`Found ${updatedLivestreams.length} active livestreams`);
    
    // Données de test seulement si aucun stream actif ET en développement
    if (updatedLivestreams.length === 0 && process.env.NODE_ENV === 'development') {
      logger.debug('Returning test livestream data for development');
      const testStream = {
        _id: new mongoose.Types.ObjectId(),
        title: "Compilation rap français des années 90",
        description: "Les meilleurs titres du rap français des années 90",
        status: "LIVE",
        isPublic: true,
        compilationType: "VIDEO_COLLECTION",
        playbackUrl: "https://www.youtube.com/embed/playlist?list=PLjT3XS2hb44UYOmOS9tXLvGzg60TMnqGQ&autoplay=1&loop=1",
        thumbnailUrl: "/images/livestreams/rap-francais.jpg",
        hostName: "ThrowBack Host",
        tags: ["rap", "français", "90s", "nostalgie"],
        chatEnabled: true,
        scheduledStartTime: new Date(Date.now() - 60000), // Commencé il y a 1 minute
        scheduledEndTime: new Date(Date.now() + 3600000), // Se termine dans 1 heure
        actualStartTime: new Date(Date.now() - 60000),
        currentVideoIndex: 0,
        currentVideoStartTime: new Date(Date.now() - 60000), // Ajout de cette propriété
        playbackConfig: {
          loop: true,
          autoplay: true,
          shuffle: false
        },
        statistics: {
          totalUniqueViewers: 127,
          likes: 42
        },
        author: {
          _id: new mongoose.Types.ObjectId(),
          nom: "Throwback",
          prenom: "Host"
        },
        compilationVideos: [
          {
            sourceId: "v_Uy0NpRqBOI",
            sourceType: "YOUTUBE",
            title: "IAM - Je danse le Mia",
            thumbnailUrl: "/images/thumbnails/iam-mia.jpg",
            duration: 240 // Durée en secondes
          },
          {
            sourceId: "aDTwIu-pTJQ",
            sourceType: "YOUTUBE", 
            title: "Suprême NTM - C'est arrivé près d'chez toi",
            thumbnailUrl: "/images/thumbnails/ntm-arrivé.jpg",
            duration: 300 // Durée en secondes
          }
        ]
      };
      
      return res.status(200).json({
        success: true,
        count: 1,
        data: [testStream]
      });
    }

    // Journaliser l'action si l'utilisateur est connecté
    if (req.user) {
      try {
        await LogAction.create({
          type_action: 'VIEW_LIVESTREAMS',
          description_action: 'Utilisateur a consulté les livestreams actifs',
          id_user: req.user.id,
          created_by: req.user.id
        });
      } catch (error) {
        logger.error('Error logging action:', error);
        // Continue même si le logging échoue
      }
    }

    res.status(200).json({
      success: true,
      count: updatedLivestreams.length,
      data: updatedLivestreams
    });
  } catch (error) {
    logger.error('Error fetching livestreams for users:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des livestreams',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer un livestream spécifique par ID
 * @route   GET /api/user/livestreams/:id
 * @access  Public
 */
exports.getLiveStreamById = async (req, res) => {
  try {
    const streamId = req.params.id;
    logger.debug(`Fetching livestream with ID: ${streamId}`);
    
    // Mettre à jour les statuts avant de récupérer le stream
    await updateStreamStatuses();
    
    const livestream = await LiveStream.findById(streamId)
      .populate('author', 'nom prenom photo_profil');
    
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier si le livestream est public ou appartient à l'utilisateur connecté
    if (!livestream.isPublic && (!req.user || req.user.id !== livestream.author._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Ce livestream n\'est pas public'
      });
    }

    const now = new Date();
    
    // Vérifications strictes pour déterminer si le stream est accessible
    const isExpired = livestream.scheduledEndTime && livestream.scheduledEndTime <= now;
    const isNotStarted = livestream.scheduledStartTime && livestream.scheduledStartTime > now;
    const isCompleted = livestream.status === 'COMPLETED';
    const isCancelled = livestream.status === 'CANCELLED';

    // En production, vérifier que le livestream est réellement actif
    if (process.env.NODE_ENV !== 'development') {
      if (isExpired || isCompleted || isCancelled) {
        return res.status(400).json({
          success: false,
          message: 'Ce livestream n\'est plus disponible'
        });
      }
      
      if (isNotStarted && livestream.status === 'SCHEDULED') {
        const minutesUntilStart = Math.ceil((livestream.scheduledStartTime - now) / (1000 * 60));
        return res.status(400).json({
          success: false,
          message: `Ce livestream commencera dans ${minutesUntilStart} minutes`
        });
      }
      
      if (livestream.status !== 'LIVE') {
        return res.status(400).json({
          success: false,
          message: 'Ce livestream n\'est pas actuellement en direct'
        });
      }
    }

    // Mettre à jour la progression si c'est une compilation
    if (livestream.compilationType === 'VIDEO_COLLECTION') {
      await updateCompilationProgress(streamId);
      // Recharger le stream avec les données mises à jour
      const updatedStream = await LiveStream.findById(streamId)
        .populate('author', 'nom prenom photo_profil');
      
      if (updatedStream) {
        Object.assign(livestream, updatedStream.toObject());
      }
    }

    // Journaliser la vue et mettre à jour les statistiques
    if (req.user) {
      try {
        await LogAction.create({
          type_action: 'VIEW_LIVESTREAM',
          description_action: `Utilisateur a consulté le livestream "${livestream.title}"`,
          id_user: req.user.id,
          created_by: req.user.id
        });
        
        // Mettre à jour les statistiques de visionnage
        await LiveStream.findByIdAndUpdate(streamId, {
          $inc: {
            'statistics.totalUniqueViewers': 1
          }
        });
      } catch (error) {
        logger.error('Error logging view action:', error);
        // Continue même si le logging échoue
      }
    }

    res.status(200).json({
      success: true,
      data: livestream
    });
  } catch (error) {
    logger.error('Error fetching livestream by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération du livestream',
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter un like à un livestream
 * @route   POST /api/user/livestreams/:id/like
 * @access  Private
 */
exports.likeLiveStream = async (req, res) => {
  try {
    const streamId = req.params.id;
    const userId = req.user.id;
    
    // Vérifier si le livestream existe
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }

    // Vérifier que le stream est encore actif
    const now = new Date();
    const isExpired = livestream.scheduledEndTime && livestream.scheduledEndTime <= now;
    const isNotLive = livestream.status !== 'LIVE';

    if (isExpired || isNotLive) {
      return res.status(400).json({
        success: false,
        message: 'Ce livestream n\'est plus actif'
      });
    }

    // Mettre à jour les statistiques de likes
    await LiveStream.findByIdAndUpdate(streamId, {
      $inc: { 'statistics.likes': 1 }
    });

    // Journaliser l'action
    try {
      await LogAction.create({
        type_action: 'LIKE_LIVESTREAM',
        description_action: `Utilisateur a aimé le livestream "${livestream.title}"`,
        id_user: userId,
        created_by: userId
      });
    } catch (error) {
      logger.error('Error logging like action:', error);
      // Continue même si le logging échoue
    }

    res.status(200).json({
      success: true,
      message: 'Like ajouté avec succès'
    });
  } catch (error) {
    logger.error('Error liking livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'ajout du like',
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter un commentaire à un livestream
 * @route   POST /api/user/livestreams/:id/comment
 * @access  Private
 */
exports.commentLiveStream = async (req, res) => {
  try {
    // Rediriger vers liveChatController.addMessage
    const liveChatController = require('./liveChatController');
    return liveChatController.addMessage(req, res);
  } catch (error) {
    logger.error('Error commenting livestream:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'ajout du commentaire',
      error: error.message
    });
  }
};

/**
 * @desc    Récupérer les commentaires d'un livestream
 * @route   GET /api/user/livestreams/:id/comments
 * @access  Public
 */
exports.getLiveStreamComments = async (req, res) => {
  try {
    // Rediriger vers liveChatController.getMessages
    const liveChatController = require('./liveChatController');
    return liveChatController.getMessages(req, res);
  } catch (error) {
    logger.error('Error fetching livestream comments:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des commentaires',
      error: error.message
    });
  }
};

/**
 * Middleware pour mettre à jour automatiquement les statuts des streams
 */
const autoUpdateStreams = async (req, res, next) => {
  try {
    await updateStreamStatuses();
    next();
  } catch (error) {
    logger.error('Error in auto-update middleware:', error);
    next(); // Continuer même en cas d'erreur
  }
};

/**
 * Task périodique pour nettoyer automatiquement les statuts
 */
const cleanupStreamStatuses = async () => {
  try {
    const result = await updateStreamStatuses();
    
    logger.info(`Cleanup completed: ${result.started} streams started, ${result.ended} streams ended`);
    
    return result;
  } catch (error) {
    logger.error('Error in cleanup task:', error);
    return { started: 0, ended: 0, error: error.message };
  }
};

module.exports = {
  getActiveLiveStreams: exports.getActiveLiveStreams,
  getLiveStreamById: exports.getLiveStreamById,
  likeLiveStream: exports.likeLiveStream,
  commentLiveStream: exports.commentLiveStream,
  getLiveStreamComments: exports.getLiveStreamComments,
 
  updateStreamStatuses,
  updateCompilationProgress,
  autoUpdateStreams,
  cleanupStreamStatuses
};