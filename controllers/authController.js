const mongoose = require('mongoose');
const User = mongoose.model('User');
const Token = require("../models/Token");
const LoginAttempt = require("../models/LoginAttempt");
const LogAction = require("../models/LogAction");
const sendEmail = require("../utils/sendEmail");
const sendResetEmail = require("../utils/sendResetEmail");
const captchaGenerator = require("../utils/captcha");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
require("dotenv").config();

// Maximum login attempts before lockout
const MAX_LOGIN_ATTEMPTS = 5;
// Lockout duration in minutes
const LOCK_TIME = 30;

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    console.log("🚀 Register function called");
    console.log("📦 Request body:", req.body);

    const { nom, prenom, email, password, date_naissance, genre, pays, ville } = req.body;

    // Basic validation
    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: nom, prenom, email, password"
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "A user with this email already exists"
      });
    }

    // 🔧 CORRECTION: Créer l'utilisateur avec rôle user par défaut
    const user = new User({
      nom,
      prenom,
      email: email.toLowerCase(),
      mot_de_passe: password, 
      date_naissance,
      genre,
      pays,
      ville,
      statut_compte: "ACTIF",
      statut_verification: false,
      role: 'user' 
    });

    console.log("👤 User before save:", {
      email: user.email,
      role: user.role
    });

    // Generate verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    console.log("✅ User saved successfully");

    // Create associated Token document
    const tokenDoc = new Token({
      userId: user._id,
      token: verificationToken,
      type: 'EMAIL_VERIFICATION'
    });
    
    await tokenDoc.save();
    console.log("✅ Token saved successfully:", tokenDoc._id);

    // Build verification link to redirect to API
    const verificationLink = `${process.env.BACKEND_URL || 'https://throwback-backend.onrender.com'}/api/auth/verify/${user._id}/${verificationToken}`;
   
    try {
      // Send verification email
      await sendEmail(user.email, "Verify your ThrowBack account", verificationLink);
      console.log("📧 Email sent successfully to:", user.email);
    } catch (emailError) {
      console.error("📧 Email sending error:", emailError);
      // Registration continues even if email fails
    }

    // Log action
    await LogAction.create({
      type_action: "INSCRIPTION",
      description_action: "New user registered",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });

    res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email to activate your account.",
      data: {
        userId: user._id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role 
      }
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during registration. Please try again.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    User login with role-based redirection
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    console.log("🔑 Login function called");
    
    // 🔧 CORRECTION: Réinitialiser seulement les tentatives expirées
    await LoginAttempt.deleteMany({
      date_derniere_tentative: { $lt: new Date(Date.now() - LOCK_TIME * 60 * 1000) }
    });
    console.log("✅ Expired login attempts cleaned");
    
    const { email, password, remember = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // 🔧 CORRECTION: Récupération utilisateur simplifiée
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+mot_de_passe');
    
    console.log("👤 User found:", user ? `${user.email} (${user.role})` : 'No user');
    
    // If user doesn't exist
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Check if password exists
    if (!user.mot_de_passe) {
      console.log("❌ Password not found in user object");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Check account status
    if (user.statut_compte === "SUSPENDU" || user.statut_compte === "SUPPRIME") {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended or deleted. Please contact administrator."
      });
    }

    // Check if account is verified
    if (!user.statut_verification) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before logging in."
      });
    }

    // 🔧 CORRECTION: Vérification du mot de passe plus robuste
    let isMatch = false;
    try {
      isMatch = await user.comparePassword(password);
    } catch (passwordError) {
      console.error("❌ Password comparison error:", passwordError);
      return res.status(500).json({
        success: false,
        message: "An error occurred during authentication"
      });
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // 🔧 CORRECTION: Génération du token avec gestion d'erreurs
    let token;
    try {
      token = user.generateAuthToken();
    } catch (tokenError) {
      console.error("❌ Token generation error:", tokenError);
      return res.status(500).json({
        success: false,
        message: "An error occurred during token generation"
      });
    }

    // Update last login
    user.derniere_connexion = Date.now();
    await user.save();

    // Log successful login
    await LogAction.create({
      type_action: "CONNEXION",
      description_action: "User logged in successfully",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });

    // 🔧 CORRECTION: Structure de réponse cohérente
    const responseData = {
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          role: user.role,
          statut_compte: user.statut_compte,
          statut_verification: user.statut_verification
        }
      }
    };

    console.log("✅ Login successful for:", user.email, "Role:", user.role);
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Email verification with redirect to login
 * @route   GET /api/auth/verify/:id/:token
 * @access  Public
 */
