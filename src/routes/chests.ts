import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { createDiscordConfig } from '../config/discord.js';
import Chest from '../models/Chest.js';
import Item from '../models/Item.js';
import { escapeRegex } from '../utils/helpers.js';
import { AuthenticatedRequest, Chest as ChestType, ChestEntry, GameItem } from '../types/index.js';
import activityLogger from '../services/activityLogger.js';

// Interface étendue pour les requêtes avec body et params
interface RequestWithBody extends Request {
  body: any;
}

interface RequestWithParams extends Request {
  params: {
    id: string;
  };
}

const router = express.Router();

// Appliquer l'authentification et la vérification des rôles à toutes les routes
router.use(requireAuth);
router.use(requireRole(createDiscordConfig().REQUIRED_ROLE_ID));

// Types pour les réponses
interface ChestSummary {
  _id: string;
  name: string;
  createdAt: Date;
  entries: number;
  totalQuantity: number;
}

interface ChestWithItems extends ChestType {
  items: (ChestEntry & { item?: GameItem })[];
}

// Liste des coffres (résumé)
router.get('/', async (req: Request, res: Response) => {
  const rows = await Chest.find({}).lean();
  const summary: ChestSummary[] = rows.map((c) => ({
    _id: c._id.toString(),
    name: c.name,
    createdAt: c.createdAt,
    entries: c.items.length,
    totalQuantity: c.items.reduce((acc, e) => acc + (e.quantity || 0), 0),
  }));
  res.json(summary);
});

// Créer un coffre
router.post('/', async (req: RequestWithBody, res: Response) => {
  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name requis' });

  const doc = await Chest.create({ name });

  // Logging de l'activité
  const user = (req as any).user;
  if (user) {
    await activityLogger.logChestCreation(user.id, user.username, name);
  }

  res.status(201).json(doc);
});

// Détail d'un coffre
router.get('/:id', async (req: RequestWithParams, res: Response) => {
  // Validation de l'ID du coffre
  const chestId = req.params.id;
  if (!chestId || chestId === 'null' || chestId === 'undefined') {
    return res.status(400).json({ error: 'ID de coffre invalide' });
  }

  // Vérifier si c'est un ObjectId valide
  if (!mongoose.Types.ObjectId.isValid(chestId)) {
    return res.status(400).json({ error: 'ID de coffre invalide (format ObjectId incorrect)' });
  }

  const c = await Chest.findById(chestId).lean();
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });

  res.json(c);
});

// Mise à jour/renommage
router.patch('/:id', async (req: RequestWithBody & RequestWithParams, res: Response) => {
  // Validation de l'ID du coffre
  const chestId = req.params.id;
  if (!chestId || chestId === 'null' || chestId === 'undefined') {
    return res.status(400).json({ error: 'ID de coffre invalide' });
  }

  // Vérifier si c'est un ObjectId valide
  if (!mongoose.Types.ObjectId.isValid(chestId)) {
    return res.status(400).json({ error: 'ID de coffre invalide (format ObjectId incorrect)' });
  }

  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const update: any = {};
  if (name) update.name = name;

  const doc = await Chest.findByIdAndUpdate(chestId, update, { new: true });
  if (!doc) return res.status(404).json({ error: 'Coffre introuvable' });

  res.json(doc);
});

// Route DELETE simple supprimée - toutes les suppressions passent maintenant par la route avec authentification

// Items d'un coffre, avec détail des items
router.get('/:id/items', async (req: RequestWithParams, res: Response) => {
  // Validation de l'ID du coffre
  const chestId = req.params.id;
  if (!chestId || chestId === 'null' || chestId === 'undefined') {
    return res.status(400).json({ error: 'ID de coffre invalide' });
  }

  // Vérifier si c'est un ObjectId valide
  if (!mongoose.Types.ObjectId.isValid(chestId)) {
    return res.status(400).json({ error: 'ID de coffre invalide (format ObjectId incorrect)' });
  }

  const c = await Chest.findById(chestId).lean();
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });

  const idsNum = [...new Set(c.items.filter(e => typeof e.itemId === 'number').map((e) => e.itemId))];
  const idsObj = [...new Set(c.items.filter(e => e.itemMongoId).map((e) => e.itemMongoId))];

  const items = await Item.find({
    $or: [
      { id: { $in: idsNum } },
      { _id: { $in: idsObj } }
    ]
  }).lean();

  const byNum = new Map(items.filter(it => typeof it.id === 'number').map((it) => [it.id, it]));
  const byObj = new Map(items.map((it) => [String(it._id), it]));

  const rows = c.items.map((e) => ({
    itemId: e.itemId,
    itemMongoId: e.itemMongoId,
    quantity: e.quantity,
    item: (typeof e.itemId === 'number' ? byNum.get(e.itemId) : byObj.get(String(e.itemMongoId))) || null,
  }));

  const response = {
    chestId: c._id,
    name: c.name,
    items: rows
  };

  res.json(response);
});

