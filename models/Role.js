// models/Role.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const roleSchema = new Schema(
  {
    libelle_role: { 
      type: String, 
      required: true,
      unique: true,
      enum: ['user', 'admin'] 
    },
    description: String,
    created_by: { type: String, default: 'SYSTEM' },
    modified_by: String
  },
  {
    timestamps: { createdAt: 'creation_date', updatedAt: 'modified_date' },
    versionKey: false
  }
);

// Export direct du modèle
module.exports = model('Role', roleSchema);