const verifyEmail = async (req, res) => {
  try {
    console.log("📧 Email verification called with ID:", req.params.id, "and token:", req.params.token);
    const { id, token } = req.params;
    
    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      console.log("❌ User not found");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?error=invalid_link&message=Invalid verification link`);
    }

    console.log("👤 User found:", {
      id: user._id,
      email: user.email,
      statut_verification: user.statut_verification
    });

    // Check if user is already verified
    if (user.statut_verification) {
      console.log("✅ User already verified");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?verified=true&message=Your account is already verified. You can now sign in.`);
    }

    // 🔧 CORRECTION: Vérification du token plus robuste
    console.log("🔍 Looking for token with userId:", user._id, "and token:", token);
    const tokenDoc = await Token.findOne({
      userId: user._id,
      token,
      type: 'EMAIL_VERIFICATION'
    });

    console.log("🔍 Token found:", tokenDoc ? "Yes" : "No");

    if (!tokenDoc) {
      console.log("❌ Token not found or expired");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?error=expired_link&message=Verification link expired`);
    }

    // 🔧 CORRECTION: Activation du compte avec gestion d'erreurs
    try {
      user.statut_verification = true;
      user.token_verification = undefined;
      user.token_verification_expiration = undefined;
      await user.save();
      
      // Delete token
      await tokenDoc.deleteOne();
      
      console.log("✅ User verified and token deleted");
    } catch (saveError) {
      console.error("❌ Error saving user verification:", saveError);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?error=server_error&message=An error occurred during verification`);
    }
    
    // Log action
    await LogAction.create({
      type_action: "EMAIL_VERIFIE",
      description_action: "Email address verified",
      id_user: user._id,
      created_by: "SYSTEM"
    });

    console.log("✅ Email verified successfully");
    
    // 🔧 CORRECTION: URL de redirection sans espaces
    const redirectUrl = `${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?verified=true&message=${encodeURIComponent('Email verified successfully. You can now sign in.')}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error("❌ Email verification error:", error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/login?error=server_error&message=An error occurred during verification`);
  }
};

/**
 * @desc    Get current user info
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role, 
        statut_compte: user.statut_compte,
        statut_verification: user.statut_verification,
        derniere_connexion: user.derniere_connexion,
        telephone: user.telephone,
        date_naissance: user.date_naissance,
        ville: user.ville,
        adresse: user.adresse,
        code_postal: user.code_postal,
        pays: user.pays,
        genre: user.genre,
        bio: user.bio,
        profession: user.profession,
        photo_profil: user.photo_profil,
        compte_prive: user.compte_prive
      }
    });
  } catch (error) {
    console.error("❌ GetMe error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching user data"
    });
  }
};

/**
 * @desc    Password reset request with CAPTCHA
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    console.log("🔄 Forgot password with CAPTCHA called");
    const { email, captchaId, captchaAnswer } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    if (!captchaId || !captchaAnswer) {
      return res.status(400).json({
        success: false,
        message: "CAPTCHA verification is required"
      });
    }

    // 🔧 CORRECTION: Vérification CAPTCHA avec gestion d'erreurs
    let captchaResult;
    try {
      captchaResult = captchaGenerator.verifyCaptcha(captchaId, captchaAnswer);
    } catch (captchaError) {
      console.error("❌ CAPTCHA verification error:", captchaError);
      return res.status(500).json({
        success: false,
        message: "CAPTCHA verification failed"
      });
    }
    
    if (!captchaResult.valid) {
      console.log("❌ CAPTCHA invalide:", captchaResult.error);
      return res.status(400).json({
        success: false,
        message: "Invalid CAPTCHA. Please try again.",
        captchaError: true
      });
    }

    console.log("✅ CAPTCHA vérifié avec succès");

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // For security reasons, don't reveal if email exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email is associated with an account, a reset link has been sent"
      });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Create reset link pointing to API
    const resetLink = `${process.env.BACKEND_URL || 'https://throwback-backend.onrender.com'}/api/auth/verify-reset/${resetToken}`;
    
    try {
      await sendResetEmail(user.email, resetLink);
      console.log("📧 Reset email sent successfully");
    } catch (emailError) {
      console.error("📧 Password reset email error:", emailError);
    }

    // Log action
    await LogAction.create({
      type_action: "DEMANDE_REINITIALISATION_MDP",
      description_action: "Password reset requested (with CAPTCHA)",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM",
      donnees_supplementaires: {
        captcha_verified: true
      }
    });

    res.status(200).json({
      success: true,
      message: "If this email is associated with an account, a reset link has been sent"
    });
  } catch (error) {
    console.error("❌ Password reset request error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during password reset request. Please try again."
    });
  }
};

/**
 * @desc    Reset token verification and redirection
 * @route   GET /api/auth/verify-reset/:token
 * @access  Public
 */
