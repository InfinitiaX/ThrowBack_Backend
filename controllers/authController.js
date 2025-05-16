// controllers/authController.js - Version complète avec CAPTCHA
const User = require("../models/User");
const Token = require("../models/Token");
const LoginAttempt = require("../models/LoginAttempt");
const LogAction = require("../models/LogAction");
const Role = require("../models/Role");
const sendEmail = require("../utils/sendEmail");
const sendResetEmail = require("../utils/sendResetEmail");
const captchaGenerator = require("../utils/captcha");
const crypto = require("crypto");
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

    // Find or create default "user" role
    let userRole = await Role.findOne({ libelle_role: 'user' });
    
    if (!userRole) {
      console.log("Creating default 'user' role...");
      userRole = await Role.create({
        libelle_role: 'user',
        description: 'Standard user'
      });
      console.log("'user' role created successfully");
    }

    console.log("👤 User role:", userRole);

    // Create new user
    const user = new User({
      nom,
      prenom,
      email: email.toLowerCase(),
      mot_de_passe: password, // Will be hashed by pre-save
      date_naissance,
      genre,
      pays,
      ville,
      statut_compte: "ACTIF",
      statut_verification: false,
      roles: [userRole._id] // Assign default "user" role as ObjectId array
    });

    console.log("👤 User before save:", {
      email: user.email,
      roles: user.roles
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
        roles: user.roles
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
// controllers/authController.js - Mise à jour de la fonction login
/**
 * @desc    User login with conditional CAPTCHA and role-based redirection
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    console.log("🔑 Login function called");
    
    const { email, password, remember = false, captchaId, captchaAnswer } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Get user with password and populate roles
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+mot_de_passe')
      .populate('roles', 'libelle_role');
    
    // If user doesn't exist
    if (!user) {
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

    // Find or create login attempt entry
    let loginAttempt = await LoginAttempt.findOne({ 
      $or: [
        { ip_address: req.ip },
        { id_user: user._id }
      ]
    });

    if (!loginAttempt) {
      loginAttempt = new LoginAttempt({
        id_user: user._id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });
    }

    // Check if CAPTCHA verification is required (after 3 attempts)
    const requiresCaptcha = loginAttempt.nb_tentatives >= 3;
    
    if (requiresCaptcha) {
      if (!captchaId || !captchaAnswer) {
        return res.status(400).json({
          success: false,
          message: "CAPTCHA verification is required after multiple failed attempts",
          captchaRequired: true,
          captchaError: true
        });
      }

      // Verify CAPTCHA
      console.log("🤖 Verifying CAPTCHA for login...");
      const captchaResult = captchaGenerator.verifyCaptcha(captchaId, captchaAnswer);
      
      if (!captchaResult.valid) {
        console.log("❌ Invalid CAPTCHA for login:", captchaResult.error);
        return res.status(400).json({
          success: false,
          message: "Invalid CAPTCHA. Please try again.",
          captchaRequired: true,
          captchaError: true
        });
      }
      
      console.log("✅ CAPTCHA verified successfully for login");
    }

    // Check if account is locked
    if (loginAttempt.estVerrouille && loginAttempt.estVerrouille()) {
      const tempsRestant = loginAttempt.tempsRestantVerrouillage();
      
      return res.status(403).json({
        success: false,
        message: `Account temporarily locked due to too many failed attempts. Try again in ${tempsRestant} minutes.`
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment attempts
      loginAttempt.nb_tentatives += 1;
      loginAttempt.derniere_tentative = Date.now();
      loginAttempt.success = false;
      
      // Check if account should be locked (after 5 failed attempts)
      if (loginAttempt.nb_tentatives >= MAX_LOGIN_ATTEMPTS) {
        if (loginAttempt.verrouillerCompte) {
          loginAttempt.verrouillerCompte(LOCK_TIME);
        }
        
        // Log lockout
        await LogAction.create({
          type_action: "COMPTE_VERROUILLE",
          description_action: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`,
          id_user: user._id,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          created_by: "SYSTEM",
          donnees_supplementaires: {
            captcha_required: requiresCaptcha,
            captcha_verified: requiresCaptcha && captchaResult?.valid
          }
        });
        
        // Update user status
        user.statut_compte = "VERROUILLE";
        await user.save();
        
        await loginAttempt.save();
        
        return res.status(403).json({
          success: false,
          message: `Account temporarily locked due to too many failed attempts. Try again in ${LOCK_TIME} minutes.`
        });
      }
      
      await loginAttempt.save();
      
      // Determine if CAPTCHA is required for next attempt
      const nextRequiresCaptcha = loginAttempt.nb_tentatives >= 3;
      
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
        attemptsLeft: MAX_LOGIN_ATTEMPTS - loginAttempt.nb_tentatives,
        captchaRequired: nextRequiresCaptcha
      });
    }

    // Check if email is verified
    if (!user.statut_verification) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before signing in. A new verification link can be requested if needed."
      });
    }

    // Successful login, reset attempts
    if (loginAttempt && loginAttempt.reinitialiser) {
      loginAttempt.reinitialiser();
      await loginAttempt.save();
    }

    // Update account status if necessary
    if (user.statut_compte === "INACTIF" || user.statut_compte === "VERROUILLE") {
      user.statut_compte = "ACTIF";
    }

    // Update last login
    user.derniere_connexion = Date.now();
    await user.save();

    // Generate authentication token
    const token = user.generateAuthToken();

    // Log successful login
    await LogAction.create({
      type_action: "CONNEXION",
      description_action: "Successful login",
      id_user: user._id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: "SYSTEM",
      donnees_supplementaires: {
        captcha_required: requiresCaptcha,
        captcha_verified: requiresCaptcha && captchaResult?.valid,
        attempts_before_success: loginAttempt?.nb_tentatives || 0
      }
    });

    // Determine redirection URL based on role
    const userRole = user.roles.length > 0 ? user.roles[0].libelle_role : 'user';
    let redirectUrl;
    
    if (userRole === 'admin') {
      redirectUrl = '/admin-dashboard';
    } else {
      redirectUrl = '/dashboard';
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      redirectUrl,
      data: {
        userId: user._id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        photo_profil: user.photo_profil,
        roles: user.roles.map(role => role.libelle_role)
      }
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login. Please try again."
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
    console.log("📧 Email verification called");
    const { id, token } = req.params;
    
    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      console.log("❌ User not found");
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=invalid_link&message=Invalid verification link`);
    }

    // Check if token exists
    const tokenDoc = await Token.findOne({
      userId: user._id,
      token,
      type: 'EMAIL_VERIFICATION'
    });

    if (!tokenDoc) {
      console.log("❌ Token not found or expired");
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=expired_link&message=Verification link expired`);
    }

    // Activate account
    user.statut_verification = true;
    user.token_verification = undefined;
    user.token_verification_expiration = undefined;
    await user.save();
    
    // Delete token
    await tokenDoc.deleteOne();
    
    // Log action
    await LogAction.create({
      type_action: "EMAIL_VERIFIE",
      description_action: "Email address verified",
      id_user: user._id,
      created_by: "SYSTEM"
    });

    console.log("✅ Email verified successfully");
    
    // Redirect to login page with success message
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=true&message=Email verified successfully. You can now sign in.`);
  } catch (error) {
    console.error("❌ Email verification error:", error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=server_error&message=An error occurred during verification`);
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

    // Vérification de base
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

    // Vérifier le CAPTCHA
    console.log("🤖 Vérification du CAPTCHA...");
    const captchaResult = captchaGenerator.verifyCaptcha(captchaId, captchaAnswer);
    
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
      // Même si l'utilisateur n'existe pas, on retourne un succès
      // pour ne pas révéler l'existence ou non de l'email
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
      // Send reset email
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
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/forgot-password?error=invalid_token&message=Invalid or expired token`);
    }
    
    console.log("✅ Valid token, redirecting to reset form");
    
    // Valid token, redirect to reset form
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}&message=Valid token, you can now set your new password`);
  } catch (error) {
    console.error("❌ Password reset token verification error:", error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/forgot-password?error=server_error&message=An error occurred`);
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

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if already verified
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

    // Build verification link pointing to API
    const verificationLink = `${process.env.BACKEND_URL || 'https://throwback-backend.onrender.com'}/api/auth/verify/${user._id}/${verificationToken}`;
    
    try {
      // Send email
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
    console.log("📦 Request body:", req.body);
    
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and password are required"
      });
    }
    
    // Basic password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }
    
    console.log("🔑 Token:", token ? "provided" : "missing");
    
    // Hash token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    console.log("🔒 Hashed token generated");
    
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
    user.mot_de_passe = password; // Will be hashed by pre-save
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
    
    console.log("✅ Action logged");
    
    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now sign in."
    });
    
    console.log("✅ Response sent");
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
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }
    
    const userId = req.user._id;
    
    // Get user with password
    const user = await User.findById(userId).select('+mot_de_passe');
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }
    
    // Update password
    user.mot_de_passe = newPassword; // Will be hashed by pre-save
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

/**
 * @desc    Get current user info
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-mot_de_passe -token_verification -token_verification_expiration -password_reset_token -password_reset_expires')
      .populate('roles', 'libelle_role description');
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error("❌ User data retrieval error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while retrieving user data"
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