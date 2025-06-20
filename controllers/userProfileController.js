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
    console.log(' getUserProfile - userId:', userId);
    
    const user = await User.findById(userId)
      .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    if (!user) {
      console.log(' getUserProfile - Utilisateur non trouvé');
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier si le profil est privé et si l'utilisateur a le droit de le voir
    if (user.compte_prive && (!req.user || req.user.id !== user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: "Ce profil est privé"
      });
    }
    
    // Convertir les URLs relatives en URLs absolues pour les images
    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    
    if (user.photo_profil && !user.photo_profil.startsWith('http')) {
      user.photo_profil = `${backendUrl}${user.photo_profil}`;
    }
    
    if (user.photo_couverture && !user.photo_couverture.startsWith('http')) {
      user.photo_couverture = `${backendUrl}${user.photo_couverture}`;
    }
    
    console.log(' getUserProfile - Réponse:', { success: true, data: user });
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error(" Erreur lors de la récupération du profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération du profil",
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour le profil utilisateur
 * @route   PUT /api/users/profile
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  console.log(' updateProfile called for user:', req.user && req.user.id);
  console.log(' req.body:', req.body);
  console.log(' Headers:', req.headers);
  
  try {
    // Validation des données - si elle échoue, on renvoie une réponse d'erreur
    const { error } = updateProfileValidation(req.body);
    if (error) {
      console.log(' Validation error:', error.details[0].message);
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
      'preferences_notification', 'photo_profil'
    ];
    
    const updateData = {};
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'genre' && req.body[field]) {
          // Convertir le genre en format correct
          const genre = req.body[field].toUpperCase();
          if (['HOMME', 'FEMME', 'AUTRE'].includes(genre)) {
            updateData[field] = genre === 'HOMME' ? 'Homme' : 
                              genre === 'FEMME' ? 'Femme' : 'Autre';
          }
        } else {
          updateData[field] = req.body[field];
        }
      }
    });
    
    console.log(' Données à mettre à jour:', updateData);
    
    // Ajouter la date de modification
    updateData.modified_date = Date.now();
    updateData.modified_by = req.user.id;
    
    // Vérifier l'utilisateur avant la mise à jour
    const userBefore = await User.findById(req.user._id);
    console.log(' Utilisateur avant mise à jour:', userBefore ? userBefore._id : 'Non trouvé');
    
    if (!userBefore) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Utiliser findOneAndUpdate au lieu de findByIdAndUpdate
    let user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    )
    .select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');
    
    console.log(' Utilisateur après mise à jour:', user ? user._id : 'Non trouvé');
    
    if (!user) {
      console.log(' Utilisateur non trouvé');
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Convertir les URLs relatives en URLs absolues pour les images
    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    
    if (user.photo_profil && !user.photo_profil.startsWith('http')) {
      user.photo_profil = `${backendUrl}${user.photo_profil}`;
    }
    
    if (user.photo_couverture && !user.photo_couverture.startsWith('http')) {
      user.photo_couverture = `${backendUrl}${user.photo_couverture}`;
    }
    
    // Journaliser l'action
    try {
      await LogAction.create({
        type_action: "PROFIL_MODIFIE",
        description_action: "Mise à jour du profil utilisateur",
        id_user: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: "SYSTEM"
      });
    } catch (logError) {
      console.error(" Erreur lors de la journalisation:", logError);
      // Continue despite log error
    }
    
    console.log(' Profil mis à jour avec succès:', user._id);
    
    res.status(200).json({
      success: true,
      message: "Profil mis à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur lors de la mise à jour du profil:", error);
    console.error(" Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour du profil",
      error: error.message
    });
  }
};

// Configuration de Multer pour l'upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    console.log(' Upload directory:', uploadDir);
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      console.log(' Creating upload directory');
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    console.log(' Original filename:', file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    const filename = `user-${req.user.id}-${uniqueSuffix}${fileExt}`;
    console.log(' Generated filename:', filename);
    cb(null, filename);
  }
});

// Filtrer les types de fichiers
const fileFilter = (req, file, cb) => {
  console.log(' File type check:', file.mimetype);
  // N'accepter que les images
  if (file.mimetype.startsWith('image/')) {
    console.log(' File type accepted');
    cb(null, true);
  } else {
    console.log(' Invalid file type');
    cb(new Error('Seules les images sont autorisées'), false);
  }
};

// Configuration de Multer
const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024,
    files: 1 
  }
});

// Middleware de gestion d'erreur pour Multer
const handleMulterError = (err, req, res, next) => {
  console.error(' Multer error:', err);
  console.log(' Request headers:', req.headers);
  console.log(' Request body:', req.body);
  console.log(' Request file:', req.file);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: "Le fichier est trop volumineux. Taille maximale: 5MB"
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erreur lors de l'upload: ${err.message}`
    });
  }

  // Gérer l'erreur "Unexpected end of form"
  if (err.message === 'Unexpected end of form') {
    return res.status(400).json({
      success: false,
      message: "Le formulaire est incomplet. Assurez-vous d'envoyer le fichier avec le champ 'photo' en utilisant multipart/form-data"
    });
  }

  next(err);
};

