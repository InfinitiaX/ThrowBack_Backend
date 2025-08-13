// tasks/streamCleanup.js
const cron = require('node-cron');
const { cleanupStreamStatuses } = require('../controllers/userLiveStreamController');
const { autoStartScheduledStreams } = require('../controllers/liveStreamController');
const LiveStream = require('../models/LiveStream');

// Configuration
const CLEANUP_INTERVAL = '* * * * *'; 
const STATS_INTERVAL = '0 */6 * * *'; 
const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'error';

// Logger personnalisé pour les tâches
const logger = {
  debug: (...args) => LOG_LEVEL === 'debug' && console.log(`[CRON-DEBUG ${new Date().toISOString()}]`, ...args),
  info: (...args) => console.log(`[CRON-INFO ${new Date().toISOString()}]`, ...args),
  warn: (...args) => console.warn(`[CRON-WARN ${new Date().toISOString()}]`, ...args),
  error: (...args) => console.error(`[CRON-ERROR ${new Date().toISOString()}]`, ...args)
};

// Statistiques de la session
let sessionStats = {
  totalStarted: 0,
  totalEnded: 0,
  lastCleanup: null,
  errors: 0,
  uptime: Date.now()
};

/**
 * Fonction pour terminer les streams expirés
 * en respectant une période de grâce pour éviter d'interrompre les lectures
 */
const autoEndExpiredStreams = async (cutoffTime = new Date()) => {
  try {
    // Ne terminer que les streams qui sont expirés depuis plus longtemps
    // que le temps de coupure spécifié (par défaut: maintenant)
    const expiredStreams = await LiveStream.find({
      status: 'LIVE',
      scheduledEndTime: { $lt: cutoffTime }
    });
    
    let endedCount = 0;
    
    for (const stream of expiredStreams) {
      try {
        stream.status = 'COMPLETED';
        stream.actualEndTime = new Date();
        await stream.save();
        endedCount++;
        
        logger.info(`Ended expired stream: ${stream.title} (${stream._id})`);
      } catch (error) {
        logger.error(`Error ending stream ${stream._id}:`, error);
      }
    }
    
    return endedCount;
  } catch (error) {
    logger.error('Error in autoEndExpiredStreams:', error);
    return 0;
  }
};

/**
 * Tâche principale de nettoyage des statuts
 * Utilise une marge de 2 minutes pour éviter d'interrompre les lectures en cours
 */
const runStreamCleanup = async () => {
  try {
    logger.debug(' Starting stream status cleanup...');
    
    const startTime = Date.now();
    
    // Utiliser les fonctions des contrôleurs
    const started = await autoStartScheduledStreams();
    
    // Pour la fin des streams, être plus prudent:
    // - Ne mettre fin qu'aux streams expirés depuis au moins 2 minutes
    // pour éviter d'interrompre une vidéo en cours de lecture
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const ended = await autoEndExpiredStreams(twoMinutesAgo);
    
    const duration = Date.now() - startTime;
    
    // Mettre à jour les statistiques
    sessionStats.totalStarted += started;
    sessionStats.totalEnded += ended;
    sessionStats.lastCleanup = new Date();
    
    if (started > 0 || ended > 0) {
      logger.info(` Cleanup completed in ${duration}ms: ${started} streams started, ${ended} streams ended`);
    } else {
      logger.debug(`✓ Cleanup completed in ${duration}ms: No changes needed`);
    }
    
    return { started, ended, duration };
  } catch (error) {
    sessionStats.errors++;
    logger.error(' Error in stream cleanup:', error.message);
    
    // En cas d'erreur, essayer de continuer
    return { started: 0, ended: 0, duration: 0, error: error.message };
  }
};

/**
 * Afficher les statistiques périodiques
 */
const logSessionStats = () => {
  const uptime = Math.floor((Date.now() - sessionStats.uptime) / 1000 / 60); 
  
  logger.info(' Stream Cleanup Statistics:');
  logger.info(`    Uptime: ${uptime} minutes`);
  logger.info(`    Total streams started: ${sessionStats.totalStarted}`);
  logger.info(`    Total streams ended: ${sessionStats.totalEnded}`);
  logger.info(`    Errors: ${sessionStats.errors}`);
  logger.info(`    Last cleanup: ${sessionStats.lastCleanup ? sessionStats.lastCleanup.toLocaleString() : 'Never'}`);
};

/**
 * Tâche de maintenance avancée 
 */
