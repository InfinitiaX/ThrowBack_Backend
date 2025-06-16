// middlewares/optionalAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

/**
 * Middleware d'authentification optionnelle
 * Permet aux endpoints d'être accessibles aux utilisateurs connectés et non-connectés
 * mais ajoute les informations utilisateur si disponibles
 */
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    
    if (!header || !header.startsWith('Bearer ')) {
      // Pas de token, continuer sans utilisateur
      req.user = null;
      return next();
    }
    
    const token = header.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Récupère l'utilisateur complet
      const user = await User.findById(decoded.id).populate('roles', 'libelle_role');
      
      if (user) {
        // Expose un objet avec _id **et** id (string) + tous les autres champs
        req.user = {
          ...user.toObject(),
          id: user._id.toString()
        };
      } else {
        req.user = null;
      }
    } catch (tokenError) {
      // Token invalide, continuer sans utilisateur
      req.user = null;
    }
    
    next();
  } catch (err) {
    console.error('Optional auth middleware error:', err);
    req.user = null;
    next();
  }
};

module.exports = optionalAuth;