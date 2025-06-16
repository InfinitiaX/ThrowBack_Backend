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