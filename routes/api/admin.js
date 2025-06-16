const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { isAdmin } = require('../../middlewares/authMiddleware');
const adminController = require('../../controllers/adminController');
const videoCtrl = require('../../controllers/videoController');

console.log('Admin API routes loaded');

// Dashboard data (API)
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const recentUsers = await User.find()
      .sort({ date_inscription: -1 })
      .limit(5)
      .select('nom prenom email statut_compte date_inscription');
    // TODO: add videoCount, commentCount, playlistCount when models ready

    res.json({
      userCount,
      videoCount: 12453,
      commentCount: 25741,
      playlistCount: 4385,
      recentUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement du dashboard.' });
  }
});

// Création d'utilisateur (API)
router.post('/users/create', isAdmin, async (req, res) => {
  try {
    const { nom, prenom, email, password, role, statut_compte } = req.body;
    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    }
    const newUser = await User.create({
      nom,
      prenom,
      email,
      mot_de_passe: password,
      role: role || 'user',
      statut_compte: statut_compte || 'ACTIF',
      statut_verification: true,
      date_inscription: Date.now(),
      created_by: req.user.id
    });
    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la création de l'utilisateur." });
  }
});

// Liste des utilisateurs (API)
router.get('/users', isAdmin, async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filtres
    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { nom: { $regex: req.query.search, $options: 'i' } },
        { prenom: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    if (req.query.status) filter.statut_compte = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    // Comptage total pour pagination
    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Récupération des utilisateurs
    const users = await User.find(filter)
      .sort({ date_inscription: -1 })
      .skip(skip)
      .limit(limit)
      .select('-mot_de_passe');

    res.json({
      users,
      total,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs." });
  }
});

// Détail d'un utilisateur (API)
router.get('/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-mot_de_passe');
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des détails utilisateur." });
  }
});

router.put('/users/:id', isAdmin, (req, res, next) => {
  console.log('PUT /users/:id appelé', req.params.id);
  next();
}, adminController.updateUser);

router.delete('/users/:id', isAdmin, adminController.deleteUser);

// === VÉRIFICATION DES FONCTIONS DU CONTRÔLEUR ADMIN ===
// Ces fonctions doivent être définies dans adminController.js

// Si ces fonctions n'existent pas, implémentons des placeholders temporaires
if (!adminController.getUsersAPI) {
  adminController.getUsersAPI = (req, res) => {
    res.status(501).json({ message: "API: getUsersAPI is not implemented yet" });
  };
}

if (!adminController.getUserDetailsAPI) {
  adminController.getUserDetailsAPI = (req, res) => {
    res.status(501).json({ message: "API: getUserDetailsAPI is not implemented yet" });
  };
}

if (!adminController.updateUserStatus) {
  adminController.updateUserStatus = (req, res) => {
    res.status(501).json({ message: "API: updateUserStatus is not implemented yet" });
  };
}

if (!adminController.resetLoginAttempts) {
  adminController.resetLoginAttempts = (req, res) => {
    res.status(501).json({ message: "API: resetLoginAttempts is not implemented yet" });
  };
}

if (!adminController.getUserLogsAPI) {
  adminController.getUserLogsAPI = (req, res) => {
    res.status(501).json({ message: "API: getUserLogsAPI is not implemented yet" });
  };
}

if (!adminController.getLoginAttemptsAPI) {
  adminController.getLoginAttemptsAPI = (req, res) => {
    res.status(501).json({ message: "API: getLoginAttemptsAPI is not implemented yet" });
  };
}

if (!adminController.uploadProfilePhoto) {
  adminController.uploadProfilePhoto = (req, res) => {
    res.status(501).json({ message: "API: uploadProfilePhoto is not implemented yet" });
  };
}

if (!adminController.bulkUpdateStatus) {
  adminController.bulkUpdateStatus = (req, res) => {
    res.status(501).json({ message: "API: bulkUpdateStatus is not implemented yet" });
  };
}

