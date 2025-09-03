import express, { Request, Response } from 'express';
import { requireAuth, registerBotSession } from '../middleware/auth.js';
import { DiscordService } from '../services/discordService.js';
import { createDiscordConfig } from '../config/discord.js';
import activityLogger from '../services/activityLogger.js';
import {
  AuthenticatedRequest,
  DiscordTokenData,
  DiscordUser,
  DiscordGuild,
  DiscordMember
} from '../types/index.js';

const router = express.Router();

// Route pour initier l'authentification Discord
router.get('/discord', (req: Request, res: Response) => {
  const config = createDiscordConfig();
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(config.REDIRECT_URI)}&response_type=code&scope=${config.SCOPES}`;
  res.json({ authUrl });
});

// Route d'authentification pour le bot Discord
router.post('/bot/auth', async (req: Request, res: Response) => {
  const { discordUserId, username, discriminator, avatar } = req.body;

  if (!discordUserId || !username) {
    return res.status(400).json({ error: 'Informations utilisateur Discord manquantes' });
  }

  try {
    // Générer un token de session pour le bot
    const sessionToken = `bot_${discordUserId}_${Date.now()}`;

    // Créer une session pour le bot
    const botSession = {
      id: discordUserId,
      username,
      discriminator: discriminator || '0000',
      avatar,
      email: `${username}@discord.bot`,
      accessToken: sessionToken, // Utiliser le token de session comme accessToken
      isBot: true,
      createdAt: new Date().toISOString()
    };

    // Enregistrer la session bot dans le cache
    registerBotSession(sessionToken, botSession);

    // Stocker aussi en session normale pour compatibilité
    (req as AuthenticatedRequest).session.user = botSession;

    res.json({
      success: true,
      user: botSession,
      sessionToken,
      message: 'Bot authentifié avec succès'
    });

    // Logging de la connexion bot
    await activityLogger.logUserLogin(discordUserId, username);

  } catch (error) {
    console.error('Erreur lors de l\'authentification du bot:', error);
    res.status(500).json({ error: 'Erreur lors de l\'authentification du bot' });
  }
});

// Callback Discord OAuth2
router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code d\'autorisation manquant' });
  }

  try {
    // Échange du code contre un token
    const tokenData: DiscordTokenData = await DiscordService.exchangeCodeForToken(code);

    // Récupération des informations utilisateur
    const userData: DiscordUser = await DiscordService.getUserInfo(tokenData.access_token);

    // Stockage en session
    (req as AuthenticatedRequest).session.user = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      email: userData.email,
      accessToken: tokenData.access_token
    };

    // Logging de la connexion
    await activityLogger.logUserLogin(userData.id, userData.username);

    res.redirect('http://localhost:3000/');
  } catch (error) {
    console.error('Erreur d\'authentification Discord:', error);
    res.status(500).json({ error: 'Erreur d\'authentification' });
  }
});

// Déconnexion
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  console.log('🚪 Requête de déconnexion reçue côté serveur');

  try {
    // Logging de la déconnexion avant destruction de session
    const user = req.session.user;
    console.log('👤 Utilisateur en session:', user ? user.username : 'Aucun');

    if (user) {
      await activityLogger.logUserLogout(user.id, user.username);
      console.log('📝 Log de déconnexion enregistré');
    }

    req.session.destroy((err: any) => {
      if (err) {
        console.error('❌ Erreur lors de la destruction de session:', err);
        return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
      }
      console.log('✅ Session détruite avec succès');
      res.json({ message: 'Déconnexion réussie' });
    });
  } catch (error) {
    console.error('❌ Erreur lors du logging de déconnexion:', error);
    // Même en cas d'erreur de logging, on continue la déconnexion
    req.session.destroy((err: any) => {
      if (err) {
        console.error('❌ Erreur lors de la déconnexion (fallback):', err);
        return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
      }
      console.log('✅ Session détruite avec succès (fallback)');
      res.json({ message: 'Déconnexion réussie' });
    });
  }
});

// Informations de l'utilisateur connecté
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});

// Vérification des serveurs et rôles
router.get('/servers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = createDiscordConfig();
    // Récupérer les serveurs de l'utilisateur
    const guilds: DiscordGuild[] = await DiscordService.getUserGuilds(req.session.user!.accessToken);

    // Filtrer pour le serveur spécifique
    const targetGuild = guilds.find(g => g.id === config.GUILD_ID);

    if (targetGuild) {
      // Récupérer les détails du membre sur ce serveur
      const member: DiscordMember | null = await DiscordService.getGuildMember(config.GUILD_ID, req.session.user!.id);

      if (member) {
        res.json({
          guild: targetGuild,
          member: member,
          roles: member.roles
        });
      } else {
        res.json({
          guild: targetGuild,
          member: null,
          roles: []
        });
      }
    } else {
      res.json({
        guild: null,
        member: null,
        roles: []
      });
    }
  } catch (error) {
    console.error('Erreur récupération serveurs:', error);
    res.status(500).json({ error: 'Erreur récupération serveurs' });
  }
});

export default router;
