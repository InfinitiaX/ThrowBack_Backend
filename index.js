// index.js - Version corrigée pour rôle unique
require("dotenv").config();
const express = require("express");
const session = require('express-session');
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require('jsonwebtoken'); 
const cors = require('cors');

// ===== Import des modèles =====
require('./models/User'); // Import du modèle User en premier
require('./models/Token');
require('./models/LoginAttempt');
require('./models/LogAction');


const app = express();

// ===== Middleware de base =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ===== Configuration CORS pour React =====
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3000'
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

// ===== Middleware pour les messages flash =====
app.use((req, res, next) => {
  res.locals.successMessage = req.session.successMessage;
  res.locals.errorMessage = req.session.errorMessage;
  delete req.session.successMessage;
  delete req.session.errorMessage;
  next();
});

// ===== Configuration du moteur de template =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Fichiers statiques =====
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

// ===== Logging des requêtes =====
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("Connexion MongoDB réussie");
  console.log("Base de données:", mongoose.connection.db.databaseName);
})
.catch((err) => {
  console.error("Erreur MongoDB:", err);
  process.exit(1);
});

// ===== Middlewares d'authentification =====
// Middleware pour extraire l'utilisateur depuis le token JWT
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
        console.log("Utilisateur connecté:", `${req.user.prenom} ${req.user.nom}`);
      } catch (error) {
        console.error("Erreur de vérification du token:", error.message);
        req.user = null;
      }
    } else {
      console.log("Utilisateur: Non connecté");
      req.user = null;
    }
    next();
  } catch (error) {
    console.error("Erreur d'authentification:", error);
    req.user = null;
    next();
  }
};

// Middleware pour protéger les routes
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

// ===== Middleware global pour les variables partagées =====
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  
  if (req.user) {
    // Utilisation du rôle unique au lieu du tableau de rôles
    res.locals.isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    res.locals.isSuperAdmin = req.user.role === 'superadmin';
  } else {
    res.locals.isAdmin = false;
    res.locals.isSuperAdmin = false;
  }
  next();
});

// ===== Test du contrôleur d'authentification =====
let authController;
try {
  authController = require("./controllers/authController");
  console.log("AuthController chargé avec succès");
  console.log("Fonctions disponibles:", Object.keys(authController));
} catch (error) {
  console.error("Erreur lors du chargement de authController:", error);
  process.exit(1);
}

// ===== Routes API =====
console.log("\n Configuration des routes API...");

// Routes d'authentification API
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/verify/:id/:token', authController.verifyEmail);
app.post('/api/auth/resend-verification', authController.resendVerification);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.get('/api/auth/verify-reset/:token', authController.verifyPasswordReset);
app.put('/api/auth/reset-password', authController.resetPassword);

// Routes protégées
app.put('/api/auth/change-password', protect, authController.changePassword);
app.post('/api/auth/logout', protect, authController.logout);
app.get('/api/auth/me', protect, authController.getMe);

// Routes des paramètres utilisateur
const userProfileRoutes = require('./routes/api/userProfile');
app.use('/api/users', userProfileRoutes);

const videoRoutes = require('./routes/api/videoRoutes');
app.use('/api/videos', videoRoutes);

const adminApiRoutes = require('./routes/api/admin');
app.use('/api/admin', adminApiRoutes);

console.log("Routes API configurées:");
console.log("- POST /api/auth/register");
console.log("- POST /api/auth/login");
console.log("- GET  /api/auth/verify/:id/:token");
console.log("- POST /api/auth/resend-verification");
console.log("- POST /api/auth/forgot-password");
console.log("- GET  /api/auth/verify-reset/:token");
console.log("- PUT  /api/auth/reset-password");
console.log("- PUT  /api/auth/change-password (Protected)");
console.log("- POST /api/auth/logout (Protected)");
console.log("- GET  /api/auth/me (Protected)");
console.log("- GET  /api/users");
console.log("- GET  /api/admin");

// ===== Routes de test =====
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Test de connexion MongoDB
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



// ===== Routes Web (pour les vues server-side) =====
try {
  const webAuthRoutes = require("./routes/web/auth");
  app.use("/", webAuthRoutes);
  console.log("Routes web auth chargées");
} catch (error) {
  console.log("Routes web auth non disponibles:", error.message);
  
  // Routes de fallback pour les pages web
  app.get("/login", (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`);
  });
  
  app.get("/register", (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/register`);
  });
}

// Route par défaut
app.get("/", (req, res) => {
  res.json({
    message: "ThrowBack API Server",
    version: "1.0.0",
    endpoints: {
      api: "/api",
      auth: "/api/auth",
      test: "/api/test"
    }
  });
});


// ===== Routes de profil utilisateur (optionnel) =====
try {
  const userProfileRoutes = require("./routes/api/userProfile");
  app.use("/api/users", userProfileRoutes);
  console.log("Routes de profil utilisateur chargées");
} catch (error) {
  console.log("Routes userProfile non disponibles:", error.message);
}
// ===== Routes CAPTCHA =====
const captchaRoutes = require("./routes/api/captcha");
app.use("/api/captcha", captchaRoutes);

console.log("Routes CAPTCHA configurées:");
console.log("- GET  /api/captcha/generate");
console.log("- POST /api/captcha/verify");
console.log("- GET  /api/captcha/stats");



// ===== Gestion des erreurs 404 =====
app.use((req, res, next) => {
  console.log(`404 ERROR: ${req.method} ${req.path}`);
  
  // Pour les routes API, retourner du JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: "Route API non trouvée",
      path: req.path,
      method: req.method,
      availableRoutes: [
        'GET /api/test',
        'GET /api/test/db',
        'POST /api/auth/register',
        'POST /api/auth/login',
        'PUT /api/auth/reset-password'
      ]
    });
  }
  
  // Pour les routes web
  res.status(404).json({
    error: "Page non trouvée",
    message: `La route ${req.path} n'existe pas`,
    suggestion: "Vérifiez l'URL ou consultez la documentation de l'API"
  });
});

// ===== Gestion des erreurs 500 =====
app.use((err, req, res, next) => {
  console.error("Erreur serveur:", err);
  
  // Log détaillé en mode développement
  if (process.env.NODE_ENV === 'development') {
    console.error("Stack trace:", err.stack);
  }
  
  // Réponse d'erreur
  const response = {
    success: false,
    message: "Une erreur est survenue sur le serveur",
    error: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  };
  
  res.status(500).json(response);
});

// ===== Gestion de l'arrêt gracieux =====
process.on('SIGTERM', () => {
  console.log('\n Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('Connexion MongoDB fermée');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('Connexion MongoDB fermée');
    process.exit(0);
  });
});

// ===== Lancement du serveur =====
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`\n Serveur ThrowBack lancé avec succès!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`\n Routes de test disponibles:`);
  console.log(`   GET  http://localhost:${PORT}/api/test`);
  console.log(`   GET  http://localhost:${PORT}/api/test/db`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   PUT  http://localhost:${PORT}/api/auth/reset-password`);
  console.log(`\n Configuration email:`);
  console.log(`   User: ${process.env.EMAIL_USER || 'Non configuré'}`);
  console.log(`   Service: Gmail`);
  console.log(`\n Liens utiles:`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`   API Docs: http://localhost:${PORT}/api`);
  console.log(`\n Serveur prêt à recevoir des requêtes!\n`);
});

// Export pour les tests
module.exports = { app, server };