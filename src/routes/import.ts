import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Item from '../models/Item.js';
import path from 'path';
import fs from 'fs';
import { GameItem } from '../types/index.js';

const router = express.Router();

// Appliquer l'authentification à toutes les routes
router.use(requireAuth);

// Interface pour les données d'import
interface ImportData {
  items?: GameItem[];
}

// Import depuis fichier JSON généré
router.post('/', async (req: Request, res: Response) => {
  const filePath = req.body?.path || path.join(process.cwd(), '../../dune_awakening_items_fr.json');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }

  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data: ImportData = JSON.parse(rawData);
    const items: GameItem[] = Array.isArray(data?.items) ? data.items : [];

    // upsert par id + nom
    let inserted = 0;
    for (const it of items) {
      const query = it.id != null ? { id: it.id } : { nom: it.nom };
      await Item.updateOne(query, { $set: it }, { upsert: true });
      inserted += 1;
    }

    res.json({ inserted });
  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

export default router;
