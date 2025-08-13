// controllers/memoryController.js
const Comment = require('../models/Comment'); 
const Video = require('../models/Video');
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Récupérer les souvenirs (commentaires) d'une vidéo
 * @route   GET /api/videos/:id/memories
 * @access  Public
 */
exports.getVideoMemories = async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;
    
    // Vérifier que la vidéo existe
    const videoExists = await Video.exists({ _id: videoId });
    if (!videoExists) {
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée"
      });
    }
    
    // Définir l'ordre de tri
    let sortOrder = {};
    switch (sort) {
      case 'likes':
        sortOrder = { likes: -1, creation_date: -1 };
        break;
      case 'oldest':
        sortOrder = { creation_date: 1 };
        break;
      case 'recent':
      default:
        sortOrder = { creation_date: -1 };
        break;
    }
    
    // Calculer le nombre de documents à sauter pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les commentaires de type "ACTIF" (non modérés, non supprimés)
    const memories = await Comment.find({ 
      video_id: videoId,
      statut: 'ACTIF',
      parent_comment: null // Uniquement les commentaires de premier niveau
    })
      .sort(sortOrder)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('auteur', 'nom prenom photo_profil');
    
    // Compter le nombre total de commentaires pour la pagination
    const total = await Comment.countDocuments({
      video_id: videoId,
      statut: 'ACTIF',
      parent_comment: null
    });
    
    // Ajouter les informations d'interaction utilisateur si connecté
    let memoriesWithInteraction = memories;
    if (req.user) {
      const userId = req.user._id;
      
      // Map pour transformer les documents Mongoose en objets simples et ajouter les interactions
      memoriesWithInteraction = memories.map(memory => {
        const memoryObj = memory.toObject();
        
        // S'assurer que les tableaux existent
        const likedBy = Array.isArray(memory.liked_by) ? memory.liked_by : [];
        const dislikedBy = Array.isArray(memory.disliked_by) ? memory.disliked_by : [];
        
        // Vérifier si l'utilisateur a liké ce commentaire
        memoryObj.userInteraction = {
          liked: likedBy.some(id => id && id.equals && id.equals(userId)),
          disliked: dislikedBy.some(id => id && id.equals && id.equals(userId)),
          isAuthor: memory.auteur && memory.auteur._id && memory.auteur._id.equals && memory.auteur._id.equals(userId)
        };
        
        return memoryObj;
      });
    }
    
    // Formater les mémoires pour la réponse
    const formattedMemories = memoriesWithInteraction.map(memory => ({
      id: memory._id,
      username: memory.auteur ? `${memory.auteur.prenom || ''} ${memory.auteur.nom || ''}`.trim() : 'Utilisateur',
      type: 'posted',
      videoTitle: '',
      videoArtist: '', 
      videoYear: '', 
      imageUrl: memory.auteur && memory.auteur.photo_profil ? memory.auteur.photo_profil : '/images/default-avatar.jpg',
      content: memory.contenu || '',
      likes: memory.likes || 0,
      comments: 0, 
      userInteraction: memory.userInteraction || {
        liked: false,
        disliked: false,
        isAuthor: false
      },
      createdAt: memory.creation_date
    }));
    
    res.status(200).json({
      success: true,
      data: formattedMemories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des souvenirs:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des souvenirs"
    });
  }
};


/**
 * @desc    Ajouter un souvenir (commentaire) à une vidéo
 * @route   POST /api/videos/:id/memories
 * @access  Private
 */
