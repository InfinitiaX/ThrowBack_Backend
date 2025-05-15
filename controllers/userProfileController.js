// controllers/userProfileController.js
const User = require('../models/User');
const LogAction = require('../models/LogAction');
const { updateProfileValidation } = require('../utils/authValidation');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

/**
 * @desc    Récupérer le profil d'un utilisateur
 * @route   GET /api/users/:id
 * @access  Private/Public selon les paramètres de confidentialité
 */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findById(userId)
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification')
      .populate('roles', 'libelle_role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier si le profil est privé et si l'utilisateur a le droit de le voir
    if (user.compte_prive && (!req.user || req.user.id !== user._id.toString())) {
      // TODO: Vérifier si l'utilisateur connecté est ami avec l'utilisateur demandé
      // Pour l'instant, on refuse simplement l'accès
      return res.status(403).json({
        success: false,
        message: "Ce profil est privé"
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération du profil"
    });
  }
};

/**
 * @desc    Mettre à jour le profil utilisateur
 * @route   PUT /api/users/profile
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    // Validation des données
    const { error } = updateProfileValidation(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    
    // Champs autorisés à mettre à jour
    const updatableFields = [
      'nom', 'prenom', 'bio', 'date_naissance', 'genre',
      'pays', 'ville', 'adresse', 'code_postal', 'telephone',
      'profession', 'compte_prive', 'preferences_confidentialite',
      'preferences_notification'
    ];
    
    const updateData = {};
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    
    // Ajouter la date de modification
    updateData.modified_date = Date.now();
    updateData.modified_by = req.user.id;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "MODIFICATION_PROFIL",
      description_action: "Mise à jour du profil utilisateur",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Profil mis à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour du profil"
    });
  }
};

// Configuration de Multer pour l'upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, `user-${req.user.id}-${uniqueSuffix}${fileExt}`);
  }
});

// Filtrer les types de fichiers
const fileFilter = (req, file, cb) => {
  // N'accepter que les images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées'), false);
  }
};

exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Limite à 5MB
});

/**
 * @desc    Télécharger une photo de profil
 * @route   POST /api/users/profile/photo
 * @access  Private
 */
exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucune image n'a été téléchargée"
      });
    }
    
    // Chemin relatif pour l'accès à l'image
    const photoPath = `/uploads/profiles/${req.file.filename}`;
    
    // Mettre à jour l'utilisateur avec le chemin de la photo
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_profil: photoPath,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      // Supprimer le fichier si l'utilisateur n'existe pas
      fs.unlinkSync(path.join(__dirname, '..', req.file.path));
      
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "UPLOAD_PHOTO_PROFIL",
      description_action: "Téléchargement d'une nouvelle photo de profil",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Photo de profil mise à jour avec succès",
      data: {
        photo_profil: user.photo_profil
      }
    });
  } catch (error) {
    console.error("Erreur lors du téléchargement de la photo de profil:", error);
    
    // Supprimer le fichier en cas d'erreur
    if (req.file) {
      fs.unlinkSync(path.join(__dirname, '..', req.file.path));
    }
    
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du téléchargement de la photo"
    });
  }
};

/**
 * @desc    Télécharger une photo de couverture
 * @route   POST /api/users/profile/cover
 * @access  Private
 */
exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucune image n'a été téléchargée"
      });
    }
    
    // Chemin relatif pour l'accès à l'image
    const photoPath = `/uploads/profiles/${req.file.filename}`;
    
    // Mettre à jour l'utilisateur avec le chemin de la photo
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_couverture: photoPath,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      // Supprimer le fichier si l'utilisateur n'existe pas
      fs.unlinkSync(path.join(__dirname, '..', req.file.path));
      
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "UPLOAD_PHOTO_COUVERTURE",
      description_action: "Téléchargement d'une nouvelle photo de couverture",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Photo de couverture mise à jour avec succès",
      data: {
        photo_couverture: user.photo_couverture
      }
    });
  } catch (error) {
    console.error("Erreur lors du téléchargement de la photo de couverture:", error);
    
    // Supprimer le fichier en cas d'erreur
    if (req.file) {
      fs.unlinkSync(path.join(__dirname, '..', req.file.path));
    }
    
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du téléchargement de la photo"
    });
  }
};

/**
 * @desc    Supprimer la photo de profil
 * @route   DELETE /api/users/profile/photo
 * @access  Private
 */