if (!adminController.bulkDeleteUsers) {
  adminController.bulkDeleteUsers = (req, res) => {
    res.status(501).json({ message: "API: bulkDeleteUsers is not implemented yet" });
  };
}

// Routes d'API utilisateurs
router.get('/api/users', isAdmin, adminController.getUsersAPI);
router.get('/api/users/:id', isAdmin, adminController.getUserDetailsAPI);
router.put('/api/users/:id', isAdmin, adminController.updateUser);
router.delete('/api/users/:id', isAdmin, adminController.deleteUser);

// Routes de statut et sécurité utilisateur
router.put('/api/users/:id/status', isAdmin, adminController.updateUserStatus);
router.put('/api/users/:id/reset-login-attempts', isAdmin, adminController.resetLoginAttempts);

// Routes de logs et tentatives
router.get('/api/logs', isAdmin, adminController.getUserLogsAPI);
router.get('/api/login-attempts/:id', isAdmin, adminController.getLoginAttemptsAPI);

// Route de photo de profil
// router.post('/api/users/:id/profile-photo', isAdmin, adminController.uploadProfilePhoto);

// Routes d'opérations groupées
router.put('/api/users/bulk/status', isAdmin, adminController.bulkUpdateStatus);
router.delete('/api/users/bulk/delete', isAdmin, adminController.bulkDeleteUsers);

// ROUTES SPÉCIFIQUES POUR CHAQUE ACTION DE STATUT (ces routes appellent toutes updateUserStatus avec un statut prédéfini)
// Activer un compte
router.put('/users/:id/activate', isAdmin, async (req, res) => {
  req.body.newStatus = 'ACTIF';
  return adminController.updateUserStatus(req, res);
});

// Désactiver un compte
router.put('/users/:id/deactivate', isAdmin, async (req, res) => {
  req.body.newStatus = 'INACTIF';
  return adminController.updateUserStatus(req, res);
});

// Verrouiller un compte
router.put('/users/:id/lock', isAdmin, async (req, res) => {
  req.body.newStatus = 'VERROUILLE';
  return adminController.updateUserStatus(req, res);
});

// Marquer un compte comme supprimé
router.put('/users/:id/mark-deleted', isAdmin, async (req, res) => {
  req.body.newStatus = 'SUPPRIME';
  return adminController.updateUserStatus(req, res);
});




// Routes spéciales
router.put('/api/update-admin-role', adminController.updateAdminRole);

// === VÉRIFICATION DES FONCTIONS DU CONTRÔLEUR VIDEO ===
// Vérification des méthodes du contrôleur vidéo
if (!videoCtrl.listVideosForAdmin) {
  videoCtrl.listVideosForAdmin = (req, res) => {
    res.status(501).json({ message: "API: listVideosForAdmin is not implemented yet" });
  };
}

if (!videoCtrl.getVideoStats) {
  videoCtrl.getVideoStats = (req, res) => {
    res.status(501).json({ message: "API: getVideoStats is not implemented yet" });
  };
}

if (!videoCtrl.createVideo) {
  videoCtrl.createVideo = (req, res) => {
    res.status(501).json({ message: "API: createVideo is not implemented yet" });
  };
}

if (!videoCtrl.getVideoForAdmin) {
  videoCtrl.getVideoForAdmin = (req, res) => {
    res.status(501).json({ message: "API: getVideoForAdmin is not implemented yet" });
  };
}

if (!videoCtrl.updateVideo) {
  videoCtrl.updateVideo = (req, res) => {
    res.status(501).json({ message: "API: updateVideo is not implemented yet" });
  };
}

if (!videoCtrl.deleteVideo) {
  videoCtrl.deleteVideo = (req, res) => {
    res.status(501).json({ message: "API: deleteVideo is not implemented yet" });
  };
}