// Dépôt/retrait d'un item dans un coffre
router.post('/:id/move', async (req: RequestWithBody & RequestWithParams, res: Response) => {
  const chestId = req.params.id;
  let hasNum = req.body?.itemId !== undefined && req.body?.itemId !== null && req.body?.itemId !== '';
  let itemId = hasNum ? Number(req.body.itemId) : undefined;
  const itemMongoIdStr = req.body?.itemMongoId ? String(req.body.itemMongoId) : undefined;
  const itemName = req.body?.name ? String(req.body.name).trim() : undefined;
  let itemMongoId: mongoose.Types.ObjectId | undefined = undefined;

  if (itemMongoIdStr) {
    if (!mongoose.isValidObjectId(itemMongoIdStr)) {
      return res.status(400).json({ error: 'itemMongoId invalide' });
    }
    itemMongoId = new mongoose.Types.ObjectId(itemMongoIdStr);
  }

  const inc = Number(req.body?.inc || 0);
  if (!hasNum && !itemMongoId && !itemName) {
    return res.status(400).json({ error: 'itemId, itemMongoId ou name requis' });
  }
  if (hasNum && !Number.isFinite(itemId)) {
    return res.status(400).json({ error: 'itemId invalide' });
  }
  if (!Number.isFinite(inc) || inc === 0) {
    return res.status(400).json({ error: 'inc requis (non nul)' });
  }

  const c = await Chest.findById(chestId);
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });

  // Vérifie l'existence réelle de l'item (avec fallback par nom)
  let itemDoc = await Item.findOne(
    hasNum ? { id: itemId } :
    (itemMongoId ? { _id: itemMongoId } :
    { nom: { $regex: '^' + escapeRegex(itemName || '') + '$', $options: 'i' } })
  ).lean();

  if (!itemDoc) return res.status(400).json({ error: 'Item introuvable' });

  // Normaliser les clés d'entrée
  if (!hasNum && typeof itemDoc.id === 'number') {
    hasNum = true;
    itemId = itemDoc.id;
  }
  if (!itemMongoId) itemMongoId = new mongoose.Types.ObjectId(itemDoc._id.toString());

  const entry = c.items.find((e) => {
    if (hasNum && typeof itemId === 'number' && e.itemId === itemId) return true;
    if (e.itemMongoId && String(e.itemMongoId) === String(itemMongoId)) return true;
    return false;
  });

  if (!entry) {
    if (inc < 0) return res.status(400).json({ error: 'Quantité insuffisante' });
    c.items.push({
      itemId: hasNum ? itemId : undefined,
      itemMongoId: itemMongoId,
      quantity: inc
    });
  } else {
    const next = (entry.quantity || 0) + inc;
    if (next < 0) return res.status(400).json({ error: 'Quantité insuffisante' });
    entry.quantity = next;
  }

  c.items = c.items.filter((e) => (e.quantity || 0) > 0);
  await c.save();

  // Logging de l'activité
  const user = (req as any).user;
  if (user) {
    const oldQuantity = entry ? (entry.quantity || 0) - inc : 0;
    const newQuantity = entry ? entry.quantity : inc;

    await activityLogger.logItemQuantityUpdate(
      user.id,
      user.username,
      chestId,
      c.name,
      itemMongoId?.toString() || itemId?.toString() || '',
      itemDoc.nom,
      oldQuantity,
      newQuantity
    );
  }

  res.json({ ok: true });
});

// Agrégat global de tous les coffres
router.get('/aggregate', async (req: Request, res: Response) => {
  const chests = await Chest.find({}).lean();
  const map = new Map<string, number>();

  for (const c of chests) {
    for (const e of (c.items || [])) {
      const key = typeof e.itemId === 'number' ? `num:${e.itemId}` : `obj:${String(e.itemMongoId)}`;
      const cur = map.get(key) || 0;
      map.set(key, cur + (e.quantity || 0));
    }
  }

  const idsNum: number[] = [];
  const idsObj: mongoose.Types.ObjectId[] = [];
  for (const k of map.keys()) {
    if (k.startsWith('num:')) idsNum.push(Number(k.slice(4)));
    else if (k.startsWith('obj:')) idsObj.push(new mongoose.Types.ObjectId(k.slice(4)));
  }

  const items = await Item.find({
    $or: [
      { id: { $in: idsNum } },
      { _id: { $in: idsObj } }
    ]
  }).lean();

  const byNum = new Map(items.filter(it => typeof it.id === 'number').map((it) => [it.id, it]));
  const byObj = new Map(items.map((it) => [String(it._id), it]));

  const rows = [];
  for (const [k, q] of map.entries()) {
    if (k.startsWith('num:')) {
      rows.push({
        itemId: Number(k.slice(4)),
        quantity: q,
        item: byNum.get(Number(k.slice(4))) || null
      });
    } else {
      rows.push({
        itemMongoId: k.slice(4),
        quantity: q,
        item: byObj.get(k.slice(4)) || null
      });
    }
  }

  res.json({ totalItems: rows.length, items: rows });
});