exports.addMemory = async (req, res) => {
  try {
    const { id: videoId } = req.params;
    const { contenu } = req.body;
    
    
    const userId = req.user._id || req.user.id;
    
    console.log(' Ajout de souvenir:');
    console.log(' Video ID:', videoId);
    console.log(' User ID:', userId);
    console.log(' User Object:', req.user);
    console.log(' Contenu:', contenu);
    
    // Validation du contenu
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Le contenu du souvenir est requis"
      });
    }
    
    if (contenu.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Le contenu du souvenir ne doit pas dépasser 500 caractères"
      });
    }
    
    // Vérifier que l'utilisateur est authentifié
    if (!userId) {
      console.error(' Utilisateur non identifié dans req.user');
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié"
      });
    }
    
    // Vérifier que la vidéo existe
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée"
      });
    }
    
    console.log(' Vidéo trouvée:', video.titre);
    
    
    const memory = new Comment({
      contenu: contenu.trim(),
      video_id: videoId,
      auteur: userId,  
      statut: 'ACTIF',
      creation_date: Date.now(),
      created_by: userId,
      likes: 0,
      dislikes: 0,
      liked_by: [],
      disliked_by: [],
      signale_par: []
    });
    
    console.log('📝 Objet Comment avant sauvegarde:', {
      contenu: memory.contenu,
      video_id: memory.video_id,
      auteur: memory.auteur,
      statut: memory.statut
    });
    
    // Sauvegarder le commentaire
    const savedMemory = await memory.save();
    console.log(' Souvenir sauvegardé avec ID:', savedMemory._id);
    
    // Incrémenter le compteur de commentaires dans les métadonnées de la vidéo
    if (!video.meta) {
      video.meta = {};
    }
    video.meta.commentCount = (video.meta.commentCount || 0) + 1;
    await video.save();
    
    console.log(' Compteur de commentaires mis à jour:', video.meta.commentCount);
    
    // Journal d'action (optionnel - ne pas faire échouer si ça plante)
    try {
      await LogAction.create({
        type_action: "MEMOIRE_AJOUTEE",
        description_action: `Souvenir ajouté sur la vidéo "${video.titre || 'Sans titre'}"`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          video_id: videoId,
          video_titre: video.titre || 'Sans titre',
          memoire_id: savedMemory._id
        }
      });
    } catch (logError) {
      console.warn(' Erreur lors du logging (non critique):', logError.message);
    }
    
    // Récupérer le commentaire avec les informations de l'auteur
    const populatedMemory = await Comment.findById(savedMemory._id)
      .populate('auteur', 'nom prenom photo_profil');
    
    console.log(' Souvenir populé:', populatedMemory);
    
    res.status(201).json({
      success: true,
      message: "Souvenir ajouté avec succès",
      data: {
        id: populatedMemory._id,
        username: populatedMemory.auteur ? 
          `${populatedMemory.auteur.prenom || ''} ${populatedMemory.auteur.nom || ''}`.trim() : 
          'Utilisateur',
        content: populatedMemory.contenu,
        likes: populatedMemory.likes || 0,
        dislikes: populatedMemory.dislikes || 0,
        createdAt: populatedMemory.creation_date,
        userInteraction: {
          liked: false,
          disliked: false,
          isAuthor: true
        }
      }
    });
  } catch (err) {
    console.error(" Erreur lors de l'ajout du souvenir:", err);
    
    // Si c'est une erreur de validation Mongoose, donner plus de détails
    if (err.name === 'ValidationError') {
      console.error(' Détails de validation:', err.errors);
      return res.status(400).json({
        success: false,
        message: "Erreur de validation",
        details: Object.values(err.errors).map(error => ({
          field: error.path,
          message: error.message,
          value: error.value
        }))
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout du souvenir",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};


/**
 * @desc    Supprimer un souvenir (commentaire)
 * @route   DELETE /api/memories/:id
 * @access  Private
 */
exports.deleteMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;
    
    // Vérifier que le souvenir existe et appartient à l'utilisateur ou que l'utilisateur est admin
    const memory = await Comment.findOne({
      _id: memoryId,
      $or: [
        { auteur: userId },
        { /* Condition pour vérifier si l'utilisateur est admin (à adapter selon votre modèle) */ }
      ]
    });
    
    if (!memory) {
      return res.status(404).json({
        success: false,
        message: "Souvenir non trouvé ou permissions insuffisantes"
      });
    }
    
    // Mise à jour du statut du commentaire (soft delete)
    memory.statut = 'SUPPRIME';
    memory.modified_date = Date.now();
    memory.modified_by = userId;
    await memory.save();
    
    // Décrémenter le compteur de commentaires dans les métadonnées de la vidéo
    const video = await Video.findById(memory.video_id);
    if (video && video.meta && typeof video.meta.commentCount === 'number') {
      video.meta.commentCount = Math.max(0, video.meta.commentCount - 1);
      await video.save();
    }
    
    // Journal d'action
    await LogAction.create({
      type_action: "MEMOIRE_SUPPRIMEE",
      description_action: "Souvenir supprimé",
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        video_id: memory.video_id,
        memoire_id: memoryId
      }
    });
    
    res.status(200).json({
      success: true,
      message: "Souvenir supprimé avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la suppression du souvenir:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression du souvenir"
    });
  }
};

/**
 * @desc    Aimer un souvenir (commentaire)
 * @route   POST /api/memories/:id/like
 * @access  Private
 */
exports.likeMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;
    
    // Vérifier que le souvenir existe
    const memory = await Comment.findById(memoryId);
    if (!memory) {
      return res.status(404).json({
        success: false,
        message: "Souvenir non trouvé"
      });
    }
    
    // Initialiser les tableaux s'ils n'existent pas
    if (!Array.isArray(memory.liked_by)) memory.liked_by = [];
    if (!Array.isArray(memory.disliked_by)) memory.disliked_by = [];
    
    // Initialiser les compteurs s'ils n'existent pas
    if (typeof memory.likes !== 'number') memory.likes = 0;
    if (typeof memory.dislikes !== 'number') memory.dislikes = 0;
    
    // Vérifier si l'utilisateur a déjà liké ou disliké ce souvenir
    const hasLiked = memory.liked_by.some(id => id && id.equals && id.equals(userId));
    const hasDisliked = memory.disliked_by.some(id => id && id.equals && id.equals(userId));
    
    // Mise à jour des likes/dislikes
    if (hasLiked) {
      // Si déjà liké, retirer le like
      memory.liked_by = memory.liked_by.filter(id => !id.equals(userId));
      memory.likes = Math.max(0, memory.likes - 1);
    } else {
      // Ajouter un like
      memory.liked_by.push(userId);
      memory.likes += 1;
      
      // Si l'utilisateur avait disliké, retirer le dislike
      if (hasDisliked) {
        memory.disliked_by = memory.disliked_by.filter(id => !id.equals(userId));
        memory.dislikes = Math.max(0, memory.dislikes - 1);
      }
    }
    
    await memory.save();
    
    res.status(200).json({
      success: true,
      message: hasLiked ? "Like retiré avec succès" : "Like ajouté avec succès",
      data: {
        liked: !hasLiked,
        disliked: false,
        likes: memory.likes,
        dislikes: memory.dislikes
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout/retrait du like:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout/retrait du like"
    });
  }
};