// Middleware pour vérifier le Content-Type
const checkContentType = (req, res, next) => {
  console.log(' Checking Content-Type:', req.headers['content-type']);
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      message: "Le Content-Type doit être multipart/form-data"
    });
  }
  next();
};

// Exporter les middlewares et la configuration
exports.upload = upload;
exports.handleMulterError = handleMulterError;
exports.checkContentType = checkContentType;

/**
 * @desc    Upload photo de profil
 * @route   POST /api/users/profile/photo
 * @access  Private
 */
exports.uploadProfilePhoto = async (req, res) => {
  try {
    console.log('📸 uploadProfilePhoto - Demande reçue:', req.file);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucun fichier n'a été uploadé"
      });
    }

    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const fullPhotoUrl = `${backendUrl}${relativePath}`;
    
    console.log(' Chemin relatif:', relativePath);
    console.log(' URL complète:', fullPhotoUrl);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_profil: relativePath, // Stocker le chemin relatif dans la base de données
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Remplacer par l'URL complète dans la réponse
    user.photo_profil = fullPhotoUrl;

    console.log(' Photo de profil mise à jour:', user.photo_profil);

    res.status(200).json({
      success: true,
      message: "Photo de profil mise à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur lors de l'upload de la photo de profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de profil",
      error: error.message
    });
  }
};

/**
 * @desc    Upload photo de couverture
 * @route   POST /api/users/profile/cover
 * @access  Private
 */
exports.uploadCoverPhoto = async (req, res) => {
  try {
    console.log(' uploadCoverPhoto - Demande reçue:', req.file);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucun fichier n'a été uploadé"
      });
    }

    const backendUrl = process.env.BACKEND_URL || 'https://throwback-backend.onrender.com';
    const relativePath = `/uploads/profiles/${req.file.filename}`;
    const fullPhotoUrl = `${backendUrl}${relativePath}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        photo_couverture: relativePath, // Stocker le chemin relatif dans la base de données
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('-mot_de_passe -reset_password_token -reset_password_expire -token_verification');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Remplacer par l'URL complète dans la réponse
    user.photo_couverture = fullPhotoUrl;

    res.status(200).json({
      success: true,
      message: "Photo de couverture mise à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error(" Erreur lors de l'upload de la photo de couverture:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'upload de la photo de couverture",
      error: error.message
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

    // Supprimer l'ancienne photo si elle existe
    if (user.photo_profil) {
      const oldPhotoPath = path.join(__dirname, '..', user.photo_profil);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    user.photo_profil = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Photo de profil supprimée avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la photo de profil:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo de profil"
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

    // Supprimer l'ancienne photo si elle existe
    if (user.photo_couverture) {
      const oldPhotoPath = path.join(__dirname, '..', user.photo_couverture);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    user.photo_couverture = undefined;
    user.modified_date = Date.now();
    user.modified_by = req.user.id;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Photo de couverture supprimée avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la photo de couverture:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la photo de couverture"
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
      .select('compte_prive preferences_confidentialite');
    
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
        preferences_confidentialite: user.preferences_confidentialite
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des paramètres de confidentialité:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des paramètres de confidentialité"
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
    const { compte_prive, preferences_confidentialite } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        compte_prive,
        preferences_confidentialite,
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    ).select('compte_prive preferences_confidentialite');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    res.status(200).json({
      success: true,
      message: "Paramètres de confidentialité mis à jour avec succès",
      data: user
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des paramètres de confidentialité:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour des paramètres de confidentialité"
    });
  }
};

/**
 * @desc    Désactiver le compte
 * @route   PUT /api/users/profile/disable
 * @access  Private
 */
exports.disableAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        compte_active: false,
        date_desactivation: Date.now(),
        modified_date: Date.now(),
        modified_by: req.user.id
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    res.status(200).json({
      success: true,
      message: "Compte désactivé avec succès"
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
 * @desc    Supprimer le compte
 * @route   DELETE /api/users/profile
 * @access  Private
 */
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }

    // Supprimer les photos si elles existent
    if (user.photo_profil) {
      const photoPath = path.join(__dirname, '..', user.photo_profil);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }
    if (user.photo_couverture) {
      const coverPath = path.join(__dirname, '..', user.photo_couverture);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    // Supprimer l'utilisateur
    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({
      success: true,
      message: "Compte supprimé avec succès"
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du compte:", error);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression du compte"
    });
  }
};

// Exporter toutes les fonctions du contrôleur
module.exports = {
  ...exports,
  getUserProfile: exports.getUserProfile,
  updateProfile: exports.updateProfile,
  uploadProfilePhoto: exports.uploadProfilePhoto,
  uploadCoverPhoto: exports.uploadCoverPhoto,
  deleteProfilePhoto: exports.deleteProfilePhoto,
  deleteCoverPhoto: exports.deleteCoverPhoto,
  getPrivacySettings: exports.getPrivacySettings,
  updatePrivacySettings: exports.updatePrivacySettings,
  disableAccount: exports.disableAccount,
  deleteAccount: exports.deleteAccount
};