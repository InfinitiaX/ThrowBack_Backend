// scripts/initializeRoles.js
const connectDB = require('../db');
const Role = require('../models/Role');

const initializeRoles = async () => {
  try {
    // Utiliser votre fonction de connexion existante
    await connectDB();
    
    // Créer le rôle 'user' s'il n'existe pas
    const userRole = await Role.findOne({ libelle_role: 'user' });
    if (!userRole) {
      await Role.create({ libelle_role: 'user', description: 'Utilisateur standard' });
      console.log('✅ Rôle user créé');
    } else {
      console.log('ℹ️  Rôle user existe déjà');
    }
    
    // Créer le rôle 'admin' s'il n'existe pas
    const adminRole = await Role.findOne({ libelle_role: 'admin' });
    if (!adminRole) {
      await Role.create({ libelle_role: 'admin', description: 'Administrateur' });
      console.log('✅ Rôle admin créé');
    } else {
      console.log('ℹ️  Rôle admin existe déjà');
    }
    
    console.log('✅ Initialisation des rôles terminée');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

initializeRoles();