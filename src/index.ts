import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'express-async-errors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { existsSync } from 'fs';

// Configuration
import { connectDatabase } from './config/database.js';
import { createDiscordConfig, SESSION_CONFIG } from './config/discord.js';

// Middlewares
import { requireAuth } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import chestsRoutes from './routes/chests.js';
import importRoutes from './routes/import.js';
import logsRoutes from './routes/logs.js';

// Configuration pour les modules ES
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Chargement des variables d'environnement AVANT les imports
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Créer la configuration Discord APRÈS le chargement des variables
const DISCORD_CONFIG = createDiscordConfig();

// Interface pour étendre Request avec user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        roles: string[];
        lastRoleCheck: number;
      };
    }
  }
}

const app = express();

// Configuration CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Middlewares
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Configuration des sessions
app.use(session({
  secret: SESSION_CONFIG.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: SESSION_CONFIG.COOKIE
}));

// Routes statiques pour les images
const imagesRoot: string = path.join(__dirname, '../../images');
app.use('/images', express.static(imagesRoot));

// Routes publiques (sans authentification)
app.get('/health', (req: Request, res: Response) => res.json({ ok: true }));
app.get('/api/health', (req: Request, res: Response) => res.json({ ok: true, api: true }));

// Routes API avec préfixe (protégées par authentification dans chaque routeur)
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/chests', chestsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/import', importRoutes);

// Routes sans préfixe (pour compatibilité)
app.use('/auth', authRoutes);
app.use('/items', itemsRoutes);
app.use('/chests', chestsRoutes);
app.use('/logs', logsRoutes);
app.use('/import', importRoutes);

// Gestion des erreurs 404
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion globale des erreurs
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erreur globale:', error);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Démarrage du serveur
async function startServer(): Promise<void> {
  try {
    // Connexion à la base de données
    await connectDatabase();

    // Démarrage du serveur Express
    const port: number = parseInt(process.env.PORT || '4000', 10);
    app.listen(port, () => {
      console.log(`🚀 API démarrée sur http://localhost:${port}`);
    });
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

startServer();