/**
 * @desc    Ne pas aimer un souvenir (commentaire)
 * @route   POST /api/memories/:id/dislike
 * @access  Private
 */
exports.dislikeMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user._id;
    
    // Vérifier que le souvenir existe
    const memory = await Comment.findById(memoryId);
    if (!memory) {
      return res.status(404).json({
        success: false,
        message: "Souvenir non trouvé"
      });
    }
    
    // Initialiser les tableaux s'ils n'existent pas
    if (!Array.isArray(memory.liked_by)) memory.liked_by = [];
    if (!Array.isArray(memory.disliked_by)) memory.disliked_by = [];
    
    // Initialiser les compteurs s'ils n'existent pas
    if (typeof memory.likes !== 'number') memory.likes = 0;
    if (typeof memory.dislikes !== 'number') memory.dislikes = 0;
    
    // Vérifier si l'utilisateur a déjà liké ou disliké ce souvenir
    const hasLiked = memory.liked_by.some(id => id && id.equals && id.equals(userId));
    const hasDisliked = memory.disliked_by.some(id => id && id.equals && id.equals(userId));
    
    // Mise à jour des likes/dislikes
    if (hasDisliked) {
      // Si déjà disliké, retirer le dislike
      memory.disliked_by = memory.disliked_by.filter(id => !id.equals(userId));
      memory.dislikes = Math.max(0, memory.dislikes - 1);
    } else {
      // Ajouter un dislike
      memory.disliked_by.push(userId);
      memory.dislikes += 1;
      
      // Si l'utilisateur avait liké, retirer le like
      if (hasLiked) {
        memory.liked_by = memory.liked_by.filter(id => !id.equals(userId));
        memory.likes = Math.max(0, memory.likes - 1);
      }
    }
    
    await memory.save();
    
    res.status(200).json({
      success: true,
      message: hasDisliked ? "Dislike retiré avec succès" : "Dislike ajouté avec succès",
      data: {
        liked: false,
        disliked: !hasDisliked,
        likes: memory.likes,
        dislikes: memory.dislikes
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout/retrait du dislike:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout/retrait du dislike"
    });
  }
};

