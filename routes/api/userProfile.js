// routes/api/userProfile.js
const express = require('express');
const router = express.Router();
const userProfileController = require('../../controllers/userProfileController');
const { protect, authorize } = require('../../middlewares/authMiddleware');
const { logAction } = require('../../middlewares/loggingMiddleware');

/**
 * @route   GET /api/users/:id
 * @desc    Récupérer le profil d'un utilisateur
 * @access  Public/Private
 */
router.get('/:id', userProfileController.getUserProfile);

/**
 * @desc    Récupérer le profil de l'utilisateur connecté
 * @access  Private
 */
router.get('/profile/me', protect, (req, res) => {
  // Rediriger vers la route GET /:id avec l'ID de l'utilisateur connecté
  res.redirect(`/api/users/${req.user.id}`);
});

/**
 * @route   PUT /api/users/profile
 * @desc    Mettre à jour le profil utilisateur
 * @access  Private
 */
router.put('/profile', 
  protect, 
  logAction('MODIFICATION_PROFIL', 'Mise à jour du profil utilisateur'),
  userProfileController.updateProfile
);

/**
 * @route   POST /api/users/profile/photo
 * @desc    Télécharger une photo de profil
 * @access  Private
 */
router.post('/profile/photo', 
  protect, 
  userProfileController.upload.single('photo'),
  logAction('UPLOAD_PHOTO_PROFIL', 'Téléchargement d\'une nouvelle photo de profil'),
  userProfileController.uploadProfilePhoto
);

/**
 * @route   POST /api/users/profile/cover
 * @desc    Télécharger une photo de couverture
 * @access  Private
 */
router.post('/profile/cover', 
  protect, 
  userProfileController.upload.single('photo'),
  logAction('UPLOAD_PHOTO_COUVERTURE', 'Téléchargement d\'une nouvelle photo de couverture'),
  userProfileController.uploadCoverPhoto
);

/**
 * @route   DELETE /api/users/profile/photo
 * @desc    Supprimer la photo de profil
 * @access  Private
 */
router.delete('/profile/photo', 
  protect, 
  logAction('SUPPRESSION_PHOTO_PROFIL', 'Suppression de la photo de profil'),
  userProfileController.deleteProfilePhoto
);

/**
 * @route   DELETE /api/users/profile/cover
 * @desc    Supprimer la photo de couverture
 * @access  Private
 */
router.delete('/profile/cover', 
  protect, 
  logAction('SUPPRESSION_PHOTO_COUVERTURE', 'Suppression de la photo de couverture'),
  userProfileController.deleteCoverPhoto
);

/**
 * @route   GET /api/users/profile/privacy
 * @desc    Récupérer les paramètres de confidentialité
 * @access  Private
 */
router.get('/profile/privacy', 
  protect, 
  userProfileController.getPrivacySettings
);

/**
 * @route   PUT /api/users/profile/privacy
 * @desc    Mettre à jour les paramètres de confidentialité
 * @access  Private
 */
router.put('/profile/privacy', 
  protect, 
  logAction('MISE_A_JOUR_CONFIDENTIALITE', 'Mise à jour des paramètres de confidentialité'),
  userProfileController.updatePrivacySettings
);

/**
 * @route   PUT /api/users/profile/disable
 * @desc    Désactiver un compte
 * @access  Private
 */
router.put('/profile/disable', 
  protect, 
  logAction('DESACTIVATION_COMPTE', 'Désactivation du compte utilisateur'),
  userProfileController.disableAccount
);

/**
 * @route   DELETE /api/users/profile
 * @desc    Supprimer définitivement un compte
 * @access  Private
 */
router.delete('/profile', 
  protect, 
  logAction('SUPPRESSION_COMPTE', 'Suppression définitive du compte utilisateur'),
  userProfileController.deleteAccount
);

module.exports = router;