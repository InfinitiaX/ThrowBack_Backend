// controllers/userPlaylistController.js
const Playlist = require('../models/Playlist');
const Video = require('../models/Video');
const LogAction = require('../models/LogAction');
const mongoose = require('mongoose');

/**
 * @desc    Créer une nouvelle playlist
 * @route   POST /api/playlists
 * @access  Private
 */
exports.createPlaylist = async (req, res) => {
  try {
    const { nom, description, videos = [], visibilite = 'PUBLIC' } = req.body;
    const userId = req.user._id;

    // Validation de base
    if (!nom) {
      return res.status(400).json({
        success: false,
        message: "Le nom de la playlist est requis"
      });
    }

    // Créer la playlist
    const playlist = new Playlist({
      nom,
      description,
      proprietaire: userId,
      visibilite,
      created_by: userId
    });

    // Ajouter les vidéos si présentes
    if (videos && videos.length > 0) {
      // Vérifier que toutes les vidéos existent
      const videoIds = videos.map(v => typeof v === 'object' ? v.videoId : v);
      const existingVideos = await Video.find({ _id: { $in: videoIds } });
      
      if (existingVideos.length !== videoIds.length) {
        return res.status(400).json({
          success: false,
          message: "Une ou plusieurs vidéos n'existent pas"
        });
      }

      // Ajouter les vidéos à la playlist avec leur ordre
      existingVideos.forEach((video, index) => {
        playlist.videos.push({
          video_id: video._id,
          ordre: index + 1,
          ajoute_par: userId
        });
      });

      // Mettre à jour les métadonnées des vidéos pour référencer cette playlist
      await Video.updateMany(
        { _id: { $in: videoIds } },
        { $addToSet: { 'meta.playlists': playlist._id } }
      );
    }

    await playlist.save();

    // Journal d'action
    await LogAction.create({
      type_action: "PLAYLIST_CREEE",
      description_action: `Playlist "${nom}" créée`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: playlist._id,
        playlist_nom: nom
      }
    });

    res.status(201).json({
      success: true,
      message: "Playlist créée avec succès",
      data: playlist
    });
  } catch (err) {
    console.error("Erreur lors de la création de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la création de la playlist"
    });
  }
};

/**
 * @desc    Récupérer toutes les playlists de l'utilisateur
 * @route   GET /api/playlists/user
 * @access  Private
 */
exports.getUserPlaylists = async (req, res) => {
  try {
    const userId = req.user._id;

    const playlists = await Playlist.find({ proprietaire: userId })
      .sort({ creation_date: -1 })
      .select('nom description visibilite videos nb_lectures nb_favoris creation_date');

    // Compter le nombre de vidéos pour chaque playlist
    const playlistsWithCounts = playlists.map(playlist => {
      const playlistObj = playlist.toObject();
      playlistObj.nb_videos = playlist.videos ? playlist.videos.length : 0;
      return playlistObj;
    });

    res.status(200).json({
      success: true,
      data: playlistsWithCounts
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des playlists:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des playlists"
    });
  }
};

/**
 * @desc    Récupérer les détails d'une playlist
 * @route   GET /api/playlists/:id
 * @access  Private/Public (selon la visibilité)
 */
exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null;

    const playlist = await Playlist.findById(id)
      .populate({
        path: 'videos.video_id',
        select: 'titre artiste type youtubeUrl annee vues likes'
      })
      .populate('proprietaire', 'nom prenom photo_profil');

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }

    // Vérifier les permissions d'accès
    if (playlist.visibilite === 'PRIVE' && (!userId || !playlist.proprietaire._id.equals(userId))) {
      return res.status(403).json({
        success: false,
        message: "Vous n'avez pas l'autorisation d'accéder à cette playlist"
      });
    }

    if (playlist.visibilite === 'AMIS') {
      // TODO: Vérifier si l'utilisateur est ami avec le propriétaire
      // Pour l'instant, seul le propriétaire peut voir
      if (!userId || !playlist.proprietaire._id.equals(userId)) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas l'autorisation d'accéder à cette playlist"
        });
      }
    }

    // Incrémenter le compteur de lectures
    if (userId && !playlist.proprietaire._id.equals(userId)) {
      playlist.nb_lectures += 1;
      await playlist.save();
    }

    // Vérifier si l'utilisateur a mis la playlist en favori
    let isFavorite = false;
    if (userId) {
      isFavorite = playlist.favori_par.some(id => id.equals(userId));
    }

    // Trier les vidéos par ordre
    playlist.videos.sort((a, b) => a.ordre - b.ordre);

    res.status(200).json({
      success: true,
      data: {
        ...playlist.toObject(),
        isFavorite
      }
    });
  } catch (err) {
    console.error("Erreur lors de la récupération de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération de la playlist"
    });
  }
};

/**
 * @desc    Ajouter une vidéo à une playlist
 * @route   POST /api/playlists/:id/videos
 * @access  Private
 */
