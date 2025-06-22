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
    // 🔧 CORRECTION: Champ role unique avec énumération
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

// 🔧 CORRECTION: Méthode pour générer un token de vérification plus robuste
userSchema.methods.generateVerificationToken = function() {
  try {
    console.log(`🔑 Generating verification token for user: ${this.email}`);
    
    const token = crypto.randomBytes(32).toString('hex');
    this.token_verification = token;
    
    // Expiration réglée à 7 jours (604800000 ms)
    const expirationDate = new Date(Date.now() + 604800000);
    this.token_verification_expiration = expirationDate;
    
    console.log(`✅ Token generated, expires on: ${expirationDate.toISOString()}`);
    return token;
  } catch (error) {
    console.error(`❌ Error generating verification token for ${this.email}:`, error);
    throw new Error('Failed to generate verification token');
  }
};

// 🔧 CORRECTION: Méthode pour générer un token de réinitialisation plus robuste
userSchema.methods.generatePasswordResetToken = function() {
  try {
    console.log(`🔑 Generating password reset token for user: ${this.email}`);
    
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Hash token et le sauvegarder dans la base de données
    this.password_reset_token = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
      
    // Expiration réglée à 7 jours (604800000 ms)
    const expirationDate = new Date(Date.now() + 604800000);
    this.password_reset_expires = expirationDate;
    
    console.log(`✅ Reset token generated, expires on: ${expirationDate.toISOString()}`);
    
    // Retourner le token non hashé
    return resetToken;
  } catch (error) {
    console.error(`❌ Error generating reset token for ${this.email}:`, error);
    throw new Error('Failed to generate password reset token');
  }
};

// 🔧 CORRECTION: Méthode pour générer un JWT plus robuste
userSchema.methods.generateAuthToken = function() {
  try {
    console.log(`🔑 Generating JWT for user: ${this.email}, role: ${this.role}`);
    
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    // 🔧 CORRECTION: Payload plus robuste
    const payload = { 
      id: this._id.toString(), 
      email: this.email, 
      role: this.role, 
      prenom: this.prenom,
      nom: this.nom,
      iat: Math.floor(Date.now() / 1000) // Timestamp pour debugging
    };
    
    const token = jwt.sign(payload, secret, { expiresIn });
    
    console.log(`✅ JWT generated successfully for ${this.email}`);
    return token;
  } catch (error) {
    console.error(`❌ Error generating JWT for ${this.email}:`, error);
    throw new Error('Failed to generate authentication token');
  }
};

// 🔧 CORRECTION: Méthode pour comparer les mots de passe plus robuste
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (!candidatePassword) {
      console.warn(`⚠️ Empty password provided for user ${this.email}`);
      return false;
    }
    
    if (!this.mot_de_passe) {
      console.warn(`⚠️ No stored password for user ${this.email}`);
      return false;
    }
    
    console.log(`🔍 Comparing password for user: ${this.email}`);
    const isMatch = await bcrypt.compare(candidatePassword, this.mot_de_passe);
    
    console.log(`${isMatch ? '✅' : '❌'} Password comparison result for ${this.email}: ${isMatch}`);
    return isMatch;
  } catch (error) {
    console.error(`❌ Password comparison error for user ${this.email}:`, error);
    // En cas d'erreur, retourner false pour la sécurité
    return false;
  }
};

// 🔧 CORRECTION: Middleware pre-save plus robuste pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  // Skip si le mot de passe n'est pas modifié
  if (!this.isModified('mot_de_passe')) {
    return next();
  }
  
  try {
    console.log(`🔐 Hashing password for user: ${this.email}`);
    
    // Vérifier que le mot de passe existe
    if (!this.mot_de_passe) {
      throw new Error('Password is required');
    }
    
    // Vérifier que le mot de passe n'est pas déjà hashé
    const isAlreadyHashed = this.mot_de_passe.startsWith('$2');
    if (isAlreadyHashed) {
      console.log(`⚠️ Password already hashed for user: ${this.email}`);
      return next();
    }
    
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const salt = await bcrypt.genSalt(saltRounds);
    this.mot_de_passe = await bcrypt.hash(this.mot_de_passe, salt);
    
    console.log(`✅ Password hashed successfully for user: ${this.email}`);
    next();
  } catch (error) {
    console.error(`❌ Password hashing error for user ${this.email}:`, error);
    next(error);
  }
});

