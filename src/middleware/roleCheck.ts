import { Request, Response, NextFunction } from 'express';
import { createDiscordConfig } from '../config/discord.js';

// Durée de validité du cache des rôles (1 heure)
const ROLE_CACHE_DURATION: number = 60 * 60 * 1000; // 1 heure en millisecondes

// Types pour les données utilisateur Discord
interface DiscordMember {
  user?: {
    username: string;
  };
  nick?: string;
  roles: string[];
}

interface RoleData {
  roles: string[];
  hasRequiredRole: boolean;
  username: string;
  lastChecked: number;
}

interface UserRoleData {
  roles: string[];
  hasRequiredRole: boolean;
  lastChecked: number;
  username: string;
}

// Types étendus pour Express avec sessions et user
interface AuthenticatedRequest extends Request {
  session: Request['session'] & {
    user?: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
      accessToken: string;
      roles?: UserRoleData;
    };
  };
  user?: {
    id: string;
    username: string;
    roles: string[];
    lastRoleCheck: number;
  };
}

// Fonction pour vérifier et mettre à jour les rôles d'un utilisateur
async function checkAndUpdateUserRoles(
  userId: string,
  accessToken: string,
  botToken: string,
  guildId: string,
  requiredRoleId: string
): Promise<RoleData> {
  try {
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API Discord error: ${response.status}`);
    }

    const member: DiscordMember = await response.json();
    const userRoles: string[] = member.roles || [];
    const hasRequiredRole: boolean = userRoles.includes(requiredRoleId);

    return {
      roles: userRoles,
      hasRequiredRole,
      username: member.user?.username || member.nick || 'Unknown',
      lastChecked: Date.now()
    };
  } catch (error) {
    console.error('❌ Erreur récupération rôles Discord:', error);
    throw error;
  }
}

// Middleware de vérification des rôles avec cache intelligent
export function requireRole(requiredRoleId: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Vérifier d'abord l'authentification
      if (!req.session.user) {
        res.status(401).json({ error: 'Authentification requise' });
        return;
      }

      // Vérifier si l'utilisateur est sur le serveur avec le bon rôle
      const config = createDiscordConfig();
      const guildId: string = config.GUILD_ID;
      const roleToCheck: string = requiredRoleId || config.REQUIRED_ROLE_ID;

      // Initialiser les données de rôle si elles n'existent pas
      if (!req.session.user.roles) {
        req.session.user.roles = {
          roles: [],
          hasRequiredRole: false,
          lastChecked: 0,
          username: req.session.user.username
        };
      }

      const userRoles = req.session.user.roles!;
      const now: number = Date.now();
      const needsRefresh: boolean = (now - userRoles.lastChecked) > ROLE_CACHE_DURATION;

      // Rafraîchir les rôles si nécessaire ou si on ne les a jamais vérifiés
      if (needsRefresh || userRoles.lastChecked === 0) {
        try {
          const roleData: RoleData = await checkAndUpdateUserRoles(
            req.session.user.id,
            req.session.user.accessToken,
            config.BOT_TOKEN,
            guildId,
            roleToCheck
          );

          // Mettre à jour la session avec les nouvelles données
          req.session.user.roles = {
            roles: roleData.roles,
            hasRequiredRole: roleData.hasRequiredRole,
            lastChecked: roleData.lastChecked,
            username: roleData.username
          };

          // Sauvegarder la session mise à jour
          req.session.save();

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log('⚠️ Erreur vérification rôles Discord:', errorMessage);
          // En cas d'erreur API, utiliser les données en cache si elles existent et sont récentes
          if (userRoles.lastChecked > 0 && (now - userRoles.lastChecked) < (24 * 60 * 60 * 1000)) {
            console.log('⚠️ Utilisation des rôles en cache suite à erreur API');
          } else {
            // Configuration manquante - permettre l'accès temporairement
            if (errorMessage.includes('API Discord error: 404')) {
              console.log('⚠️ Configuration Discord incomplète - accès temporairement autorisé');
              req.session.user.roles = {
                roles: [],
                hasRequiredRole: true,
                lastChecked: Date.now(),
                username: req.session.user.username || 'Unknown'
              };
              req.session.save();
            } else {
              res.status(403).json({ error: 'Erreur de vérification des rôles Discord' });
              return;
            }
          }
        }
      }

      // Vérifier si l'utilisateur a le rôle requis
      if (!req.session.user.roles!.hasRequiredRole) {
        res.status(403).json({ error: 'Rôle requis non trouvé' });
        return;
      }

      // Ajouter les informations utilisateur au request pour usage dans les routes
      req.user = {
        id: req.session.user.id,
        username: req.session.user.roles!.username,
        roles: req.session.user.roles!.roles,
        lastRoleCheck: req.session.user.roles!.lastChecked
      };

      next();
    } catch (error) {
      console.error('❌ Erreur vérification rôle:', error);
      res.status(500).json({ error: 'Erreur vérification rôle' });
    }
  };
}
