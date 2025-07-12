const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const liveChatMessageSchema = new Schema({
  livestreamId: {
    type: Schema.Types.ObjectId,
    ref: 'LiveStream',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'LiveChatMessage',
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isModerated: {
    type: Boolean,
    default: false
  },
  moderationReason: {
    type: String,
    default: null
  },
  likes: {
    type: Number,
    default: 0
  },
  // Utilisateurs qui ont aimé ce message
  likedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Métadonnées contextuelles (facultatif)
  metadata: {
    userAgent: String,
    ipAddress: String,
    location: String
  }
}, {
  timestamps: true,
  versionKey: false
});

// Index pour améliorer les performances des requêtes
liveChatMessageSchema.index({ livestreamId: 1, createdAt: -1 });
liveChatMessageSchema.index({ parentId: 1 });

// Méthode virtuelle pour obtenir les réponses à un message
liveChatMessageSchema.virtual('replies', {
  ref: 'LiveChatMessage',
  localField: '_id',
  foreignField: 'parentId',
  options: { sort: { createdAt: 1 } }
});

// Validation du contenu du message
liveChatMessageSchema.path('content').validate(function(value) {
  return value.length <= 500 && value.trim().length > 0;
}, 'Le contenu du message doit être non vide et ne pas dépasser 500 caractères');

// Validation du champ 'likes' pour éviter les valeurs négatives
liveChatMessageSchema.path('likes').validate(function(value) {
  return value >= 0;
}, 'Le nombre de likes ne peut pas être négatif');

// Méthode statique pour récupérer les messages d'un livestream avec pagination
liveChatMessageSchema.statics.getStreamMessages = async function(streamId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({ 
    livestreamId: streamId,
    parentId: null,  
    isDeleted: false
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'nom prenom photo_profil')
    .populate({
      path: 'replies',
      match: { isDeleted: false },
      populate: { path: 'userId', select: 'nom prenom photo_profil' },
      options: { limit: 5 }  
    });
};

// Méthode statique pour ajouter un like à un message
liveChatMessageSchema.statics.addLike = async function(messageId, userId) {
  return this.findOneAndUpdate(
    { _id: messageId, likedBy: { $ne: userId } },
    { 
      $inc: { likes: 1 },
      $push: { likedBy: userId }
    },
    { new: true }
  );
};

// Méthode statique pour retirer un like d'un message
liveChatMessageSchema.statics.removeLike = async function(messageId, userId) {
  return this.findOneAndUpdate(
    { _id: messageId, likedBy: userId },
    { 
      $inc: { likes: -1 },
      $pull: { likedBy: userId }
    },
    { new: true }
  );
};

// Méthode statique pour marquer un message comme modéré
liveChatMessageSchema.statics.moderateMessage = async function(messageId, reason, moderatorId) {
  return this.findByIdAndUpdate(
    messageId,
    { 
      isModerated: true,
      isDeleted: true,
      moderationReason: reason || "Contenu inapproprié",
      content: "[Message supprimé par un modérateur]",
      modified_by: moderatorId
    },
    { new: true }
  );
};

// Méthode pour récupérer les messages signalés
liveChatMessageSchema.statics.getReportedMessages = async function(streamId) {
  return this.find({
    livestreamId: streamId,
    'reports.0': { $exists: true }  // Au moins un signalement
  })
  .sort({ 'reports.length': -1 })  // Trier par nombre de signalements
  .populate('userId', 'nom prenom photo_profil');
};

// Méthode pour obtenir les statistiques de modération
liveChatMessageSchema.statics.getModerationStats = async function(streamId) {
  return this.aggregate([
    { $match: { livestreamId: mongoose.Types.ObjectId(streamId) } },
    { $group: {
      _id: null,
      totalMessages: { $sum: 1 },
      deletedMessages: { $sum: { $cond: { if: '$isDeleted', then: 1, else: 0 } } },
      moderatedMessages: { $sum: { $cond: { if: '$isModerated', then: 1, else: 0 } } }
    }}
  ]);
};

// Activer les virtuals dans les objets JSON et les conversions d'objets
liveChatMessageSchema.set('toJSON', { virtuals: true });
liveChatMessageSchema.set('toObject', { virtuals: true });

module.exports = model('LiveChatMessage', liveChatMessageSchema);