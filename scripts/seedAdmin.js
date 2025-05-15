// scripts/seedAdmin.js - Version corrigée
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Role = require('../models/Role');

// Configuration Mongoose pour éviter les warnings
mongoose.set('strictQuery', false);

async function seedAdmin() {
  try {
    console.log('🔗 Connexion à MongoDB...');
    console.log('📍 URL de connexion:', process.env.MONGO_URI);
    
    // Connexion à MongoDB avec options améliorées
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout après 5 secondes
      socketTimeoutMS: 45000, // Fermer les sockets après 45 secondes d'inactivité
    });
    
    console.log('✅ Connecté à MongoDB');
    console.log('📊 Base de données:', mongoose.connection.db.databaseName);

    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ email: 'admin@throwback.com' });
    if (existingAdmin) {
      console.log('ℹ️  Un admin existe déjà avec l\'email admin@throwback.com');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Nom:', existingAdmin.prenom, existingAdmin.nom);
      await mongoose.connection.close();
      return;
    }

    // Créer ou récupérer le rôle admin
    let adminRole = await Role.findOne({ libelle_role: 'admin' });
    if (!adminRole) {
      adminRole = await Role.create({
        libelle_role: 'admin',
        description: 'Administrator with full system access'
      });
      console.log('✅ Rôle admin créé');
    } else {
      console.log('ℹ️  Rôle admin existe déjà');
    }

    // Créer l'utilisateur admin
    const adminData = {
      nom: 'Administrator',
      prenom: 'System',
      email: 'admin@throwback.com',
      mot_de_passe: 'Admin@2024!', // Mot de passe par défaut (à changer)
      statut_compte: 'ACTIF',
      statut_verification: true, // Admin vérifié par défaut
      roles: [adminRole._id],
      created_by: 'SEEDER'
    };

    // Créer l'admin
    const admin = new User(adminData);
    await admin.save();

    console.log('🎉 Admin créé avec succès !');
    console.log('📧 Email:', admin.email);
    console.log('🔐 Mot de passe temporaire: Admin@2024!');
    console.log('⚠️  IMPORTANT: Changez ce mot de passe lors de la première connexion');
    console.log('👤 ID:', admin._id);

    // Fermer la connexion
    await mongoose.connection.close();
    console.log('✅ Connexion fermée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:');
    console.error('Type d\'erreur:', error.constructor.name);
    console.error('Message:', error.message);
    
    if (error.cause) {
      console.error('Cause:', error.cause.message);
    }
    
    // Suggestions de résolution
    console.log('\n🔧 Suggestions de résolution:');
    console.log('1. Vérifiez votre fichier .env et la variable MONGO_URI');
    console.log('2. Assurez-vous que MongoDB est démarré');
    console.log('3. Vérifiez votre connexion internet');
    console.log('4. Vérifiez que l\'IP 65.62.32.228 est accessible');
    
    // Fermer la connexion si elle existe
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