// 🔧 CORRECTION: Middleware pre-save pour vérifier l'expiration des tokens
userSchema.pre('save', function(next) {
  try {
    // Fixer les tokens d'expiration manquants
    if (this.token_verification && !this.token_verification_expiration) {
      console.log(`⚠️ Fixing missing verification token expiration for user: ${this.email}`);
      this.token_verification_expiration = new Date(Date.now() + 604800000); // 7 jours
    }
    
    if (this.password_reset_token && !this.password_reset_expires) {
      console.log(`⚠️ Fixing missing reset token expiration for user: ${this.email}`);
      this.password_reset_expires = new Date(Date.now() + 604800000); // 7 jours
    }
    
    // 🔧 AJOUT: Validation du rôle
    if (this.role && !['user', 'admin', 'superadmin'].includes(this.role)) {
      console.warn(`⚠️ Invalid role "${this.role}" for user ${this.email}, setting to "user"`);
      this.role = 'user';
    }
    
    next();
  } catch (error) {
    console.error(`❌ Error in pre-save middleware for user ${this.email}:`, error);
    next(error);
  }
});

// 🔧 CORRECTION: Méthodes virtuelles plus robustes pour les URLs
userSchema.virtual('photo_profil_url').get(function() {
  try {
    if (!this.photo_profil) return null;
    
    // Si l'URL est déjà absolue, la retourner telle quelle
    if (this.photo_profil.startsWith('http')) return this.photo_profil;
    
    // Sinon, préfixer avec l'URL du backend
    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    return `${backendUrl}${this.photo_profil}`;
  } catch (error) {
    console.error(`❌ Error generating photo_profil_url for user ${this.email}:`, error);
    return null;
  }
});

userSchema.virtual('photo_couverture_url').get(function() {
  try {
    if (!this.photo_couverture) return null;
    
    // Si l'URL est déjà absolue, la retourner telle quelle
    if (this.photo_couverture.startsWith('http')) return this.photo_couverture;
    
    // Sinon, préfixer avec l'URL du backend
    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    return `${backendUrl}${this.photo_couverture}`;
  } catch (error) {
    console.error(`❌ Error generating photo_couverture_url for user ${this.email}:`, error);
    return null;
  }
});

// 🔧 AJOUT: Méthode pour nettoyer les tokens expirés
userSchema.methods.clearExpiredTokens = function() {
  try {
    const now = new Date();
    let modified = false;
    
    // Nettoyer le token de vérification expiré
    if (this.token_verification_expiration && this.token_verification_expiration < now) {
      console.log(`🧹 Clearing expired verification token for user: ${this.email}`);
      this.token_verification = undefined;
      this.token_verification_expiration = undefined;
      modified = true;
    }
    
    // Nettoyer le token de reset expiré
    if (this.password_reset_expires && this.password_reset_expires < now) {
      console.log(`🧹 Clearing expired reset token for user: ${this.email}`);
      this.password_reset_token = undefined;
      this.password_reset_expires = undefined;
      modified = true;
    }
    
    return modified;
  } catch (error) {
    console.error(`❌ Error clearing expired tokens for user ${this.email}:`, error);
    return false;
  }
};

// 🔧 AJOUT: Méthode pour vérifier la validité des tokens
userSchema.methods.isTokenValid = function(tokenType) {
  try {
    const now = new Date();
    
    switch (tokenType) {
      case 'verification':
        return this.token_verification && 
               this.token_verification_expiration && 
               this.token_verification_expiration > now;
      case 'reset':
        return this.password_reset_token && 
               this.password_reset_expires && 
               this.password_reset_expires > now;
      default:
        return false;
    }
  } catch (error) {
    console.error(`❌ Error checking token validity for user ${this.email}:`, error);
    return false;
  }
};

// 🔧 CORRECTION: Index optimisés
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ statut_compte: 1 });
userSchema.index({ derniere_connexion: -1 });
userSchema.index({ token_verification: 1 });
userSchema.index({ password_reset_token: 1 });
userSchema.index({ role: 1 });

// 🔧 AJOUT: Méthode statique pour nettoyer les comptes inactifs
userSchema.statics.cleanupInactiveUsers = async function(daysOld = 30) {
  try {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    const result = await this.deleteMany({
      statut_verification: false,
      date_inscription: { $lt: cutoffDate }
    });
    
    console.log(`🧹 Cleaned up ${result.deletedCount} inactive users older than ${daysOld} days`);
    return result.deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning up inactive users:', error);
    return 0;
  }
};

// 🔧 AJOUT: Transformation JSON pour exclure les champs sensibles
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Supprimer les champs sensibles
  delete user.mot_de_passe;
  delete user.token_verification;
  delete user.password_reset_token;
  delete user.__v;
  
  // Ajouter les URLs virtuelles
  if (this.photo_profil) {
    user.photo_profil_url = this.photo_profil_url;
  }
  if (this.photo_couverture) {
    user.photo_couverture_url = this.photo_couverture_url;
  }
  
  return user;
};

module.exports = model('User', userSchema);