// Renommer un coffre
router.patch('/:id/rename', async (req: AuthenticatedRequest & RequestWithParams, res: Response) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return res.status(400).json({ error: 'Le nouveau nom est requis' });
    }

    if (newName.length > 50) {
      return res.status(400).json({ error: 'Le nom ne peut pas dépasser 50 caractères' });
    }

    const chest = await Chest.findById(id);
    if (!chest) {
      return res.status(404).json({ error: 'Coffre non trouvé' });
    }

    // Vérifier que le nom n'est pas déjà utilisé
    const existingChest = await Chest.findOne({
      name: newName.trim(),
      _id: { $ne: id }
    });

    if (existingChest) {
      return res.status(409).json({ error: 'Un coffre avec ce nom existe déjà' });
    }

    const oldName = chest.name;
    chest.name = newName.trim();
    await chest.save();

    // Logger l'activité
    await activityLogger.logChestRename(req.user!.id, req.user!.username, id, oldName, chest.name);

    res.json({
      ok: true,
      chest: {
        _id: chest._id,
        name: chest.name,
        createdAt: chest.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur lors du renommage du coffre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un coffre avec migration optionnelle
router.delete('/:id', async (req: AuthenticatedRequest & RequestWithParams, res: Response) => {
  try {
    const { id } = req.params;
    const { migrateTo, confirmed } = req.body;

    const chest = await Chest.findById(id);
    if (!chest) {
      return res.status(404).json({ error: 'Coffre non trouvé' });
    }



    // Si le coffre n'est pas vide et qu'aucune migration n'est demandée et que ce n'est pas confirmé
    if (chest.items.length > 0 && !migrateTo && !confirmed) {
      return res.status(400).json({
        error: 'Le coffre n\'est pas vide',
        requiresMigration: true,
        itemCount: chest.items.length,
        availableChests: await Chest.find({ _id: { $ne: id } }).select('_id name').lean()
      });
    }

    // Si confirmation requise
    if (chest.items.length > 0 && !confirmed) {
      return res.status(400).json({
        error: 'Confirmation requise',
        requiresConfirmation: true,
        itemCount: chest.items.length,
        migrateTo: migrateTo || null
      });
    }

    // Migration des items si demandé
    let migratedItemCount = 0;
    if (migrateTo && chest.items.length > 0) {
      const targetChest = await Chest.findById(migrateTo);
      if (!targetChest) {
        return res.status(404).json({ error: 'Coffre de destination non trouvé' });
      }

      // Créer une copie des items à migrer
      const itemsToMigrate = [...chest.items];

      // Migrer chaque item
      for (const item of itemsToMigrate) {

        // Chercher un item existant dans le coffre cible
        const existingItemIndex = targetChest.items.findIndex(
          (ti) => {
            // Comparer par itemMongoId si disponible
            if (ti.itemMongoId && item.itemMongoId) {
              return ti.itemMongoId.toString() === item.itemMongoId.toString();
            }
            // Sinon comparer par itemId
            return ti.itemId === item.itemId;
          }
        );

        if (existingItemIndex !== -1) {
          targetChest.items[existingItemIndex].quantity += item.quantity;
        } else {
          targetChest.items.push({
            itemId: item.itemId,
            itemMongoId: item.itemMongoId,
            quantity: item.quantity
          });
        }
        migratedItemCount += item.quantity;
      }

      // Sauvegarder le coffre cible AVANT de supprimer le source
      try {
        await targetChest.save();
      } catch (migrationError) {
        console.error('Erreur lors de la sauvegarde du coffre cible:', migrationError);
        return res.status(500).json({ error: 'Erreur lors de la migration des items' });
      }

      // Vider le coffre source après migration réussie
      try {
        chest.items = [];
        await chest.save();
      } catch (sourceError) {
        console.error('Erreur lors du vidage du coffre source:', sourceError);
        // Ne pas retourner d'erreur ici car la migration a réussi
      }
    }

    // Supprimer le coffre
    await Chest.findByIdAndDelete(id);

    // Logger l'activité
    await activityLogger.logChestDeletion(req.user!.id, req.user!.username, id, chest.name);

    const response = {
      ok: true,
      deleted: {
        _id: id,
        name: chest.name,
        itemCount: migratedItemCount || chest.items.length
      },
      migratedTo: migrateTo || null,
      migration: migrateTo ? {
        itemCount: migratedItemCount,
        targetChest: await Chest.findById(migrateTo).select('name').lean()
      } : null
    };

    res.json(response);

  } catch (error) {
    console.error('Erreur lors de la suppression du coffre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
