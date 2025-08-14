// services/streamScheduler.js
const cron = require('node-cron');
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');

/**
 * Service de planification pour gérer automatiquement les livestreams
 * CORRIGÉ pour éviter d'interrompre les lectures en cours
 */
const initStreamScheduler = () => {
  console.log('Initializing stream scheduler');
  
  // Vérifier toutes les minutes pour les streams qui doivent s'arrêter
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      console.log(`[${now.toISOString()}] Checking livestreams status`);
      
      // IMPORTANT: Pour les streams en cours, attendre 2 minutes après leur fin prévue
      // afin de ne pas interrompre brusquement une vidéo en cours
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      
      // Trouver uniquement les streams LIVE qui doivent s'arrêter
      // ET qui sont expirés depuis au moins 2 minutes
      const streamsToEnd = await LiveStream.find({
        status: 'LIVE',
        scheduledEndTime: { $lte: twoMinutesAgo }
      });
      
      console.log(`Found ${streamsToEnd.length} livestreams to end`);
      
      // Terminer chaque stream expiré
      for (const stream of streamsToEnd) {
        try {
          stream.status = 'COMPLETED';
          stream.actualEndTime = now;
          
          // Si l'enregistrement est activé, générer un ID de vidéo enregistrée
          if (stream.recordAfterStream) {
            stream.recordedVideoId = `rec_${Date.now()}_${stream._id}`;
          }
          
          await stream.save();
          
          // Journaliser l'action
          await LogAction.create({
            type_action: 'AUTO_END_LIVESTREAM',
            description_action: `Fin automatique du livestream "${stream.title}" après expiration`,
            id_user: stream.author,
            created_by: "SYSTEM"
          });
          
          console.log(`Auto-completed expired livestream: ${stream.title} (${stream._id})`);
        } catch (streamError) {
          console.error(`Error ending livestream ${stream._id}:`, streamError);
        }
      }
      
      // Démarrer les streams programmés dont l'heure est arrivée
      const streamsToStart = await LiveStream.find({
        status: 'SCHEDULED',
        scheduledStartTime: { $lte: now },
        scheduledEndTime: { $gt: now }
      });
      
      console.log(`Found ${streamsToStart.length} livestreams to start`);
      
      // Démarrer chaque stream programmé
      for (const stream of streamsToStart) {
        try {
          stream.status = 'LIVE';
          stream.actualStartTime = now;
          stream.currentVideoIndex = 0; 
          stream.currentVideoStartTime = now; 
          await stream.save();
          
          // Journaliser l'action
          await LogAction.create({
            type_action: 'AUTO_START_LIVESTREAM',
            description_action: `Démarrage automatique du livestream "${stream.title}"`,
            id_user: stream.author,
            created_by: "SYSTEM"
          });
          
          console.log(`Auto-started scheduled livestream: ${stream.title} (${stream._id})`);
        } catch (streamError) {
          console.error(`Error starting livestream ${stream._id}:`, streamError);
        }
      }
    } catch (error) {
      console.error('Error in stream scheduler:', error);
    }
  });
  
  return {
    isActive: true,
    lastRun: new Date()
  };
};

module.exports = { initStreamScheduler };