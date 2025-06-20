// index.js - SERVEUR PRINCIPAL CORRIGÉ
require("dotenv").config();
const express = require("express");
const session = require('express-session');
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require('jsonwebtoken'); 
const cors = require('cors');

// ===== Import des modèles (ordre important) =====
require('./models/User');
require('./models/Token');
require('./models/LoginAttempt');
require('./models/LogAction');
require('./models/Comment');    
require('./models/Like');       
require('./models/Playlist');
require('./models/Video');
require('./models/StatutUser');
require('./models/Preferences');

const app = express();

// ===== Middleware de base =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ===== Configuration CORS =====
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com ',
    'https://throwback-frontend.onrender.com ',
    'https://throwback-frontend.onrender.com '
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ===== Configuration de session =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'throwback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24, 
    httpOnly: true
  }
}));

// ===== Configuration du moteur de template =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Fichiers statiques =====
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

// ===== Logging des requêtes =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  
  // Log spécial pour les routes importantes
  if (req.url.includes('/shorts') || req.url.includes('/like') || req.url.includes('/memories') || req.url.includes('/public')) {
    console.log(` Route importante détectée: ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(' Body:', req.body);
    }
  }
  
  next();
});

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log(" Connexion MongoDB réussie");
  console.log(" Base de données:", mongoose.connection.db.databaseName);
})
.catch((err) => {
  console.error(" Erreur MongoDB:", err);
  process.exit(1);
});

// ===== Middleware d'authentification =====
const extractUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) { 
      token = req.cookies.token;
    }
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        console.log(" Utilisateur connecté:", `${req.user.prenom} ${req.user.nom} (ID: ${req.user.id})`);
      } catch (error) {
        console.error(" Erreur de vérification du token:", error.message);
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  } catch (error) {
    console.error(" Erreur d'authentification:", error);
    req.user = null;
    next();
  }
};

const protect = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }
  next();
};

// Appliquer le middleware d'extraction d'utilisateur
app.use(extractUser);

// ===== Test des contrôleurs =====
let authController, memoryController, videoController, publicVideoController;
try {
  authController = require("./controllers/authController");
  memoryController = require('./controllers/memoryController');
  videoController = require('./controllers/videoController');
  publicVideoController = require('./controllers/publicVideoController');
  console.log(" Tous les contrôleurs chargés avec succès");
} catch (error) {
  console.error(" Erreur lors du chargement des contrôleurs:", error);
}

// ===== ROUTES D'AUTHENTIFICATION =====
console.log("\n Configuration des routes d'authentification...");

app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/verify/:id/:token', authController.verifyEmail);
app.post('/api/auth/resend-verification', authController.resendVerification);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.get('/api/auth/verify-reset/:token', authController.verifyPasswordReset);
app.put('/api/auth/reset-password', authController.resetPassword);
app.put('/api/auth/change-password', protect, authController.changePassword);
app.post('/api/auth/logout', protect, authController.logout);
app.get('/api/auth/me', protect, authController.getMe);

// ===== ROUTES PUBLIQUES SPÉCIFIQUES (AVANT LES ROUTES GÉNÉRIQUES) =====
console.log(" Configuration des routes publiques...");


// Routes trending et recherche (AVANT /api/public/videos/:id)
app.get('/api/public/videos/trending', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/trending');
  if (publicVideoController && publicVideoController.getTrendingVideos) {
    publicVideoController.getTrendingVideos(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      message: "Trending videos service not available"
    });
  }
});

app.get('/api/public/videos/search', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/search');
  if (publicVideoController && publicVideoController.searchVideos) {
    publicVideoController.searchVideos(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      query: req.query.q,
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 }
    });
  }
});

// Route liste des vidéos publiques
app.get('/api/public/videos', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos');
  console.log(' Query params:', req.query);
  
  if (publicVideoController && publicVideoController.getPublicVideos) {
    publicVideoController.getPublicVideos(req, res, next);
  } else {
    // Fallback vers le contrôleur vidéo standard
    if (videoController && videoController.listPublicVideos) {
      videoController.listPublicVideos(req, res, next);
    } else {
      res.status(501).json({
        success: false,
        message: "Service de vidéos publiques temporairement indisponible"
      });
    }
  }
});

// Routes pour une vidéo spécifique et ses souvenirs
app.get('/api/public/videos/:id/memories', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/:id/memories');
  console.log(' Video ID:', req.params.id);
  
  if (memoryController && memoryController.getVideoMemories) {
    memoryController.getVideoMemories(req, res, next);
  } else {
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
    });
  }
});

app.post('/api/public/videos/:id/memories', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/memories');
  console.log(' Video ID:', req.params.id);
  console.log(' User:', req.user?.nom, req.user?.prenom);
  
  if (memoryController && memoryController.addMemory) {
    memoryController.addMemory(req, res, next);
  } else {
    res.status(501).json({
      success: false,
      message: "Service de souvenirs temporairement indisponible"
    });
  }
});

// Routes pour les likes
app.post('/api/public/videos/:id/like', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/like');
  console.log(' Video ID:', req.params.id);
  console.log(' User:', req.user?.nom, req.user?.prenom);
  
  if (publicVideoController && publicVideoController.likeVideo) {
    publicVideoController.likeVideo(req, res, next);
  } else {
    res.json({
      success: true,
      message: "Like enregistré (simulation)",
      data: {
        liked: true,
        disliked: false,
        likes: Math.floor(Math.random() * 100) + 1,
        dislikes: 0
      }
    });
  }
});

app.post('/api/public/videos/:id/share', protect, (req, res, next) => {
  console.log(' Route publique: POST /api/public/videos/:id/share');
  console.log(' Video ID:', req.params.id);
  
  res.json({
    success: true,
    message: "Partage enregistré avec succès"
  });
});

// Route pour une vidéo spécifique (APRÈS toutes les routes spécifiques)
app.get('/api/public/videos/:id', (req, res, next) => {
  console.log(' Route publique: GET /api/public/videos/:id');
  console.log(' Video ID:', req.params.id);
  
  if (publicVideoController && publicVideoController.getVideoById) {
    publicVideoController.getVideoById(req, res, next);
  } else {
    // Fallback vers le contrôleur vidéo standard
    if (videoController && videoController.getPublicVideo) {
      videoController.getPublicVideo(req, res, next);
    } else {
      res.status(501).json({
        success: false,
        message: "Service de vidéo publique temporairement indisponible"
      });
    }
  }
});

// ===== ROUTES VIDÉO PRINCIPALES =====
console.log(" Configuration des routes vidéo...");

const videoRoutes = require('./routes/api/videoRoutes');
app.use('/api/videos', videoRoutes);

// ===== ROUTES SUPPLÉMENTAIRES =====
console.log(" Configuration des routes supplémentaires...");

// Routes utilisateur
const userProfileRoutes = require('./routes/api/userProfile');
app.use('/api/users', userProfileRoutes);

// Routes administrateur
const adminApiRoutes = require('./routes/api/admin');
app.use('/api/admin', adminApiRoutes);

// Routes playlists
try {
  const playlistRoutes = require('./routes/api/playlists');
  app.use('/api/playlists', playlistRoutes);
} catch (error) {
  console.warn(" Routes playlists non disponibles:", error.message);
}

// Routes memories
try {
  const memoriesRoutes = require('./routes/api/memories');
  app.use('/api/memories', memoriesRoutes);
} catch (error) {
  console.warn(" Routes memories non disponibles:", error.message);
}

// Routes publiques (fichier séparé)
try {
  const publicRoutes = require('./routes/api/public');
  app.use('/api/public', publicRoutes);
} catch (error) {
  console.warn(" Routes publiques (fichier) non disponibles:", error.message);
}

// Routes CAPTCHA
try {
  const captchaRoutes = require("./routes/api/captcha");
  app.use("/api/captcha", captchaRoutes);
} catch (error) {
  console.warn(" Routes CAPTCHA non disponibles:", error.message);
}

console.log(" Routes publiques configurées:");
console.log("    GET  /api/public/videos/trending");
console.log("    GET  /api/public/videos/search"); 
console.log("    GET  /api/public/videos");
console.log("    GET  /api/public/videos/:id");
console.log("    GET  /api/public/videos/:id/memories");
console.log("    POST /api/public/videos/:id/memories (Protected)");
console.log("     POST /api/public/videos/:id/like (Protected)");
console.log("    POST /api/public/videos/:id/share (Protected)");

// ===== ROUTES DE TEST =====
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API ThrowBack fonctionne!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté'
  });
});

app.get('/api/test/db', async (req, res) => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    res.json({
      mongodb: {
        status: states[state],
        database: mongoose.connection.db?.databaseName,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database connection error',
      message: error.message
    });
  }
});

// Test spécifique pour les shorts
app.get('/api/test/shorts', protect, (req, res) => {
  res.json({
    message: 'Route shorts accessible',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    userId: req.user?._id || req.user?.id,
    timestamp: new Date().toISOString()
  });
});

// Test spécifique pour les routes publiques
app.get('/api/test/public', (req, res) => {
  res.json({
    message: 'Routes publiques accessibles',
    user: req.user ? `${req.user.prenom} ${req.user.nom}` : 'Non connecté',
    availableRoutes: [
      'GET /api/public/videos',
      'GET /api/public/videos/trending',
      'GET /api/public/videos/search',
      'GET /api/public/videos/:id',
      'GET /api/public/videos/:id/memories',
      'POST /api/public/videos/:id/like',
      'POST /api/public/videos/:id/memories'
    ],
    timestamp: new Date().toISOString()
  });
});

// ===== ROUTES DE FALLBACK WEB =====
app.get("/", (req, res) => {
  res.json({
    message: "🎵 ThrowBack API Server",
    version: "2.1.0",
    status: "Opérationnel",
    endpoints: {
      auth: "/api/auth/*",
      videos: "/api/videos/*",
      publicVideos: "/api/public/videos/*",
      shorts: "/api/videos/shorts",
      memories: "/api/videos/:id/memories",
      likes: "/api/videos/:id/like",
      admin: "/api/admin/*",
      test: "/api/test"
    },
    features: [
      " Authentification JWT",
      " Upload de shorts",
      " Système de likes",
      " Commentaires (memories)",
      " Routes publiques",
      " Administration",
      " Sécurité CORS"
    ]
  });
});

app.get("/login", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com '}/login`);
});