/**
 * @desc    Récupérer les réponses à un souvenir
 * @route   GET /api/memories/:id/replies
 * @access  Public
 */
exports.getMemoryReplies = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    
    // Vérifier que le souvenir parent existe
    const parentExists = await Comment.exists({ _id: memoryId });
    if (!parentExists) {
      return res.status(404).json({
        success: false,
        message: "Souvenir parent non trouvé"
      });
    }
    
    // Calculer le nombre de documents à sauter pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les réponses au souvenir
    const replies = await Comment.find({
      parent_comment: memoryId,
      statut: 'ACTIF'
    })
      .sort({ creation_date: 1 }) // Du plus ancien au plus récent pour les réponses
      .skip(skip)
      .limit(parseInt(limit))
      .populate('auteur', 'nom prenom photo_profil');
    
    // Compter le nombre total de réponses pour la pagination
    const total = await Comment.countDocuments({
      parent_comment: memoryId,
      statut: 'ACTIF'
    });
    
    // Ajouter les informations d'interaction utilisateur si connecté
    let repliesWithInteraction = replies;
    if (req.user) {
      const userId = req.user._id;
      
      repliesWithInteraction = replies.map(reply => {
        const replyObj = reply.toObject();
        
        // S'assurer que les tableaux existent
        const likedBy = Array.isArray(reply.liked_by) ? reply.liked_by : [];
        const dislikedBy = Array.isArray(reply.disliked_by) ? reply.disliked_by : [];
        
        replyObj.userInteraction = {
          liked: likedBy.some(id => id && id.equals && id.equals(userId)),
          disliked: dislikedBy.some(id => id && id.equals && id.equals(userId)),
          isAuthor: reply.auteur && reply.auteur._id && reply.auteur._id.equals && reply.auteur._id.equals(userId)
        };
        
        return replyObj;
      });
    }
    
    res.status(200).json({
      success: true,
      data: repliesWithInteraction,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des réponses:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des réponses"
    });
  }
};

/**
 * @desc    Ajouter une réponse à un souvenir
 * @route   POST /api/memories/:id/replies
 * @access  Private
 */
exports.addReply = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const { contenu } = req.body;
    const userId = req.user._id;
    
    // Validation du contenu
    if (!contenu || contenu.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Le contenu de la réponse est requis"
      });
    }
    
    if (contenu.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Le contenu de la réponse ne doit pas dépasser 500 caractères"
      });
    }
    
    // Vérifier que le souvenir parent existe
    const parentMemory = await Comment.findById(memoryId);
    if (!parentMemory) {
      return res.status(404).json({
        success: false,
        message: "Souvenir parent non trouvé"
      });
    }
    
    // Créer la réponse avec initialisation des tableaux
    const reply = new Comment({
      contenu,
      video_id: parentMemory.video_id, // Même vidéo que le commentaire parent
      auteur: userId,
      parent_comment: memoryId,
      statut: 'ACTIF',
      created_by: userId,
      likes: 0,
      dislikes: 0,
      liked_by: [],
      disliked_by: [],
      signale_par: []
    });
    
    await reply.save();
    
    // Journal d'action
    await LogAction.create({
      type_action: "REPONSE_AJOUTEE",
      description_action: "Réponse ajoutée à un souvenir",
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        video_id: parentMemory.video_id,
        memoire_parent_id: memoryId,
        reponse_id: reply._id
      }
    });
    
    // Récupérer la réponse avec les informations de l'auteur
    const populatedReply = await Comment.findById(reply._id)
      .populate('auteur', 'nom prenom photo_profil');
    
    res.status(201).json({
      success: true,
      message: "Réponse ajoutée avec succès",
      data: {
        ...(populatedReply ? populatedReply.toObject() : {}),
        userInteraction: {
          liked: false,
          disliked: false,
          isAuthor: true
        }
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout de la réponse:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout de la réponse"
    });
  }
};