const verifyPasswordReset = async (req, res) => {
  try {
    console.log("🔍 Verify password reset token called");
    const { token } = req.params;
    
    // Hash token to compare with stored one
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with this token
    const user = await User.findOne({
      password_reset_token: hashedToken,
      password_reset_expires: { $gt: Date.now() }
    });
    
    if (!user) {
      console.log("❌ Invalid or expired token");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/forgot-password?error=invalid_token&message=Invalid or expired token`);
    }
    
    console.log("✅ Valid token, redirecting to reset form");
    
    // 🔧 CORRECTION: URL de redirection propre
    const redirectUrl = `${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/reset-password?token=${token}&message=${encodeURIComponent('Valid token, you can now set your new password')}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ Password reset token verification error:", error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/forgot-password?error=server_error&message=An error occurred`);
  }
};

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
const resendVerification = async (req, res) => {
  try {
    console.log("📧 Resend verification called");
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email required"
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.statut_verification) {
      return res.status(400).json({
        success: false,
        message: "This account is already verified"
      });
    }

    // Delete old token if exists
    await Token.deleteOne({
      userId: user._id,
      type: 'EMAIL_VERIFICATION'
    });

    // Generate new token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Create new Token document
    await new Token({
      userId: user._id,
      token: verificationToken,
      type: 'EMAIL_VERIFICATION'
    }).save();

    const verificationLink = `${process.env.BACKEND_URL || 'https://throwback-backend.onrender.com'}/api/auth/verify/${user._id}/${verificationToken}`;
    
    try {
      await sendEmail(user.email, "Verify your ThrowBack account", verificationLink);
      console.log("📧 Verification email resent successfully");
      
      res.status(200).json({
        success: true,
        message: "Verification email sent successfully"
      });
    } catch (emailError) {
      console.error("📧 Email sending error:", emailError);
      res.status(500).json({
        success: false,
        message: "Error sending email"
      });
    }
  } catch (error) {
    console.error("❌ Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred"
    });
  }
};

/**
 * @desc    Password reset
 * @route   PUT /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    console.log("🔄 Reset password function called");
    
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and password are required"
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }
    
    // Hash token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user
    const user = await User.findOne({
      password_reset_token: hashedToken,
      password_reset_expires: { $gt: Date.now() }
    });
    
    if (!user) {
      console.log("❌ No user found with valid token");
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
    
    console.log("✅ User found:", user.email);
    
    // Update password
    user.mot_de_passe = password; 
    user.password_reset_token = undefined;
    user.password_reset_expires = undefined;
    await user.save();
    
    console.log("✅ Password updated successfully");
    
    // Log action
    await LogAction.create({
      type_action: "MOT_DE_PASSE_REINITIALISE",
      description_action: "Password reset",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM"
    });
    
    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now sign in."
    });
    
  } catch (error) {
    console.error("❌ Password reset error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during password reset. Please try again."
    });
  }
};

/**
 * @desc    Change password (logged in user)
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    console.log("🔑 Changement de mot de passe demandé pour l'utilisateur:", req.user.id);
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }
    
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('+mot_de_passe');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.mot_de_passe);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }
    
    // Update password
    user.mot_de_passe = newPassword; 
    await user.save();
    
    // Log action
    await LogAction.create({
      type_action: "MOT_DE_PASSE_MODIFIE",
      description_action: "Password changed",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: user._id
    });
    
    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    console.error("❌ Password change error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during password change. Please try again."
    });
  }
};

/**
 * @desc    Logout
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    // Log logout
    await LogAction.create({
      type_action: "DECONNEXION",
      description_action: "Logout",
      id_user: req.user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: req.user._id
    });
    
    res.status(200).json({
      success: true,
      message: "Logout successful"
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during logout"
    });
  }
};

// Export toutes les fonctions
module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyPasswordReset,
  resetPassword,
  changePassword,
  logout,
  getMe
};