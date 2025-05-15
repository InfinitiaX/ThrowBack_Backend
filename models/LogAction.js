// models/LogAction.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const logActionSchema = new Schema(
  {
    type_action: {
      type: String,
      required: true,
      enum: [
        'INSCRIPTION',
        'CONNEXION',
        'DECONNEXION',
        'EMAIL_VERIFIE',
        'DEMANDE_REINITIALISATION_MDP',
        'MOT_DE_PASSE_REINITIALISE',
        'MOT_DE_PASSE_MODIFIE',
        'COMPTE_VERROUILLE',
        'COMPTE_DEVERROUILLE',
        'PROFIL_MODIFIE',
        'COMPTE_SUPPRIME'
      ]
    },
    description_action: {
      type: String,
      required: true
    },
    id_user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    ip_address: String,
    user_agent: String,
    created_by: {
      type: String,
      default: 'SYSTEM'
    },
    donnees_supplementaires: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: { createdAt: 'date_action', updatedAt: false },
    versionKey: false
  }
);

// Index pour optimiser les requêtes
logActionSchema.index({ type_action: 1 });
logActionSchema.index({ id_user: 1 });
logActionSchema.index({ date_action: -1 });
logActionSchema.index({ ip_address: 1 });

module.exports = model('LogAction', logActionSchema);