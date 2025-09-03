import { Request, Response, NextFunction } from 'express';

// Types étendus pour Express avec sessions
interface AuthenticatedRequest extends Request {
  session: Request['session'] & {
    user?: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
      accessToken: string;
      roles?: {
        list: string[];
        hasRequiredRole: boolean;
        lastChecked: number;
        username: string;
      };
    };
  };
}

// Cache des sessions bot (token -> userData)
const botSessions = new Map();

// Middleware d'authentification étendu (sessions + tokens Bearer)
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Vérifier d'abord la session utilisateur normale
  if (req.session.user) {
    return next();
  }

  // Vérifier le token Bearer pour les bots
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Enlever "Bearer "

    // Vérifier si c'est un token de bot valide
    const botUser = botSessions.get(token);
    if (botUser) {
      // Injecter l'utilisateur bot dans la session pour la suite du traitement
      req.session.user = botUser;
      return next();
    }
  }

  res.status(401).json({ error: 'Authentification requise' });
}

// Fonction pour enregistrer une session bot
export function registerBotSession(token: string, userData: any): void {
  botSessions.set(token, userData);
}
