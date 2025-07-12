const LiveChatMessage = require('../models/liveChatMessage');
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
 * @desc    Récupérer les messages d'un livestream
 * @route   GET /api/livechat/:streamId
 * @access  Public
 */
exports.getMessages = async (req, res) => {
  try {
    const { streamId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    logger.debug(`Getting messages for stream ${streamId}, page ${page}, limit ${limit}`);
    
    // Vérifier si le livestream existe et est actif
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      logger.warn(`Stream not found: ${streamId}`);
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier si le chat est activé
    if (livestream.chatEnabled === false) {
      logger.info(`Chat disabled for stream ${streamId}`);
      return res.status(403).json({
        success: false,
        message: 'Le chat est désactivé pour ce livestream',
        chatDisabled: true
      });
    }
    
    // Vérifier si l'utilisateur est banni (si connecté)
    if (req.user && livestream.bannedUsers && 
        livestream.bannedUsers.some(id => id.toString() === req.user.id)) {
      logger.info(`User ${req.user.id} is banned from stream ${streamId}`);
      return res.status(403).json({
        success: false,
        message: 'Vous avez été banni de ce chat',
        userBanned: true
      });
    }
    
    // Récupérer les messages avec pagination
    const messages = await LiveChatMessage.getStreamMessages(streamId, page, limit);
    logger.debug(`Found ${messages.length} messages for stream ${streamId}`);
    
    // Compter le nombre total de messages pour la pagination
    const total = await LiveChatMessage.countDocuments({
      livestreamId: streamId,
      parentId: null,
      isDeleted: false
    });
    
    // Enrichir les messages avec l'information "userLiked" si l'utilisateur est connecté
    const enhancedMessages = req.user ? messages.map(message => {
      const userLiked = message.likedBy.some(id => id.toString() === req.user.id);
      
      // Convertir en objet pour pouvoir ajouter des propriétés
      const messageObj = message.toObject();
      messageObj.userLiked = userLiked;
      
      // Faire de même pour les réponses
      if (messageObj.replies && messageObj.replies.length > 0) {
        messageObj.replies = messageObj.replies.map(reply => {
          const replyObj = reply.toObject ? reply.toObject() : reply;
          replyObj.userLiked = reply.likedBy && reply.likedBy.some(id => id.toString() === req.user.id);
          return replyObj;
        });
      }
      
      return messageObj;
    }) : messages;
    
    // Journaliser la consultation si l'utilisateur est connecté
    if (req.user) {
      try {
        await LogAction.create({
          type_action: 'VIEW_LIVESTREAM_CHAT',
          description_action: `Consultation du chat pour le livestream "${livestream.title}"`,
          id_user: req.user.id,
          created_by: req.user.id
        });
        logger.debug(`Chat view logged for user ${req.user.id}, stream ${streamId}`);
      } catch (error) {
        logger.error('Error logging chat view:', error);
        // Continuer malgré l'erreur
      }
    }
    
    res.status(200).json({
      success: true,
      data: enhancedMessages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching livestream chat messages:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des messages',
      error: error.message
    });
  }
};

/**
 * @desc    Ajouter un message au chat
 * @route   POST /api/livechat/:streamId
 * @access  Private
 */
exports.addMessage = async (req, res) => {
  try {
    const { streamId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;
    
    logger.debug(`Adding message to stream ${streamId} by user ${userId}`);
    
    // Validation de base
    if (!content || !content.trim()) {
      logger.warn('Empty content in message');
      return res.status(400).json({
        success: false,
        message: 'Le contenu du message ne peut pas être vide'
      });
    }
    
    // Vérifier si le livestream existe et est actif
    const livestream = await LiveStream.findById(streamId);
    if (!livestream) {
      logger.warn(`Stream not found: ${streamId}`);
      return res.status(404).json({
        success: false,
        message: 'Livestream non trouvé'
      });
    }
    
    // Vérifier le statut du livestream
    if (livestream.status !== 'LIVE') {
      logger.warn(`Stream ${streamId} is not live`);
      return res.status(400).json({
        success: false,
        message: 'Le livestream n\'est pas en cours'
      });
    }
    
    // Vérifier si le chat est activé
    if (livestream.chatEnabled === false) {
      logger.warn(`Chat disabled for stream ${streamId}`);
      return res.status(403).json({
        success: false,
        message: 'Le chat est désactivé pour ce livestream'
      });
    }
    
    // Vérifier si l'utilisateur est banni
    if (livestream.bannedUsers && livestream.bannedUsers.some(id => id.toString() === userId)) {
      logger.warn(`User ${userId} is banned from stream ${streamId}`);
      return res.status(403).json({
        success: false,
        message: 'Vous avez été banni de ce chat'
      });
    }
    
    // Si c'est une réponse, vérifier que le message parent existe
    if (parentId) {
      const parentMessage = await LiveChatMessage.findById(parentId);
      if (!parentMessage || parentMessage.livestreamId.toString() !== streamId) {
        logger.warn(`Parent message not found: ${parentId}`);
        return res.status(404).json({
          success: false,
          message: 'Message parent non trouvé'
        });
      }
    }
    
    // Métadonnées (facultatif, pour la modération et l'analyse)
    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    };
    
    // Créer le message
    const newMessage = await LiveChatMessage.create({
      livestreamId: streamId,
      userId,
      content: content.trim(),
      parentId: parentId || null,
      metadata
    });
    
    logger.debug(`Message created: ${newMessage._id}`);
    
    // Incrémenter le compteur de messages du chat
    await LiveStream.findByIdAndUpdate(streamId, {
      $inc: { 'statistics.chatMessages': 1 }
    });
    
    // Récupérer le message avec les infos utilisateur
    const populatedMessage = await LiveChatMessage.findById(newMessage._id)
      .populate('userId', 'nom prenom photo_profil');
    
    // Ajouter la propriété userLiked (toujours false pour un nouveau message)
    const messageObj = populatedMessage.toObject();
    messageObj.userLiked = false;
    
    res.status(201).json({
      success: true,
      message: 'Message ajouté avec succès',
      data: messageObj
    });
  } catch (error) {
    logger.error('Error adding chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de l\'ajout du message',
      error: error.message
    });
  }
};

