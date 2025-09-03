import express, { Request, Response } from 'express';
import ActivityLog from '../models/ActivityLog.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { createDiscordConfig } from '../config/discord.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = express.Router();

// Appliquer l'authentification et la vérification des rôles à toutes les routes
router.use(requireAuth);
router.use(requireRole(createDiscordConfig().REQUIRED_ROLE_ID));

// GET /api/logs - Récupérer les logs d'activité avec pagination et filtres
router.get('/', async (req: Request & AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      action,
      chestId,
      actionType,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Construction de la requête de filtrage
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (chestId) filter.chestId = chestId;

    // Filtre par type d'action (grouper les actions similaires)
    if (actionType) {
      const chestActions = ['CREATE_CHEST', 'DELETE_CHEST'];
      const itemActions = ['ADD_ITEM', 'REMOVE_ITEM', 'UPDATE_ITEM_QUANTITY'];
      const authActions = ['LOGIN', 'LOGOUT'];

      switch (actionType) {
        case 'chest':
          filter.action = { $in: chestActions };
          break;
        case 'item':
          filter.action = { $in: itemActions };
          break;
        case 'auth':
          filter.action = { $in: authActions };
          break;
        default:
          filter.action = actionType;
      }
    }

    // Filtre par date
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    // Construction du tri
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Récupération des logs
    const logs = await ActivityLog.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Comptage total pour la pagination
    const total = await ActivityLog.countDocuments(filter);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/logs/stats - Statistiques des logs
router.get('/stats', async (req: Request & AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalLogs,
      userCount,
      chestCount,
      actionStats
    ] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.distinct('userId').then(ids => ids.length),
      ActivityLog.distinct('chestId').then(ids => ids.length),
      ActivityLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // Logs des 24 dernières heures
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await ActivityLog.countDocuments({
      createdAt: { $gte: yesterday }
    });

    res.json({
      totalLogs,
      uniqueUsers: userCount,
      uniqueChests: chestCount,
      recentActivity: recentLogs,
      actionBreakdown: actionStats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/logs/users - Récupérer la liste des utilisateurs uniques
router.get('/users', async (req: Request & AuthenticatedRequest, res: Response) => {
  try {
    // Récupérer les utilisateurs uniques depuis les logs
    const users = await ActivityLog.aggregate([
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          discordUsername: { $first: '$discordUsername' },
          discordId: { $first: '$discordId' },
          lastActivity: { $max: '$createdAt' }
        }
      },
      {
        $project: {
          _id: 1,
          username: 1,
          discordUsername: 1,
          discordId: 1,
          lastActivity: 1
        }
      },
      {
        $sort: { lastActivity: -1 }
      }
    ]);

    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/logs - Créer un nouveau log (utilisé en interne)
router.post('/', async (req: Request & AuthenticatedRequest, res: Response) => {
  try {
    const logData = {
      ...req.body,
      userId: req.user?.id,
      username: req.user?.username,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    const log = new ActivityLog(logData);
    await log.save();

    res.status(201).json(log);
  } catch (error) {
    console.error('Erreur lors de la création du log:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
