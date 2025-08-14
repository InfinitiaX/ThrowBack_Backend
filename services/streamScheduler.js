// services/streamScheduler.js
const cron = require('node-cron');
const LiveStream = require('../models/LiveStream');
const LogAction = require('../models/LogAction');

/**
 * Service de planification pour gérer automatiquement les livestreams
 */
const initStreamScheduler = () => {
  console.log('Initializing stream scheduler');
  
  // Vérifier toutes les minutes pour les streams qui doivent s'arrêter
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      console.log(`[${now.toISOString()}] Checking livestreams status`);
      
      // IMPORTANT: Pour les admin, ne pas démarrer automatiquement les streams
      // Trouver uniquement les streams LIVE qui doivent s'arrêter
      const streamsToEnd = await LiveStream.find({
        status: 'LIVE',
        scheduledEndTime: { $lte: now }
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
    } catch (error) {
      console.error('Error in stream scheduler:', error);
    }
  });
};

module.exports = { initStreamScheduler };