/**
 * @desc    Liker un message
 * @route   POST /api/livechat/:streamId/messages/:messageId/like
 * @access  Private
 */
exports.likeMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const userId = req.user.id;
    
    logger.debug(`Like message ${messageId} in stream ${streamId} by user ${userId}`);
    
    // Vérifier si le message existe
    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      logger.warn(`Message not found: ${messageId}`);
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }
    
    // Vérifier si l'utilisateur a déjà liké ce message
    const alreadyLiked = message.likedBy.some(id => id.toString() === userId);
    
    let updatedMessage;
    
    if (alreadyLiked) {
      // Retirer le like
      updatedMessage = await LiveChatMessage.removeLike(messageId, userId);
      logger.debug(`Like removed from message ${messageId}`);
    } else {
      // Ajouter le like
      updatedMessage = await LiveChatMessage.addLike(messageId, userId);
      logger.debug(`Like added to message ${messageId}`);
    }
    
    // Récupérer le message mis à jour avec les infos utilisateur
    const populatedMessage = await LiveChatMessage.findById(updatedMessage._id)
      .populate('userId', 'nom prenom photo_profil');
    
    // Convertir en objet et ajouter userLiked
    const messageObj = populatedMessage.toObject();
    messageObj.userLiked = !alreadyLiked;
    
    res.status(200).json({
      success: true,
      message: alreadyLiked ? 'Like retiré avec succès' : 'Like ajouté avec succès',
      data: messageObj
    });
  } catch (error) {
    logger.error('Error liking chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du like',
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer un message (soft delete)
 * @route   DELETE /api/livechat/:streamId/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const userId = req.user.id;
    
    logger.debug(`Delete message ${messageId} in stream ${streamId} by user ${userId}`);
    
    // Vérifier si le message existe
    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      logger.warn(`Message not found: ${messageId}`);
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }
    
    // Vérifier si l'utilisateur est l'auteur du message ou un admin
    const isAuthor = message.userId.toString() === userId;
    const isAdmin = req.user.roles && req.user.roles.some(r => 
      r === 'admin' || r === 'superadmin' || r.libelle_role === 'admin' || r.libelle_role === 'superadmin'
    );
    
    if (!isAuthor && !isAdmin) {
      logger.warn(`User ${userId} not authorized to delete message ${messageId}`);
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à supprimer ce message'
      });
    }
    
    // Soft delete (marquer comme supprimé plutôt que de supprimer réellement)
    message.isDeleted = true;
    message.content = isAdmin ? "[Message supprimé par un modérateur]" : "[Message supprimé]";
    message.moderationReason = isAdmin ? (req.body.reason || "Modération") : null;
    await message.save();
    
    logger.debug(`Message ${messageId} soft deleted`);
    
    // Journaliser l'action
    await LogAction.create({
      type_action: isAdmin ? 'MODERATION_MESSAGE' : 'DELETE_OWN_MESSAGE',
      description_action: isAdmin 
        ? `Modération d'un message dans le livestream "${streamId}"`
        : `Suppression de son propre message dans le livestream "${streamId}"`,
      id_user: userId,
      created_by: userId
    });
    
    res.status(200).json({
      success: true,
      message: 'Message supprimé avec succès'
    });
  } catch (error) {
    logger.error('Error deleting chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la suppression du message',
      error: error.message
    });
  }
};

/**
 * @desc    Signaler un message abusif
 * @route   POST /api/livechat/:streamId/messages/:messageId/report
 * @access  Private
 */
exports.reportMessage = async (req, res) => {
  try {
    const { streamId, messageId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    
    logger.debug(`Report message ${messageId} in stream ${streamId} by user ${userId}`);
    
    // Vérifier si le message existe
    const message = await LiveChatMessage.findById(messageId);
    if (!message || message.livestreamId.toString() !== streamId) {
      logger.warn(`Message not found: ${messageId}`);
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }
    
    // Éviter les auto-signalements
    if (message.userId.toString() === userId) {
      logger.warn(`User ${userId} tried to report own message ${messageId}`);
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas signaler votre propre message'
      });
    }
    
    // Créer un signalement (dans un système réel, vous auriez un modèle Report)
    // Pour simplifier, nous utilisons LogAction
    await LogAction.create({
      type_action: 'REPORT_MESSAGE',
      description_action: `Signalement d'un message dans le livestream "${streamId}"`,
      id_user: userId,
      created_by: userId,
      donnees_supplementaires: {
        messageId,
        messageContent: message.content,
        messageAuthor: message.userId,
        reportReason: reason || 'Non spécifié'
      }
    });
    
    logger.debug(`Message ${messageId} reported successfully`);
    
    res.status(200).json({
      success: true,
      message: 'Message signalé avec succès'
    });
  } catch (error) {
    logger.error('Error reporting chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors du signalement',
      error: error.message
    });
  }
};