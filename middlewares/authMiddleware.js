// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// Middleware to protect routes that require authentication
const protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id).populate('roles');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token.'
    });
  }
};


// Middleware for routes that should only be accessible to guests (non-authenticated users)
const guest = (req, res, next) => {
  // For API routes, we'll be more lenient with the guest middleware
  // since password reset doesn't require authentication
  next();
};

// Middleware to check user roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.'
      });
    }
    
    // Check if user has required role
    const userRoles = req.user.roles.map(role => role.libelle_role);
    const hasRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    
    next();
  };
};


/**
 * Middleware pour vérifier les rôles et permissions
 * @param {Array|String} roles - Rôle(s) autorisé(s)
 */
exports.authorize = (roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Accès non autorisé. Veuillez vous connecter."
      });
    }
    
    // Convertir en tableau si c'est une chaîne
    if (typeof roles === 'string') {
      roles = [roles];
    }
    
    // Récupérer les infos complètes de l'utilisateur avec ses rôles
    const user = await User.findById(req.user.id).populate('roles');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé"
      });
    }
    
    // Vérifier si l'utilisateur a au moins un des rôles requis
    const userRoles = user.roles.map(role => role.libelle_role);
    const hasRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: "Accès refusé. Vous n'avez pas les permissions nécessaires."
      });
    }
    
    next();
  };
};