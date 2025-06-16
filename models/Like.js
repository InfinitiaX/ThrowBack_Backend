// models/Like.js 
const likeSchema = new Schema({
  // Type d'entité likée
  type_entite: {
    type: String,
    enum: ['VIDEO', 'COMMENT', 'PLAYLIST'],
    required: true
  },
  
  // ID de l'entité likée
  entite_id: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'type_entite_model'
  },
  
  // Modèle de référence dynamique
  type_entite_model: {
    type: String,
    enum: ['Video', 'Comment', 'Playlist'],
    required: true
  },
  
  // Utilisateur qui a liké
  utilisateur: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Type d'action
  type_action: {
    type: String,
    enum: ['LIKE', 'DISLIKE'],
    required: true
  },
  
  // Metadata
  created_by: { type: String, default: 'SYSTEM' }
}, {
  timestamps: { createdAt: 'creation_date' },
  versionKey: false
});

// Index unique pour éviter les doublons
likeSchema.index({ 
  type_entite: 1, 
  entite_id: 1, 
  utilisateur: 1 
}, { unique: true });

// Index pour les requêtes courantes
likeSchema.index({ utilisateur: 1, creation_date: -1 });
likeSchema.index({ entite_id: 1, type_action: 1 });

// Middleware pour mapper le modèle de référence
likeSchema.pre('save', function(next) {
  const mapping = {
    'VIDEO': 'Video',
    'COMMENT': 'Comment',
    'PLAYLIST': 'Playlist'
  };
  this.type_entite_model = mapping[this.type_entite];
  next();
});

module.exports = model('Like', likeSchema);