const runMaintenanceTasks = async () => {
  try {
    logger.info(' Running maintenance tasks...');
    
    const LogAction = require('../models/LogAction');
    
    // 1. Nettoyer les anciennes actions de log 
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deletedLogs = await LogAction.deleteMany({
      creation_date: { $lt: thirtyDaysAgo },
      type_action: { $in: ['VIEW_LIVESTREAM', 'VIEW_LIVESTREAMS'] }
    });
    
    if (deletedLogs.deletedCount > 0) {
      logger.info(`  Deleted ${deletedLogs.deletedCount} old log entries`);
    }
    
    // 2. Mettre à jour les statistiques des streams terminés
    const completedStreams = await LiveStream.find({
      status: 'COMPLETED',
      actualEndTime: { $exists: true },
      actualStartTime: { $exists: true },
      'statistics.averageViewDuration': { $exists: false }
    });
    
    for (const stream of completedStreams) {
      if (stream.actualStartTime && stream.actualEndTime) {
        const duration = stream.actualEndTime - stream.actualStartTime;
        const durationMinutes = Math.floor(duration / (1000 * 60));
        
        // Estimer la durée moyenne de visionnage 
        const estimatedAvgDuration = Math.floor(durationMinutes * (0.25 + Math.random() * 0.15));
        
        stream.statistics = stream.statistics || {};
        stream.statistics.averageViewDuration = estimatedAvgDuration;
        
        await stream.save();
      }
    }
    
    if (completedStreams.length > 0) {
      logger.info(` Updated statistics for ${completedStreams.length} completed streams`);
    }
    
    // 3. Calculer les statistiques globales
    const totalStreams = await LiveStream.countDocuments();
    const liveStreams = await LiveStream.countDocuments({ status: 'LIVE' });
    const scheduledStreams = await LiveStream.countDocuments({ status: 'SCHEDULED' });
    const completedCount = await LiveStream.countDocuments({ status: 'COMPLETED' });
    
    logger.info(' Current stream statistics:');
    logger.info(`   • Total streams: ${totalStreams}`);
    logger.info(`   • Live: ${liveStreams}`);
    logger.info(`   • Scheduled: ${scheduledStreams}`);
    logger.info(`   • Completed: ${completedCount}`);
    
  } catch (error) {
    logger.error(' Error in maintenance tasks:', error.message);
  }
};

/**
 * Gérer l'arrêt propre des tâches
 */
const gracefulShutdown = () => {
  logger.info(' Graceful shutdown initiated for stream cleanup tasks');
  logSessionStats();
  
  // Arrêter toutes les tâches cron
  cron.getTasks().forEach((task, name) => {
    task.stop();
    logger.info(`  Stopped cron task: ${name}`);
  });
  
  process.exit(0);
};

/**
 * Initialiser et démarrer les tâches cron
 */
const initializeStreamCleanup = () => {
  try {
    logger.info(' Initializing stream cleanup tasks...');
    
    // Tâche principale : nettoyage des statuts (toutes les minutes)
    const cleanupTask = cron.schedule(CLEANUP_INTERVAL, runStreamCleanup, {
      name: 'stream-status-cleanup',
      timezone: process.env.TZ || 'Europe/Paris'
    });
    
    // Tâche de statistiques (toutes les 6 heures)
    const statsTask = cron.schedule(STATS_INTERVAL, logSessionStats, {
      name: 'stream-statistics',
      timezone: process.env.TZ || 'Europe/Paris'
    });
    
    // Tâche de maintenance (tous les jours à 3h du matin)
    const maintenanceTask = cron.schedule('0 3 * * *', runMaintenanceTasks, {
      name: 'stream-maintenance',
      timezone: process.env.TZ || 'Europe/Paris'
    });
    
    // Gérer l'arrêt propre
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    logger.info(' Stream cleanup tasks initialized successfully');
    logger.info(`   • Cleanup interval: ${CLEANUP_INTERVAL}`);
    logger.info(`   • Statistics interval: ${STATS_INTERVAL}`);
    logger.info(`   • Maintenance: Daily at 3:00 AM`);
    
    // Exécuter un nettoyage initial
    setTimeout(runStreamCleanup, 5000);
    
    return {
      cleanupTask,
      statsTask,
      maintenanceTask,
      getStats: () => ({ ...sessionStats }),
      runManualCleanup: runStreamCleanup
    };
    
  } catch (error) {
    logger.error(' Failed to initialize stream cleanup tasks:', error);
    throw error;
  }
};

/**
 * Vérifier la santé des tâches
 */
const healthCheck = () => {
  const tasks = cron.getTasks();
  const healthStatus = {
    status: 'healthy',
    activeTasks: tasks.size,
    lastCleanup: sessionStats.lastCleanup,
    uptime: Math.floor((Date.now() - sessionStats.uptime) / 1000),
    stats: sessionStats
  };
  
  // Vérifier si le dernier nettoyage a eu lieu dans les 5 dernières minutes
  if (sessionStats.lastCleanup) {
    const timeSinceLastCleanup = Date.now() - sessionStats.lastCleanup.getTime();
    if (timeSinceLastCleanup > 5 * 60 * 1000) { // 5 minutes
      healthStatus.status = 'warning';
      healthStatus.warning = 'No cleanup in the last 5 minutes';
    }
  } else {
    healthStatus.status = 'warning';
    healthStatus.warning = 'No cleanup has been performed yet';
  }
  
  // Vérifier le taux d'erreur
  const errorRate = sessionStats.errors / Math.max(1, sessionStats.totalStarted + sessionStats.totalEnded);
  if (errorRate > 0.1) { // Plus de 10% d'erreurs
    healthStatus.status = 'unhealthy';
    healthStatus.error = `High error rate: ${(errorRate * 100).toFixed(1)}%`;
  }
  
  return healthStatus;
};

// API pour usage externe - export unique des fonctions
module.exports = {
  initializeStreamCleanup,
  runStreamCleanup,
  logSessionStats,
  runMaintenanceTasks,
  healthCheck,
  getStats: () => ({ ...sessionStats }),
  autoEndExpiredStreams  // Export unique
};

// Auto-démarrage si ce fichier est exécuté directement
if (require.main === module) {
  logger.info(' Starting ThrowBack Stream Cleanup Service...');
  initializeStreamCleanup();
}