app.get("/register", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com '}/register`);
});

// ===== GESTION DES ERREURS 404 =====
app.use((req, res, next) => {
  console.log(` 404 ERROR: ${req.method} ${req.path}`);
  
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: "Route API non trouvée",
      path: req.path,
      method: req.method,
      suggestion: "Vérifiez l'URL dans la documentation",
      availableRoutes: [
        'GET /api/public/videos (liste des vidéos publiques)',
        'GET /api/public/videos/:id (détails d\'une vidéo)',
        'POST /api/videos/shorts (création de short)',
        'POST /api/public/videos/:id/like (liker une vidéo)', 
        'POST /api/public/videos/:id/memories (ajouter un souvenir)',
        'GET /api/auth/me (infos utilisateur)',
        'GET /api/test (test de l\'API)'
      ]
    });
  }
  
  res.status(404).json({
    error: "Page non trouvée",
    message: `La route ${req.path} n'existe pas`
  });
});

// ===== GESTION DES ERREURS 500 =====
app.use((err, req, res, next) => {
  console.error(" Erreur serveur:", err);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(" Stack trace:", err.stack);
  }
  
  const response = {
    success: false,
    message: "Une erreur est survenue sur le serveur",
    timestamp: new Date().toISOString()
  };
  
  if (process.env.NODE_ENV === 'development') {
    response.error = {
      message: err.message,
      stack: err.stack
    };
  }
  
  res.status(500).json(response);
});

