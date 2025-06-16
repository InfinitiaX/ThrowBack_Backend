// models/Comment.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const commentSchema = new Schema({
  contenu: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  // Référence à la vidéo commentée
  video_id: {
    type: Schema.Types.ObjectId,
    ref: 'Video',
    required: true,
    index: true
  },
  
  // Auteur du commentaire
  auteur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Commentaire parent (pour les réponses)
  parent_comment: {
    type: Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  
  // Likes et dislikes
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  dislikes: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Utilisateurs qui ont liké/disliké
  liked_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  disliked_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Statut du commentaire
  statut: {
    type: String,
    enum: ['ACTIF', 'MODERE', 'SUPPRIME'],
    default: 'ACTIF'
  },
  
  // Modération
  signale_par: [{
    utilisateur: { type: Schema.Types.ObjectId, ref: 'User' },
    raison: String,
    date: { type: Date, default: Date.now }
  }],
  
  modere_par: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  date_moderation: Date,
  
  // Metadata
  created_by: { type: String, default: 'SYSTEM' },
  modified_by: { type: Schema.Types.ObjectId, ref: 'User' },
  modified_date: Date
}, {
  timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
  versionKey: false
});

// Index composé pour les requêtes courantes
commentSchema.index({ video_id: 1, creation_date: -1 });
commentSchema.index({ auteur: 1, creation_date: -1 });
commentSchema.index({ parent_comment: 1, creation_date: 1 });

// Middleware pour mettre à jour le compteur de commentaires de la vidéo
commentSchema.post('save', async function(doc) {
  if (doc.isNew && doc.statut === 'ACTIF') {
    await mongoose.model('Video').findByIdAndUpdate(
      doc.video_id,
      { $inc: { 'meta.commentCount': 1 } }
    );
  }
});

commentSchema.post('findOneAndUpdate', async function(doc) {
  if (doc && doc.statut === 'SUPPRIME') {
    await mongoose.model('Video').findByIdAndUpdate(
      doc.video_id,
      { $inc: { 'meta.commentCount': -1 } }
    );
  }
});

module.exports = model('Comment', commentSchema);