import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Item from '../models/Item.js';
import { buildFilters, escapeRegex } from '../utils/helpers.js';
import { AuthenticatedRequest, GameItem, ItemFilters, PaginatedResponse } from '../types/index.js';

const router = express.Router();

// Appliquer l'authentification à toutes les routes
router.use(requireAuth);

// Suggestions d'items par pertinence
router.get('/suggest', async (req: Request, res: Response) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);

  const rxContains = new RegExp(escapeRegex(q), 'i');
  const rxStarts = new RegExp('^' + escapeRegex(q), 'i');
  const rxWord = new RegExp('(^|\\s)' + escapeRegex(q), 'i');

  try {
    const rows = await Item.aggregate([
      { $match: { nom: { $regex: rxContains } } },
      { $addFields: {
        _starts: { $regexMatch: { input: '$nom', regex: rxStarts } },
        _word: { $regexMatch: { input: '$nom', regex: rxWord } }
      }},
      { $addFields: {
        score: { $cond: ['$_starts', 3, { $cond: ['$_word', 2, 1] }] }
      }},
      { $sort: { score: -1, nom: 1 } },
      { $limit: 10 },
      { $project: {
        _id: 1, id: 1, nom: 1, categorie: 1, sous_categorie: 1,
        image_url: 1, image_local: 1, url_fiche: 1
      }}
    ]);
    res.json(rows);
  } catch (e) {
    const rows = await Item.find({ nom: { $regex: rxContains } })
      .sort({ nom: 1 })
      .limit(10)
      .lean();
    res.json(rows);
  }
});

// Recherche d'un item par nom exact
router.get('/exact/:name', async (req: Request, res: Response) => {
  const name = decodeURIComponent(req.params.name || '').trim();

  if (!name) {
    return res.status(400).json({ error: 'Nom requis' });
  }

  try {
    const item = await Item.findOne({
      nom: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }
    }).lean();

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' });
    }

    res.json(item);
  } catch (error) {
    console.error('Erreur recherche item exact:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Recherche d'items (utilisée par le bot)
router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);

  const rxContains = new RegExp(escapeRegex(q), 'i');
  const rxStarts = new RegExp('^' + escapeRegex(q), 'i');
  const rxWord = new RegExp('(^|\\s)' + escapeRegex(q), 'i');

  try {
    const items = await Item.aggregate([
      { $match: { nom: { $regex: rxContains } } },
      { $addFields: {
        _starts: { $regexMatch: { input: '$nom', regex: rxStarts } },
        _word: { $regexMatch: { input: '$nom', regex: rxWord } }
      }},
      { $addFields: {
        score: { $cond: ['$_starts', 3, { $cond: ['$_word', 2, 1] }] }
      }},
      { $sort: { score: -1, nom: 1 } },
      { $limit: 25 }, // Limiter pour le bot
      { $project: {
        _id: 1,
        id: 1,
        nom: 1,
        categorie: 1,
        sous_categorie: 1,
        image_url: 1,
        image_local: 1,
        url_fiche: 1,
        tier: 1,
        volume: 1,
        quantite: 1,
        description: 1
      }}
    ]);

    res.json(items);
  } catch (error) {
    console.error('Erreur recherche items:', error);
    // Fallback vers une recherche simple
    const items = await Item.find({
      $or: [
        { nom: { $regex: rxContains } },
        { categorie: { $regex: rxContains } },
        { sous_categorie: { $regex: rxContains } }
      ]
    })
    .sort({ nom: 1 })
    .limit(25)
    .lean();

    res.json(items);
  }
});

// Liste/pagination/recherche + filtres
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page?.toString() || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit?.toString() || '20', 10)));
  const filter = buildFilters(req.query as any);

  // Tri: sort=champ:dir (ex: nom:asc, quantite:desc)
  let sort: any = { nom: 1 };
  const sortQ = (req.query.sort || '').toString().trim();
  if (sortQ) {
    const [field, dir] = sortQ.split(':');
    if (field) sort = { [field]: dir === 'desc' ? -1 : 1 };
  }

  const [total, rows] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
  ]);

  const response: PaginatedResponse<GameItem> = {
    items: rows as unknown as GameItem[],
    total,
    page,
    limit
  };

  res.json(response);
});

// Export CSV avec filtres
router.get('/export.csv', async (req: Request, res: Response) => {
  const filter = buildFilters(req.query as any);
  const rows = await Item.find(filter).sort({ nom: 1 });

  const headers = ['id', 'nom', 'categorie', 'sous_categorie', 'quantite'];
  const escapeCsv = (v: any): string => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.id ?? ''),
      escapeCsv(r.nom ?? ''),
      escapeCsv(r.categorie ?? ''),
      escapeCsv(r.sous_categorie ?? ''),
      escapeCsv(r.quantite ?? 0),
    ].join(','));
  }

  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="items_quantites.csv"');
  res.send(csv);
});

// Mise à jour de quantité: set ou increment
router.patch('/:id/quantite', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { set, inc } = req.body || {};
  const update: any = {};

  if (typeof set === 'number') update.$set = { quantite: set };
  if (typeof inc === 'number') update.$inc = { quantite: inc };

  if (!update.$set && !update.$inc) {
    return res.status(400).json({ error: 'set ou inc requis' });
  }

  const doc = await Item.findOneAndUpdate({ id }, update, { new: true });
  if (!doc) return res.status(404).json({ error: 'Item non trouvé' });

  res.json(doc);
});

export default router;