exports.deleteProfilePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur a une photo de profil
    if (!user.photo_profil) {
      return res.status(400).json({
        success: false,
        message: "Aucune photo de profil à supprimer"
      });
    }
    
    // Chemin complet du fichier
    const photoPath = path.join(__dirname, '..', user.photo_profil);
    
    // Supprimer le fichier s'il existe
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
    
    // Mettre à jour l'utilisateur
    user.photo_profil = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "SUPPRESSION_PHOTO_PROFIL",
      description_action: "Suppression de la photo de profil",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Photo de profil supprimée avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la photo de profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo"
    });
  }
};

/**
 * @desc    Supprimer la photo de couverture
 * @route   DELETE /api/users/profile/cover
 * @access  Private
 */
exports.deleteCoverPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur a une photo de couverture
    if (!user.photo_couverture) {
      return res.status(400).json({
        success: false,
        message: "Aucune photo de couverture à supprimer"
      });
    }
    
    // Chemin complet du fichier
    const photoPath = path.join(__dirname, '..', user.photo_couverture);
    
    // Supprimer le fichier s'il existe
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
    
    // Mettre à jour l'utilisateur
    user.photo_couverture = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "SUPPRESSION_PHOTO_COUVERTURE",
      description_action: "Suppression de la photo de couverture",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Photo de couverture supprimée avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la photo de couverture:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo"
    });
  }
};

/**
 * @desc    Récupérer les paramètres de confidentialité
 * @route   GET /api/users/profile/privacy
 * @access  Private
 */
exports.getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('compte_prive preferences_confidentialite preferences_notification');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        compte_prive: user.compte_prive,
        preferences_confidentialite: user.preferences_confidentialite || {},
        preferences_notification: user.preferences_notification || {}
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres de confidentialité:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des paramètres"
    });
  }
};

/**
 * @desc    Mettre à jour les paramètres de confidentialité
 * @route   PUT /api/users/profile/privacy
 * @access  Private
 */
exports.updatePrivacySettings = async (req, res) => {
  try {
    const { compte_prive, preferences_confidentialite, preferences_notification } = req.body;
    
    const updateData = {};
    
    if (compte_prive !== undefined) {
      updateData.compte_prive = compte_prive;
    }
    
    if (preferences_confidentialite) {
      updateData.preferences_confidentialite = preferences_confidentialite;
    }
    
    if (preferences_notification) {
      updateData.preferences_notification = preferences_notification;
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Aucune donnée fournie pour la mise à jour"
      });
    }
    
    // Ajouter la date de modification
    updateData.modified_date = Date.now();
    updateData.modified_by = req.user.id;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    ).select('compte_prive preferences_confidentialite preferences_notification');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "MISE_A_JOUR_CONFIDENTIALITE",
      description_action: "Mise à jour des paramètres de confidentialité",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Paramètres de confidentialité mis à jour avec succès",
      data: {
        compte_prive: user.compte_prive,
        preferences_confidentialite: user.preferences_confidentialite,
        preferences_notification: user.preferences_notification
      }
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des paramètres de confidentialité:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour des paramètres"
    });
  }
};

/**
 * @desc    Désactiver un compte
 * @route   PUT /api/users/profile/disable
 * @access  Private
 */
exports.disableAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Mettre à jour le statut du compte
    user.statut_compte = "INACTIF";
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();
    
    // Journaliser l'action
    await LogAction.create({
      type_action: "DESACTIVATION_COMPTE",
      description_action: "Désactivation du compte utilisateur",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Votre compte a été désactivé avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la désactivation du compte:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la désactivation du compte"
    });
  }
};

/**
 * @desc    Supprimer définitivement un compte
 * @route   DELETE /api/users/profile
 * @access  Private
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe est requis pour confirmer la suppression"
      });
    }
    
    const user = await User.findById(req.user.id).select('+mot_de_passe');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Mot de passe incorrect"
      });
    }
    
    // Journaliser l'action avant la suppression
    await LogAction.create({
      type_action: "SUPPRESSION_COMPTE",
      description_action: "Suppression définitive du compte utilisateur",
      id_user: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    // Supprimer les photos de profil et de couverture
    if (user.photo_profil) {
      const profilePhotoPath = path.join(__dirname, '..', user.photo_profil);
      if (fs.existsSync(profilePhotoPath)) {
        fs.unlinkSync(profilePhotoPath);
      }
    }
    
    if (user.photo_couverture) {
      const coverPhotoPath = path.join(__dirname, '..', user.photo_couverture);
      if (fs.existsSync(coverPhotoPath)) {
        fs.unlinkSync(coverPhotoPath);
      }
    }
    
    // Supprimer l'utilisateur
    await User.findByIdAndDelete(req.user.id);
    
    res.status(200).json({
      success: true,
      message: "Votre compte a été supprimé définitivement"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du compte:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression du compte"
    });
  }
};