exports.addVideoToPlaylist = async (req, res) => {
  try {
    const { id: playlistId } = req.params;
    const { videoId } = req.body;
    const userId = req.user._id;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "L'ID de la vidéo est requis"
      });
    }

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['AJOUT', 'MODIFICATION'] } }
      ]
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Vérifier que la vidéo existe
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée"
      });
    }

    // Vérifier si la vidéo est déjà dans la playlist
    const videoExists = playlist.videos.some(v => v.video_id.equals(videoId));
    if (videoExists) {
      return res.status(400).json({
        success: false,
        message: "Cette vidéo est déjà dans la playlist"
      });
    }

    // Ajouter la vidéo à la playlist
    const ordre = playlist.videos.length + 1;
    playlist.videos.push({
      video_id: videoId,
      ordre,
      date_ajout: Date.now(),
      ajoute_par: userId
    });

    // Mettre à jour les métadonnées de la vidéo
    await Video.findByIdAndUpdate(videoId, {
      $addToSet: { 'meta.playlists': playlistId }
    });

    // Sauvegarder les modifications
    await playlist.save();

    // Journal d'action
    await LogAction.create({
      type_action: "VIDEO_AJOUTEE_PLAYLIST",
      description_action: `Vidéo ajoutée à la playlist "${playlist.nom}"`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: playlistId,
        playlist_nom: playlist.nom,
        video_id: videoId,
        video_titre: video.titre
      }
    });

    res.status(200).json({
      success: true,
      message: "Vidéo ajoutée à la playlist avec succès",
      data: {
        playlistId,
        videoId,
        ordre
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'ajout de la vidéo à la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de l'ajout de la vidéo à la playlist"
    });
  }
};

/**
 * @desc    Supprimer une vidéo d'une playlist
 * @route   DELETE /api/playlists/:id/videos/:videoId
 * @access  Private
 */
exports.removeVideoFromPlaylist = async (req, res) => {
  try {
    const { id: playlistId, videoId } = req.params;
    const userId = req.user._id;

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['MODIFICATION'] } }
      ]
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Vérifier que la vidéo est dans la playlist
    const videoIndex = playlist.videos.findIndex(v => v.video_id.equals(videoId));
    if (videoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Vidéo non trouvée dans la playlist"
      });
    }

    // Supprimer la vidéo de la playlist
    playlist.videos.splice(videoIndex, 1);

    // Réorganiser les ordres
    playlist.videos.forEach((video, index) => {
      video.ordre = index + 1;
    });

    // Mettre à jour les métadonnées de la vidéo
    await Video.findByIdAndUpdate(videoId, {
      $pull: { 'meta.playlists': playlistId }
    });

    // Sauvegarder les modifications
    await playlist.save();

    // Journal d'action
    await LogAction.create({
      type_action: "VIDEO_SUPPRIMEE_PLAYLIST",
      description_action: `Vidéo supprimée de la playlist "${playlist.nom}"`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: playlistId,
        playlist_nom: playlist.nom,
        video_id: videoId
      }
    });

    res.status(200).json({
      success: true,
      message: "Vidéo supprimée de la playlist avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la suppression de la vidéo de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la vidéo de la playlist"
    });
  }
};

/**
 * @desc    Mettre à jour une playlist
 * @route   PUT /api/playlists/:id
 * @access  Private
 */
exports.updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, description, visibilite } = req.body;
    const userId = req.user._id;

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: id,
      proprietaire: userId
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Mettre à jour les champs
    if (nom) playlist.nom = nom;
    if (description !== undefined) playlist.description = description;
    if (visibilite) playlist.visibilite = visibilite;

    playlist.modified_date = Date.now();
    playlist.modified_by = userId;

    await playlist.save();

    // Journal d'action
    await LogAction.create({
      type_action: "PLAYLIST_MODIFIEE",
      description_action: `Playlist "${playlist.nom}" modifiée`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: id,
        playlist_nom: playlist.nom
      }
    });

    res.status(200).json({
      success: true,
      message: "Playlist mise à jour avec succès",
      data: playlist
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la mise à jour de la playlist"
    });
  }
};

/**
 * @desc    Supprimer une playlist
 * @route   DELETE /api/playlists/:id
 * @access  Private
 */
exports.deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: id,
      proprietaire: userId
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Récupérer la liste des vidéos de la playlist
    const videoIds = playlist.videos.map(v => v.video_id);

    // Supprimer les références à cette playlist dans les métadonnées des vidéos
    await Video.updateMany(
      { _id: { $in: videoIds } },
      { $pull: { 'meta.playlists': id } }
    );

    // Supprimer la playlist
    await playlist.deleteOne();

    // Journal d'action
    await LogAction.create({
      type_action: "PLAYLIST_SUPPRIMEE",
      description_action: `Playlist "${playlist.nom}" supprimée`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: id,
        playlist_nom: playlist.nom
      }
    });

    res.status(200).json({
      success: true,
      message: "Playlist supprimée avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la suppression de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la suppression de la playlist"
    });
  }
};

