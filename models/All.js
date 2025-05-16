// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Schema, model } = mongoose;
const userSchema = new Schema(
  {
    nom: String,
    prenom: String,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mot_de_passe: { type: String, required: true, select: false },
    profession: String,
    telephone: String,
    photo_profil: String,
    photo_couverture: String,
    bio: String,
    date_naissance: Date,
    genre: String,
    pays: String,
    ville: String,
    adresse: String,
    code_postal: String,
    statut_compte: { type: String, ref: "StatutUser", default: "ACTIF",enum: ["INACTIF", "ACTIF", "VERROUILLE", "SUSPENDU", "SUPPRIME"]},
    statut_verification: { type: Boolean, default: false },
    token_verification: String,
    token_verification_expiration: Date,
    derniere_connexion: Date,
    compte_prive: { type: Boolean, default: false },
    preferences_confidentialite: { type: Map, of: mongoose.Schema.Types.Mixed },
    preferences_notification: { type: Map, of: Boolean },
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    reset_password_token: String,
    reset_password_expire: Date,
    created_by: { type: String, default: 'SYSTEM' },
    modified_by: String
  },
  {
    timestamps: { createdAt: 'date_inscription', updatedAt: 'modified_date' },
    versionKey: false
  }
);

// Méthode pour générer un token de vérification
userSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.token_verification = token;
  this.token_verification_expiration = Date.now() + 24 * 60 * 60 * 1000; // 24 heures
  return token;
};

// Méthode pour générer un token de réinitialisation de mot de passe
userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.reset_password_token = token;
  this.reset_password_expire = Date.now() + 60 * 60 * 1000; // 1 heure
  return token;
};

// Méthode pour générer un JWT
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      roles: this.roles,
      prenom: this.prenom,
      nom: this.nom
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.mot_de_passe);
};

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  if (!this.isModified('mot_de_passe')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.mot_de_passe = await bcrypt.hash(this.mot_de_passe, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Ajouter des index
userSchema.index({ email: 1 });
userSchema.index({ statut_compte: 1 });
userSchema.index({ derniere_connexion: -1 });

module.exports = model('User', userSchema);


// models/Token.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Modèle pour les tokens de vérification d'email et autres usages
 */
const tokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_ACTIVATION'],
      default: 'EMAIL_VERIFICATION'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 43200 // Le token expire après 12 heures (en secondes)
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Index pour rechercher par token et par userId
tokenSchema.index({ token: 1 });
tokenSchema.index({ userId: 1 });

module.exports = model('Token', tokenSchema);



// models/Role.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;


const roleSchema = new Schema(
    {
      libelle_role: { type: String, required: true },
      description: String,
      permissions: { type: Map, of: Boolean },
      created_by: { type: String, default: 'SYSTEM' },
      modified_by: String
    },
    {
      timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
      versionKey: false
    }
  );

  // Exportation des modèles
module.exports = { Role: model('Role', roleSchema)};
  

const mongoose = require("mongoose");

const logActionSchema = new mongoose.Schema({
  date_action: { type: Date, default: Date.now },
  type_action: String,
  description_action: String,
  id_user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  creation_date: { type: Date, default: Date.now },
  created_by: String,
  modified_date: Date,
  modified_by: String
});

module.exports = mongoose.model("LogAction", logActionSchema);


// models/LoginAttempt.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/**
 * Modèle pour suivre les tentatives de connexion et gérer le verrouillage de compte
 */
const loginAttemptSchema = new Schema(
  {
    id_user: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    nb_tentatives: { 
      type: Number, 
      default: 0 
    },
    derniere_tentative: { 
      type: Date, 
      default: Date.now 
    },
    compte_verrouille: { 
      type: Boolean, 
      default: false 
    },
    verrouille_jusqua: Date,
    ip_address: String,
    success: { 
      type: Boolean, 
      default: false 
    },
    user_agent: String,
    created_by: { 
      type: String, 
      default: 'SYSTEM' 
    },
    modified_by: String
  },
  {
    timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
    versionKey: false
  }
);

// Méthode pour verrouiller un compte
loginAttemptSchema.methods.verrouillerCompte = function(dureeMinutes = 30) {
  this.compte_verrouille = true;
  this.verrouille_jusqua = new Date(Date.now() + (dureeMinutes * 60 * 1000));
  return this.verrouille_jusqua;
};

// Méthode pour vérifier si un compte est verrouillé
loginAttemptSchema.methods.estVerrouille = function() {
  if (!this.compte_verrouille) return false;
  
  const maintenant = new Date();
  if (this.verrouille_jusqua && this.verrouille_jusqua > maintenant) {
    return true;
  }
  
  // Si la durée de verrouillage est passée, déverrouiller automatiquement
  this.compte_verrouille = false;
  this.nb_tentatives = 0;
  return false;
};

// Méthode pour calculer le temps restant de verrouillage en minutes
loginAttemptSchema.methods.tempsRestantVerrouillage = function() {
  if (!this.compte_verrouille || !this.verrouille_jusqua) return 0;
  
  const maintenant = new Date();
  const diffMs = this.verrouille_jusqua - maintenant;
  if (diffMs <= 0) return 0;
  
  return Math.ceil(diffMs / (60 * 1000)); // Convertit en minutes et arrondit au supérieur
};

// Méthode pour réinitialiser les tentatives
loginAttemptSchema.methods.reinitialiser = function() {
  this.nb_tentatives = 0;
  this.compte_verrouille = false;
  this.verrouille_jusqua = null;
  this.success = true;
};

// Index pour rechercher par id_user
loginAttemptSchema.index({ id_user: 1 });
loginAttemptSchema.index({ derniere_tentative: -1 });

module.exports = model('LoginAttempt', loginAttemptSchema);

const mongoose = require("mongoose");

const statutUserSchema = new mongoose.Schema({
  code_statut: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ["INACTIF", "ACTIF", "VERROUILLE", "SUSPENDU", "SUPPRIME"]
  },
  libelle_statut: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String 
  },
  couleur: { 
    type: String, 
    default: "#777777" // Couleur grise par défaut pour l'affichage dans l'interface
  },
  ordre_affichage: { 
    type: Number, 
    default: 0 
  },
  creation_date: { 
    type: Date, 
    default: Date.now 
  },
  created_by: { 
    type: String, 
    default: "SYSTEM" 
  },
  modified_date: { 
    type: Date 
  },
  modified_by: { 
    type: String 
  }
}, {
  timestamps: false // Nous utilisons nos propres champs de date
});

// Index pour des requêtes plus rapides
statutUserSchema.index({ code_statut: 1 });

module.exports = mongoose.model("StatutUser", statutUserSchema);