// Script pour créer un admin personnalisé
async function createCustomAdmin() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log('🔗 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connecté à MongoDB');

    // Demander les informations de l'admin
    const email = await askQuestion(rl, 'Email de l\'admin: ');
    const prenom = await askQuestion(rl, 'Prénom: ');
    const nom = await askQuestion(rl, 'Nom: ');
    const password = await askQuestion(rl, 'Mot de passe: ');

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ Un utilisateur avec cet email existe déjà');
      process.exit(1);
    }

    // Créer ou récupérer le rôle admin
    let adminRole = await Role.findOne({ libelle_role: 'admin' });
    if (!adminRole) {
      adminRole = await Role.create({
        libelle_role: 'admin',
        description: 'Administrator with full system access'
      });
    }

    // Créer l'admin personnalisé
    const admin = new User({
      nom,
      prenom,
      email: email.toLowerCase(),
      mot_de_passe: password,
      statut_compte: 'ACTIF',
      statut_verification: true,
      roles: [adminRole._id],
      created_by: 'CUSTOM_SEEDER'
    });

    await admin.save();

    console.log('🎉 Admin personnalisé créé avec succès !');
    console.log('📧 Email:', admin.email);
    console.log('👤 Nom:', admin.prenom, admin.nom);
    console.log('👤 ID:', admin._id);

    rl.close();
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    rl.close();
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Helper function pour poser des questions
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Script pour lister tous les admins
async function listAdmins() {
  try {
    console.log('🔗 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connecté à MongoDB');

    const adminRole = await Role.findOne({ libelle_role: 'admin' });
    if (!adminRole) {
      console.log('❌ Aucun rôle admin trouvé');
      return;
    }

    const admins = await User.find({ roles: adminRole._id })
      .select('nom prenom email statut_compte statut_verification date_inscription')
      .populate('roles', 'libelle_role');

    console.log(`\n📋 Liste des administrateurs (${admins.length}):`);
    console.log('─'.repeat(80));
    
    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.prenom} ${admin.nom}`);
      console.log(`   📧 Email: ${admin.email}`);
      console.log(`   📊 Statut: ${admin.statut_compte} (Vérifié: ${admin.statut_verification ? 'Oui' : 'Non'})`);
      console.log(`   📅 Créé le: ${admin.date_inscription ? admin.date_inscription.toLocaleDateString() : 'N/A'}`);
      console.log('');
    });

    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Script de diagnostic de connexion
async function diagnoseMongo() {
  console.log('🔍 Diagnostic de la connexion MongoDB...\n');
  
  // Vérifier les variables d'environnement
  console.log('📋 Variables d\'environnement:');
  console.log('MONGO_URI:', process.env.MONGO_URI || '❌ NON DÉFINIE');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('');
  
  // Analyser l'URI MongoDB
  if (process.env.MONGO_URI) {
    try {
      const url = new URL(process.env.MONGO_URI);
      console.log('🔗 Analyse de l\'URI MongoDB:');
      console.log('Protocol:', url.protocol);
      console.log('Host:', url.hostname);
      console.log('Port:', url.port || '27017');
      console.log('Database:', url.pathname.substring(1));
      console.log('');
    } catch (err) {
      console.log('❌ URI MongoDB invalide:', err.message);
    }
  }
  
  // Tenter la connexion avec différents timeouts
  const timeouts = [5000, 10000, 30000];
  
  for (const timeout of timeouts) {
    console.log(`⏱️  Test de connexion avec timeout ${timeout}ms...`);
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: timeout,
        socketTimeoutMS: timeout,
      });
      
      console.log('✅ Connexion réussie !');
      console.log('📊 Base de données:', mongoose.connection.db.databaseName);
      await mongoose.connection.close();
      return;
      
    } catch (error) {
      console.log(`❌ Échec avec timeout ${timeout}ms:`, error.message);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  }
  
  console.log('\n💡 Solutions suggérées:');
  console.log('1. Vérifiez que MongoDB est démarré sur votre machine');
  console.log('2. Vérifiez vos paramètres de pare-feu');
  console.log('3. Essayez "mongodb://localhost:27017/throwback" pour une connexion locale');
  console.log('4. Vérifiez la connectivité réseau vers 65.62.32.228');
}

// Gestion des arguments de ligne de commande
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'default':
    seedAdmin();
    break;
  case 'custom':
    createCustomAdmin();
    break;
  case 'list':
    listAdmins();
    break;
  case 'diagnose':
    diagnoseMongo();
    break;
  default:
    console.log('📖 Usage:');
    console.log('  node scripts/seedAdmin.js default    - Créer un admin par défaut');
    console.log('  node scripts/seedAdmin.js custom     - Créer un admin personnalisé');
    console.log('  node scripts/seedAdmin.js list       - Lister tous les admins');
    console.log('  node scripts/seedAdmin.js diagnose   - Diagnostiquer la connexion MongoDB');
    break;
}

module.exports = { seedAdmin, createCustomAdmin, listAdmins, diagnoseMongo };