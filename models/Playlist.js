

// models/Playlist.js
// Correction pour models/Like.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const playlistSchema = new Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Propriétaire de la playlist
  proprietaire: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Vidéos dans la playlist avec ordre
  videos: [{
    video_id: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
      required: true
    },
    ordre: {
      type: Number,
      required: true
    },
    date_ajout: {
      type: Date,
      default: Date.now
    },
    ajoute_par: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Paramètres de visibilité
  visibilite: {
    type: String,
    enum: ['PUBLIC', 'PRIVE', 'AMIS'],
    default: 'PUBLIC'
  },
  
  // Collaboration
  collaborateurs: [{
    utilisateur: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['LECTURE', 'AJOUT', 'MODIFICATION'],
      default: 'LECTURE'
    },
    date_ajout: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Image de couverture
  image_couverture: String,
  
  // Statistiques
  nb_lectures: {
    type: Number,
    default: 0
  },
  
  nb_favoris: {
    type: Number,
    default: 0
  },
  
  favori_par: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Tags pour la recherche
  tags: [String],
  
  // Playlist générée automatiquement ou créée manuellement
  type_playlist: {
    type: String,
    enum: ['MANUELLE', 'AUTO_GENRE', 'AUTO_DECENNIE', 'AUTO_ARTISTE'],
    default: 'MANUELLE'
  },
  
  // Critères pour les playlists automatiques
  criteres_auto: {
    genre: String,
    decennie: String,
    artiste: String,
    limite: { type: Number, default: 50 }
  },
  
  // Metadata
  created_by: { type: String, default: 'SYSTEM' },
  modified_by: { type: Schema.Types.ObjectId, ref: 'User' },
  modified_date: Date
}, {
  timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
  versionKey: false
});

// Index pour les requêtes courantes
playlistSchema.index({ proprietaire: 1, creation_date: -1 });
playlistSchema.index({ visibilite: 1, creation_date: -1 });
playlistSchema.index({ tags: 1 });
playlistSchema.index({ 'videos.video_id': 1 });

// Virtuel pour compter le nombre de vidéos
playlistSchema.virtual('nb_videos').get(function() {
  return this.videos.length;
});

// Méthode pour ajouter une vidéo
playlistSchema.methods.ajouterVideo = function(videoId, userId) {
  const ordre = this.videos.length + 1;
  this.videos.push({
    video_id: videoId,
    ordre: ordre,
    ajoute_par: userId
  });
  return this.save();
};

// Méthode pour supprimer une vidéo
playlistSchema.methods.supprimerVideo = function(videoId) {
  this.videos = this.videos.filter(v => !v.video_id.equals(videoId));
  // Réorganiser les ordres
  this.videos.forEach((video, index) => {
    video.ordre = index + 1;
  });
  return this.save();
};

// Méthode pour réorganiser les vidéos
playlistSchema.methods.reorganiserVideos = function(nouveauOrdre) {
  nouveauOrdre.forEach((item, index) => {
    const video = this.videos.find(v => v.video_id.equals(item.videoId));
    if (video) {
      video.ordre = index + 1;
    }
  });
  this.videos.sort((a, b) => a.ordre - b.ordre);
  return this.save();
};

module.exports = model('Playlist', playlistSchema);