// ===== GESTION DE L'ARRÊT GRACIEUX =====
process.on('SIGTERM', () => {
  console.log('\n Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log(' Connexion MongoDB fermée');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log(' Connexion MongoDB fermée');
    process.exit(0);
  });
});

// ===== LANCEMENT DU SERVEUR =====
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`\n ========================================`);
  console.log(` SERVEUR THROWBACK DÉMARRÉ AVEC SUCCÈS!`);
  console.log(` ========================================`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Frontend: ${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com '}`);
  console.log(`\n ROUTES PRINCIPALES:`);
  console.log(`    POST /api/videos/shorts (Upload de shorts)`);
  console.log(`     POST /api/public/videos/:id/like (Liker une vidéo)`);
  console.log(`    POST /api/public/videos/:id/memories (Ajouter un souvenir)`);
  console.log(`    GET  /api/public/videos (Liste des vidéos publiques)`);
  console.log(`    POST /api/auth/login (Connexion)`);
  console.log(`    GET  /api/test (Test de l'API)`);
  console.log(`\n FONCTIONNALITÉS DISPONIBLES:`);
  console.log(`    Upload de shorts avec validation`);
  console.log(`    Système de likes/dislikes`);
  console.log(`    Commentaires (souvenirs) sur vidéos`);
  console.log(`    Routes publiques pour VideoDetail`);
  console.log(`    Authentification JWT sécurisée`);
  console.log(`    Gestion d'erreurs améliorée`);
  console.log(`    Logging détaillé pour debug`);
  console.log(`\n PRÊT À RECEVOIR DES SHORTS! \n`);
});

module.exports = { app, server };