/**
 * @desc    Ajouter/supprimer une playlist aux favoris
 * @route   POST /api/playlists/:id/favorite
 * @access  Private
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Vérifier que la playlist existe
    const playlist = await Playlist.findById(id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }

    // Vérifier si la playlist est déjà en favori
    const isFavorite = playlist.favori_par.some(favId => favId.equals(userId));

    if (isFavorite) {
      // Supprimer des favoris
      playlist.favori_par = playlist.favori_par.filter(favId => !favId.equals(userId));
      playlist.nb_favoris = Math.max(0, playlist.nb_favoris - 1);

      await playlist.save();

      return res.status(200).json({
        success: true,
        message: "Playlist retirée des favoris",
        isFavorite: false
      });
    } else {
      // Ajouter aux favoris
      playlist.favori_par.push(userId);
      playlist.nb_favoris += 1;

      await playlist.save();

      // Journal d'action
      await LogAction.create({
        type_action: "PLAYLIST_FAVORIS",
        description_action: `Playlist "${playlist.nom}" ajoutée aux favoris`,
        id_user: userId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        created_by: userId,
        donnees_supplementaires: {
          playlist_id: id,
          playlist_nom: playlist.nom
        }
      });

      return res.status(200).json({
        success: true,
        message: "Playlist ajoutée aux favoris",
        isFavorite: true
      });
    }
  } catch (err) {
    console.error("Erreur lors de la gestion des favoris:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la gestion des favoris"
    });
  }
};

/**
 * @desc    Récupérer les playlists populaires
 * @route   GET /api/playlists/popular
 * @access  Public
 */
exports.getPopularPlaylists = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const playlists = await Playlist.find({ visibilite: 'PUBLIC' })
      .sort({ nb_lectures: -1, nb_favoris: -1 })
      .limit(parseInt(limit))
      .populate('proprietaire', 'nom prenom photo_profil')
      .select('nom description visibilite videos nb_lectures nb_favoris creation_date');

    // Compter le nombre de vidéos pour chaque playlist
    const playlistsWithCounts = playlists.map(playlist => {
      const playlistObj = playlist.toObject();
      playlistObj.nb_videos = playlist.videos ? playlist.videos.length : 0;
      return playlistObj;
    });

    res.status(200).json({
      success: true,
      data: playlistsWithCounts
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des playlists populaires:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la récupération des playlists populaires"
    });
  }
};

/**
 * @desc    Réorganiser l'ordre des vidéos dans une playlist
 * @route   PUT /api/playlists/:id/reorder
 * @access  Private
 */
exports.reorderPlaylist = async (req, res) => {
  try {
    const { id: playlistId } = req.params;
    const { videoOrders } = req.body; // format: [{videoId: '123', ordre: 1}, ...]
    const userId = req.user._id;

    if (!videoOrders || !Array.isArray(videoOrders)) {
      return res.status(400).json({
        success: false,
        message: "Format de données invalide pour la réorganisation"
      });
    }

    // Vérifier que la playlist existe et appartient à l'utilisateur
    const playlist = await Playlist.findOne({
      _id: playlistId,
      $or: [
        { proprietaire: userId },
        { 'collaborateurs.utilisateur': userId, 'collaborateurs.permissions': { $in: ['MODIFICATION'] } }
      ]
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée ou permissions insuffisantes"
      });
    }

    // Mettre à jour l'ordre des vidéos
    videoOrders.forEach(item => {
      const video = playlist.videos.find(v => v.video_id.toString() === item.videoId);
      if (video) {
        video.ordre = item.ordre;
      }
    });

    playlist.modified_date = Date.now();
    playlist.modified_by = userId;

    await playlist.save();

    res.status(200).json({
      success: true,
      message: "Ordre des vidéos mis à jour avec succès"
    });
  } catch (err) {
    console.error("Erreur lors de la réorganisation de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors de la réorganisation de la playlist"
    });
  }
};

/**
 * @desc    Partager une playlist
 * @route   POST /api/playlists/:id/share
 * @access  Private
 */
exports.sharePlaylist = async (req, res) => {
  try {
    const { id: playlistId } = req.params;
    const { destinataires, message } = req.body;
    const userId = req.user._id;

    // Vérifier que la playlist existe
    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist non trouvée"
      });
    }

    // Vérifier que l'utilisateur a le droit de partager cette playlist
    if (playlist.visibilite === 'PRIVE' && !playlist.proprietaire.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: "Vous n'avez pas l'autorisation de partager cette playlist"
      });
    }

    // TODO: Implémenter la logique d'envoi de notification ou email aux destinataires
    
    // Pour l'instant, juste enregistrer l'action de partage
    await LogAction.create({
      type_action: "PLAYLIST_PARTAGEE",
      description_action: `Playlist "${playlist.nom}" partagée`,
      id_user: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_by: userId,
      donnees_supplementaires: {
        playlist_id: playlistId,
        playlist_nom: playlist.nom,
        destinataires,
        message
      }
    });

    res.status(200).json({
      success: true,
      message: "Playlist partagée avec succès",
      shareUrl: `${process.env.FRONTEND_URL || 'https://throwback-frontend.onrender.com'}/dashboard/playlists/${playlistId}`
    });
  } catch (err) {
    console.error("Erreur lors du partage de la playlist:", err);
    res.status(500).json({
      success: false,
      message: "Une erreur est survenue lors du partage de la playlist"
    });
  }
};