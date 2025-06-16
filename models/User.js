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
    bio: String,
    date_naissance: Date,
    genre: { type: String, enum: ["Homme", "Femme", "Autre"], default: "Homme" },
    pays: String,
    ville: String,
    adresse: String,
    code_postal: String,
    statut_compte: { 
      type: String, 
      default: "ACTIF",
      enum: ["INACTIF", "ACTIF", "VERROUILLE", "SUSPENDU", "SUPPRIME"]
    },
    statut_verification: { type: Boolean, default: false },
    token_verification: String,
    token_verification_expiration: Date,
    derniere_connexion: Date,
    compte_prive: { type: Boolean, default: false },
    preferences_confidentialite: { type: Map, of: mongoose.Schema.Types.Mixed },
    preferences_notification: { type: Map, of: Boolean },
    // Champ role unique avec énumération des rôles possibles
    role: { 
      type: String, 
      enum: ['user', 'admin', 'superadmin'],
      default: 'user'
    },
    password_reset_token: String,
    password_reset_expires: Date,
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
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token et le sauvegarder dans la base de données
  this.password_reset_token = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Définir l'expiration (1 heure)
  this.password_reset_expires = Date.now() + 60 * 60 * 1000;
  
  // Retourner le token non hashé
  return resetToken;
};

// Méthode pour générer un JWT - Mise à jour pour utiliser role au lieu de roles
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role, 
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