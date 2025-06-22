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
    photo_couverture: String, // Ajout pour la photo de couverture
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

// Méthode pour générer un token de vérification - 7 jours d'expiration
userSchema.methods.generateVerificationToken = function() {
  console.log(`🔑 Generating verification token for user: ${this.email}`);
  const token = crypto.randomBytes(32).toString('hex');
  this.token_verification = token;
  
  // Expiration réglée à 7 jours (604800000 ms)
  const expirationDate = new Date(Date.now() + 604800000);
  this.token_verification_expiration = expirationDate;
  
  console.log(`✅ Token generated, expires on: ${expirationDate.toISOString()}`);
  return token;
};

// Méthode pour générer un token de réinitialisation de mot de passe - 7 jours d'expiration
userSchema.methods.generatePasswordResetToken = function() {
  console.log(`🔑 Generating password reset token for user: ${this.email}`);
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token et le sauvegarder dans la base de données
  this.password_reset_token = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Expiration réglée à 7 jours (604800000 ms) au lieu de 1 heure
  const expirationDate = new Date(Date.now() + 604800000);
  this.password_reset_expires = expirationDate;
  
  console.log(`✅ Reset token generated, expires on: ${expirationDate.toISOString()}`);
  // Retourner le token non hashé
  return resetToken;
};

// Méthode pour générer un JWT
userSchema.methods.generateAuthToken = function() {
  console.log(`🔑 Generating JWT for user: ${this.email}, role: ${this.role}`);
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h'; // Augmentation à 24h par défaut
  
  // Inclure le rôle dans le payload
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role, 
      prenom: this.prenom,
      nom: this.nom
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    const isMatch = await bcrypt.compare(candidatePassword, this.mot_de_passe);
    return isMatch;
  } catch (error) {
    console.error(`❌ Password comparison error for user ${this.email}:`, error);
    // En cas d'erreur, retourner false pour indiquer une non-correspondance
    return false;
  }
};

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  if (!this.isModified('mot_de_passe')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.mot_de_passe = await bcrypt.hash(this.mot_de_passe, salt);
    console.log(`✅ Password hashed successfully for user: ${this.email}`);
    next();
  } catch (error) {
    console.error(`❌ Password hashing error for user ${this.email}:`, error);
    next(error);
  }
});

// Middleware pre-save pour vérifier l'expiration du token
userSchema.pre('save', function(next) {
  // Si le token de vérification existe mais pas de date d'expiration
  if (this.token_verification && !this.token_verification_expiration) {
    console.log(`⚠️ Fixing missing token expiration for user: ${this.email}`);
    this.token_verification_expiration = new Date(Date.now() + 604800000); // 7 jours
  }
  
  // Si le token de réinitialisation existe mais pas de date d'expiration
  if (this.password_reset_token && !this.password_reset_expires) {
    console.log(`⚠️ Fixing missing reset token expiration for user: ${this.email}`);
    this.password_reset_expires = new Date(Date.now() + 604800000); // 7 jours
  }
  
  next();
});

// Méthode virtuelle pour obtenir l'URL absolue de la photo de profil
userSchema.virtual('photo_profil_url').get(function() {
  if (!this.photo_profil) return null;
  
  // Si l'URL est déjà absolue, la retourner telle quelle
  if (this.photo_profil.startsWith('http')) return this.photo_profil;
  
  // Sinon, préfixer avec l'URL du backend
  const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
  return `${backendUrl}${this.photo_profil}`;
});

// Méthode virtuelle pour obtenir l'URL absolue de la photo de couverture
userSchema.virtual('photo_couverture_url').get(function() {
  if (!this.photo_couverture) return null;
  
  // Si l'URL est déjà absolue, la retourner telle quelle
  if (this.photo_couverture.startsWith('http')) return this.photo_couverture;
  
  // Sinon, préfixer avec l'URL du backend
  const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
  return `${backendUrl}${this.photo_couverture}`;
});

// Ajouter des index
userSchema.index({ email: 1 });
userSchema.index({ statut_compte: 1 });
userSchema.index({ derniere_connexion: -1 });

module.exports = model('User', userSchema);