// Ajouter dans memoryController.js
/**
 * @desc    Récupérer les souvenirs récents (tous les commentaires)
 * @route   GET /api/public/memories/recent
 * @access  Public
 */
exports.getRecentMemories = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Récupérer les commentaires récents
    const memories = await Comment.find({ 
      statut: 'ACTIF',
      parent_comment: null // Uniquement les commentaires de premier niveau
    })
      .sort({ creation_date: -1 })
      .limit(parseInt(limit))
      .populate('auteur', 'nom prenom photo_profil')
      .populate('video_id', 'titre artiste annee');
    
    // Formater les données pour le frontend
    const formattedMemories = await Promise.all(memories.map(async (memory) => {
      // Compter le nombre de réponses à ce commentaire
      const replyCount = await Comment.countDocuments({ 
        parent_comment: memory._id, 
        statut: 'ACTIF' 
      });
      
      return {
        _id: memory._id,
        auteur: memory.auteur || { nom: '', prenom: '' },
        video: memory.video_id || { titre: '', artiste: '', annee: '' },
        contenu: memory.contenu || '',
        likes: memory.likes || 0,
        nb_commentaires: replyCount,
        creation_date: memory.creation_date
      };
    }));
    
    res.status(200).json({
      success: true,
      data: formattedMemories
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des souvenirs récents:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des souvenirs récents"
    });
  }
};


/**
 * @desc    Signaler un souvenir inapproprié
 * @route   POST /api/memories/:id/report
 * @access  Private
 */
exports.reportMemory = async (req, res) => {
  try {
    const { id: memoryId } = req.params;
    const { raison } = req.body;
    const userId = req.user._id;
    
    // Validation de la raison
    if (!raison || raison.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "La raison du signalement est requise"
      });
    }
    
    // Vérifier que le souvenir existe
    const memory = await Comment.findById(memoryId);
    if (!memory) {
      return res.status(404).json({
        success: false,
        message: "Souvenir non trouvé"
      });
    }
    
    // Initialiser le tableau des signalements s'il n'existe pas
    if (!Array.isArray(memory.signale_par)) {
      memory.signale_par = [];
    }
    
    // Vérifier si l'utilisateur a déjà signalé ce souvenir
    const hasReported = memory.signale_par.some(signalement => 
      signalement && signalement.utilisateur && signalement.utilisateur.equals && signalement.utilisateur.equals(userId)
    );
    
    if (hasReported) {
      return res.status(400).json({
        success: false,
        message: "Vous avez déjà signalé ce souvenir"
      });
    }
    
    // Ajouter le signalement
    memory.signale_par.push({
      utilisateur: userId,
      raison,
      date: Date.now()
    });
    
    // Si le nombre de signalements dépasse un seuil, modérer automatiquement
    if (memory.signale_par.length >= 5) { 
      memory.statut = 'MODERE';
    }
    
    await memory.save();
    
    // Journal d'action
    await LogAction.create({
      type_action: "MEMOIRE_SIGNALEE",
      description_action: "Souvenir signalé",
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        video_id: memory.video_id,
        memoire_id: memoryId,
        raison
      }
    });
    
    res.status(200).json({
      success: true,
      message: "Souvenir signalé avec succès"
    });
  } catch (err) {
    console.error("Erreur lors du signalement du souvenir:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du signalement du souvenir"
    });
  }
};