// Gestion des vidéos (admin) - VERSION CORRIGÉE
router.get('/videos', isAdmin, videoCtrl.listVideosForAdmin);
router.get('/videos/stats', isAdmin, videoCtrl.getVideoStats);
router.post('/videos', isAdmin, videoCtrl.createVideo);
router.get('/videos/:id', isAdmin, videoCtrl.getVideoForAdmin);
router.patch('/videos/:id', isAdmin, videoCtrl.updateVideo);
router.delete('/videos/:id', isAdmin, videoCtrl.deleteVideo);



// ===== ROUTES SHORTS - VERSION CORRIGÉE =====

// Vérification si les fonctions existent avant de les utiliser
const getShortsList = async (req, res) => {
  try {
    // Utiliser listVideosForAdmin avec filtre type: short
    req.query.type = 'short';
    await videoCtrl.listVideosForAdmin(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du chargement des shorts' });
  }
};

const getShortsStats = async (req, res) => {
  try {
    const Video = require('../../models/Video'); // Import direct du modèle
    
    // Stats spécifiques aux shorts
    const totalShorts = await Video.countDocuments({ type: 'short' });
    const recentShorts = await Video.find({ type: 'short' })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('auteur', 'nom prenom');
    
    res.json({
      success: true,
      stats: {
        total: totalShorts,
        recent: recentShorts
      }
    });
  } catch (err) {
    console.error('Error getting shorts stats:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques' });
  }
};

const createShortHandler = async (req, res) => {
  try {
    // Vérifier si createShort existe
    if (typeof videoCtrl.createShort === 'function') {
      await videoCtrl.createShort(req, res);
    } else {
      // Fallback temporaire
      const Video = require('../../models/Video');
      const { titre, artiste, description, youtubeUrl } = req.body;
      const userId = req.user._id || req.user.id;

      // Si c'est un upload de fichier
      if (req.file) {
        const video = await Video.create({
          titre,
          youtubeUrl: `/uploads/shorts/${req.file.filename}`,
          type: 'short',
          duree: req.body.duree ? parseInt(req.body.duree) : undefined,
          artiste,
          description,
          auteur: userId
        });
        return res.status(201).json({ success: true, data: video });
      }

      // Si c'est une URL YouTube (admin)
      if (youtubeUrl) {
        const video = new Video({
          titre,
          youtubeUrl,
          type: 'short',
          artiste,
          description,
          auteur: userId,
          duree: 15 // ← AJOUTER UNE DURÉE PAR DÉFAUT pour YouTube
        });

        // OU utiliser le flag de skip (meilleure solution)
        video._skipDureeValidation = true;
        
        await video.save();
        return res.status(201).json({ success: true, data: video });
      }

      res.status(400).json({ success: false, message: 'Fichier ou URL YouTube requis' });
    }
  } catch (err) {
    console.error('Error creating short:', err);
    res.status(500).json({ error: 'Erreur lors de la création du short' });
  }
};

// Routes shorts
router.get('/shorts', isAdmin, getShortsList);
router.get('/shorts/stats', isAdmin, getShortsStats);

// Import du middleware d'upload
const uploadShort = require('../../middlewares/upload.middleware');
router.post('/shorts', isAdmin, uploadShort.single('videoFile'), createShortHandler);

// Routes utilisant les fonctions existantes
router.get('/shorts/:id', isAdmin, (req, res) => {
  if (typeof videoCtrl.getVideoForAdmin === 'function') {
    videoCtrl.getVideoForAdmin(req, res);
  } else {
    res.status(501).json({ message: "getVideoForAdmin not implemented" });
  }
});

router.patch('/shorts/:id', isAdmin, (req, res) => {
  if (typeof videoCtrl.updateVideo === 'function') {
    videoCtrl.updateVideo(req, res);
  } else {
    res.status(501).json({ message: "updateVideo not implemented" });
  }
});

router.delete('/shorts/:id', isAdmin, (req, res) => {
  if (typeof videoCtrl.deleteVideo === 'function') {
    videoCtrl.deleteVideo(req, res);
  } else {
    res.status(501).json({ message: "deleteVideo not implemented" });
  }
});


module.exports = router;