import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import 'express-async-errors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Forcer le chargement du fichier .env depuis le bon dossier
dotenv.config({ path: path.join(__dirname, '..', '.env') });
// Test avec le fichier local aussi
dotenv.config({ path: '.env.test' });

// Test ultime : voir si dotenv fonctionne
console.log('🔍 Test dotenv:');
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('process.env.PATH:', process.env.PATH ? '✅ Chargé' : '❌ Non chargé');
console.log('process.env.DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID);

// Solution alternative : charger manuellement le fichier .env
try {
  const fs = await import('fs');
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('🔍 Contenu du fichier .env (premières lignes):');
  envContent.split('\n').slice(0, 3).forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      console.log('  ', line.substring(0, 20) + '...');
    }
  });
} catch (error) {
  console.log('❌ Erreur lecture fichier .env:', error.message);
}

// Debug: Vérifier le chemin du fichier .env
console.log('📁 Dossier courant:', process.cwd());
console.log('📁 Dossier du fichier:', __dirname);
console.log('🔍 Fichier .env existe:', existsSync(path.join(__dirname, '..', '.env')));
console.log('🔍 Fichier .env dans le dossier courant:', existsSync('.env'));

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Configuration Discord OAuth2
console.log('🔍 Variables d\'environnement chargées:');
console.log('DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID ? '✅ Chargé' : '❌ Non chargé');
console.log('DISCORD_CLIENT_SECRET:', process.env.DISCORD_CLIENT_SECRET ? '✅ Chargé' : '❌ Non chargé');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Chargé' : '❌ Non chargé');

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'your_discord_client_id';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'your_discord_client_secret';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/auth/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your_session_secret';

// Middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
    sameSite: 'lax',
    httpOnly: true
  }
}));

// Middleware d'authentification
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentification requise' });
  }
}

// Middleware de vérification des rôles
function requireRole(requiredRoleId) {
  return (req, res, next) => {
    // Vérifier d'abord l'authentification
    if (!req.session.user) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    // Vérifier si l'utilisateur est sur le serveur avec le bon rôle
    const guildId = process.env.DISCORD_GUILD_ID;
    fetch(`https://discord.com/api/guilds/${guildId}/members/${req.session.user.id}`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    })
    .then(response => {
      if (!response.ok) {
        return res.status(403).json({ error: 'Accès au serveur refusé' });
      }
      return response.json();
    })
    .then(member => {
      const hasRequiredRole = member.roles && member.roles.includes(requiredRoleId);
      
      if (!hasRequiredRole) {
        return res.status(403).json({ error: 'Rôle requis non trouvé' });
      }
      
      next();
    })
    .catch(error => {
      console.error('Erreur vérification rôle:', error);
      res.status(500).json({ error: 'Erreur vérification rôle' });
    });
  };
}

// Routes d'authentification
app.get('/auth/discord', (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify guilds guilds.members.read`;
  res.json({ authUrl });
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Code d\'autorisation manquant' });
  }

  try {
    // Échange du code contre un token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Erreur d\'authentification Discord');
    }

    // Récupération des informations utilisateur
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();
    
    // Stockage en session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      email: userData.email,
      accessToken: tokenData.access_token // Stockage du token pour les requêtes API
    };

    res.redirect('http://localhost:3000/');
  } catch (error) {
    console.error('Erreur d\'authentification Discord:', error);
    res.status(500).json({ error: 'Erreur d\'authentification' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Déconnexion réussie' });
});

app.get('/auth/me', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Non authentifié' });
  }
});

// Route pour vérifier les serveurs et rôles de l'utilisateur
app.get('/auth/servers', requireAuth, async (req, res) => {
  try {
    // Récupérer les serveurs de l'utilisateur
    const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${req.session.user.accessToken}`,
      },
    });

    if (!guildsResponse.ok) {
      throw new Error('Impossible de récupérer les serveurs');
    }

    const guilds = await guildsResponse.json();
    
    // Filtrer pour un serveur spécifique (remplace par ton serveur ID)
    const targetGuildId = process.env.DISCORD_GUILD_ID; // À ajouter dans .env
    const targetGuild = guilds.find(g => g.id === targetGuildId);
    
    if (targetGuild) {
      // Récupérer les détails du membre sur ce serveur
      const memberResponse = await fetch(`https://discord.com/api/guilds/${targetGuildId}/members/${req.session.user.id}`, {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, // Nécessite un bot
        },
      });

      console.log('Member response status:', memberResponse.status);
      console.log('Member response headers:', Object.fromEntries(memberResponse.headers.entries()));

      if (memberResponse.ok) {
        const member = await memberResponse.json();
        console.log('Member data:', member);
        res.json({
          guild: targetGuild,
          member: member,
          roles: member.roles
        });
      } else {
        const errorText = await memberResponse.text();
        console.log('Member response error:', errorText);
        res.json({
          guild: targetGuild,
          member: null,
          roles: [],
          error: `HTTP ${memberResponse.status}: ${errorText}`
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

// Static images (mirror path under ../images)
const imagesRoot = path.join(__dirname, '../../images');
app.use('/images', express.static(imagesRoot));

// Mongo connection
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dune';
await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || 'dune' });

// Schema/Model
const itemSchema = new mongoose.Schema({
  id: { type: Number, index: true },
  nom: { type: String, index: true },
  categorie: String,
  sous_categorie: String,
  tier: mongoose.Schema.Types.Mixed,
  unique: Boolean,
  description: String,
  statistiques: [
    {
      attribut: String,
      valeur: mongoose.Schema.Types.Mixed,
      est_pourcentage: Boolean,
      mieux_plus_haut: Boolean,
    },
  ],
  schema: [mongoose.Schema.Types.Mixed],
  sources: [mongoose.Schema.Types.Mixed],
  image: String,
  image_url: String,
  image_local: String,
  tier_icon_url: String,
  tier_icon_local: String,
  url_fiche: String,
  // Gestion quantités
  quantite: { type: Number, default: 0 },
});

// Assure un index unique sparse sur id
itemSchema.index({ id: 1 }, { unique: true, sparse: true });

const Item = mongoose.model('Item', itemSchema);

// =====================
// Modèle Coffre (Chest)
// =====================
const chestEntrySchema = new mongoose.Schema({
  itemId: { type: Number, required: false, index: true, sparse: true },
  itemMongoId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true, sparse: true },
  quantity: { type: Number, required: true, default: 0, min: 0 },
}, { _id: false });

const chestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  items: { type: [chestEntrySchema], default: [] },
  createdAt: { type: Date, default: () => new Date() },
});

chestSchema.index({ name: 1 }, { unique: true });

const Chest = mongoose.model('Chest', chestSchema);

// Routes publiques (sans authentification)
app.get('/health', (req, res) => res.json({ ok: true }));

// Routes protégées (avec authentification)
app.use('/items', requireAuth);
app.use('/chests', requireAuth);
app.use('/import', requireAuth);

// Fonction utilitaire pour échapper les regex
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Import depuis fichier JSON généré
import fs from 'fs';
app.post('/import', async (req, res) => {
  const filePath = req.body?.path || path.join(__dirname, '../../dune_awakening_items_fr.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const items = Array.isArray(data?.items) ? data.items : [];

  // upsert par id + nom
  let inserted = 0;
  for (const it of items) {
    const query = it.id != null ? { id: it.id } : { nom: it.nom };
    await Item.updateOne(query, { $set: it }, { upsert: true });
    inserted += 1;
  }
  res.json({ inserted });
});

// Suggestions d'items par pertinence
app.get('/items/suggest', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  const rxContains = new RegExp(escapeRegex(q), 'i');
  const rxStarts = new RegExp('^' + escapeRegex(q), 'i');
  const rxWord = new RegExp('(^|\\s)' + escapeRegex(q), 'i');
  try {
    const rows = await Item.aggregate([
      { $match: { nom: { $regex: rxContains } } },
      { $addFields: { _starts: { $regexMatch: { input: '$nom', regex: rxStarts } }, _word: { $regexMatch: { input: '$nom', regex: rxWord } } } },
      { $addFields: { score: { $cond: ['$_starts', 3, { $cond: ['$_word', 2, 1] }] } } },
      { $sort: { score: -1, nom: 1 } },
      { $limit: 10 },
      { $project: { _id: 1, id: 1, nom: 1, categorie: 1, sous_categorie: 1, image_url: 1, image_local: 1, url_fiche: 1 } }
    ]);
    res.json(rows);
  } catch (e) {
    const rows = await Item.find({ nom: { $regex: rxContains } }).sort({ nom: 1 }).limit(10).lean();
    res.json(rows);
  }
});

// =====================
// Routes Coffres (Chests)
// =====================

// Liste des coffres (résumé)
app.get('/chests', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const rows = await Chest.find({}).lean();
  const summary = rows.map((c) => ({
    _id: c._id,
    name: c.name,
    createdAt: c.createdAt,
    entries: c.items.length,
    totalQuantity: c.items.reduce((acc, e) => acc + (e.quantity || 0), 0),
  }));
  res.json(summary);
});

// Créer un coffre
app.post('/chests', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name requis' });
  const doc = await Chest.create({ name });
  res.status(201).json(doc);
});

// Détail d'un coffre
app.get('/chests/:id', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const c = await Chest.findById(req.params.id).lean();
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });
  res.json(c);
});

// Mise à jour/renommage
app.patch('/chests/:id', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const update = {};
  if (name) update.name = name;
  const doc = await Chest.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json(doc);
});

// Supprimer un coffre
app.delete('/chests/:id', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const r = await Chest.findByIdAndDelete(req.params.id);
  if (!r) return res.status(404).json({ error: 'Coffre introuvable' });
  res.json({ ok: true });
});

// Items d'un coffre, avec détail des items
app.get('/chests/:id/items', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const c = await Chest.findById(req.params.id).lean();
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });
  const idsNum = [...new Set(c.items.filter(e => typeof e.itemId === 'number').map((e) => e.itemId))];
  const idsObj = [...new Set(c.items.filter(e => e.itemMongoId).map((e) => e.itemMongoId))];
  const items = await Item.find({ $or: [ { id: { $in: idsNum } }, { _id: { $in: idsObj } } ] }).lean();
  const byNum = new Map(items.filter(it => typeof it.id === 'number').map((it) => [it.id, it]));
  const byObj = new Map(items.map((it) => [String(it._id), it]));
  const rows = c.items.map((e) => ({
    itemId: e.itemId,
    itemMongoId: e.itemMongoId,
    quantity: e.quantity,
    item: (typeof e.itemId === 'number' ? byNum.get(e.itemId) : byObj.get(String(e.itemMongoId))) || null,
  }));
  res.json({ chestId: c._id, name: c.name, items: rows });
});

// Dépôt/retrait d'un item dans un coffre
app.post('/chests/:id/move', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const chestId = req.params.id;
  const hasNum = req.body?.itemId !== undefined && req.body?.itemId !== null && req.body?.itemId !== '';
  let itemId = hasNum ? Number(req.body.itemId) : undefined;
  const itemMongoIdStr = req.body?.itemMongoId ? String(req.body.itemMongoId) : undefined;
  const itemName = req.body?.name ? String(req.body.name).trim() : undefined;
  let itemMongoId = undefined;
  if (itemMongoIdStr) {
    if (!mongoose.isValidObjectId(itemMongoIdStr)) {
      return res.status(400).json({ error: 'itemMongoId invalide' });
    }
    itemMongoId = new mongoose.Types.ObjectId(itemMongoIdStr);
  }
  const inc = Number(req.body?.inc || 0);
  if (!hasNum && !itemMongoId && !itemName) return res.status(400).json({ error: 'itemId, itemMongoId ou name requis' });
  if (hasNum && !Number.isFinite(itemId)) return res.status(400).json({ error: 'itemId invalide' });
  if (!Number.isFinite(inc) || inc === 0) return res.status(400).json({ error: 'inc requis (non nul)' });
  const c = await Chest.findById(chestId);
  if (!c) return res.status(404).json({ error: 'Coffre introuvable' });
  // Vérifie l'existence réelle de l'item (avec fallback par nom)
  let itemDoc = await Item.findOne(hasNum ? { id: itemId } : (itemMongoId ? { _id: itemMongoId } : { nom: { $regex: '^' + escapeRegex(itemName || '') + '$', $options: 'i' } })).lean();
  if (!itemDoc) return res.status(400).json({ error: 'Item introuvable' });
  // Normaliser les clés d'entrée
  if (!hasNum && typeof itemDoc.id === 'number') {
    // si l'item possède un id numérique utilisable, préférer itemId
    hasNum = true;
    itemId = itemDoc.id;
  }
  if (!itemMongoId) itemMongoId = itemDoc._id;
  const entry = c.items.find((e) => {
    if (hasNum && typeof itemId === 'number' && e.itemId === itemId) return true;
    if (e.itemMongoId && String(e.itemMongoId) === String(itemMongoId)) return true;
    return false;
  });
  if (!entry) {
    if (inc < 0) return res.status(400).json({ error: 'Quantité insuffisante' });
    c.items.push({ itemId: hasNum ? itemId : undefined, itemMongoId: itemMongoId, quantity: inc });
  } else {
    const next = (entry.quantity || 0) + inc;
    if (next < 0) return res.status(400).json({ error: 'Quantité insuffisante' });
    entry.quantity = next;
  }
  c.items = c.items.filter((e) => (e.quantity || 0) > 0);
  await c.save();
  res.json({ ok: true });
});

// Agrégat global de tous les coffres
app.get('/chests/aggregate', requireAuth, requireRole(process.env.DISCORD_REQUIRED_ROLE_ID), async (req, res) => {
  const chests = await Chest.find({}).lean();
  const map = new Map();
  for (const c of chests) {
    for (const e of (c.items || [])) {
      const key = typeof e.itemId === 'number' ? `num:${e.itemId}` : `obj:${String(e.itemMongoId)}`;
      const cur = map.get(key) || 0;
      map.set(key, cur + (e.quantity || 0));
    }
  }
  const idsNum = [];
  const idsObj = [];
  for (const k of map.keys()) {
    if (k.startsWith('num:')) idsNum.push(Number(k.slice(4)));
    else if (k.startsWith('obj:')) idsObj.push(new mongoose.Types.ObjectId(k.slice(4)));
  }
  const items = await Item.find({ $or: [ { id: { $in: idsNum } }, { _id: { $in: idsObj } } ] }).lean();
  const byNum = new Map(items.filter(it => typeof it.id === 'number').map((it) => [it.id, it]));
  const byObj = new Map(items.map((it) => [String(it._id), it]));
  const rows = [];
  for (const [k, q] of map.entries()) {
    if (k.startsWith('num:')) rows.push({ itemId: Number(k.slice(4)), quantity: q, item: byNum.get(Number(k.slice(4))) || null });
    else rows.push({ itemMongoId: k.slice(4), quantity: q, item: byObj.get(k.slice(4)) || null });
  }
  res.json({ totalItems: rows.length, items: rows });
});

function buildFilters(query) {
  const filter = {};
  const q = (query.q || '').toString().trim();
  const categorie = (query.categorie || '').toString().trim();
  const sous_categorie = (query.sous_categorie || '').toString().trim();
  const tier = (query.tier || '').toString().trim();

  if (q) filter.nom = { $regex: q, $options: 'i' };
  if (categorie) filter.categorie = { $regex: `^${escapeRegex(categorie)}$`, $options: 'i' };
  if (sous_categorie) filter.sous_categorie = { $regex: `^${escapeRegex(sous_categorie)}$`, $options: 'i' };
  if (tier) {
    const tierNum = Number(tier);
    if (!Number.isNaN(tierNum)) {
      filter.$or = [
        { tier: tierNum },
        { 'tier': { $type: 'number' }, tier: tierNum },
      ];
    } else {
      const rx = { $regex: `^${escapeRegex(tier)}$`, $options: 'i' };
      filter.$or = [
        { tier: rx },
        { 'tier.name': rx },
      ];
    }
  }
  return filter;
}

// Liste/pagination/recherche + filtres
app.get('/items', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const filter = buildFilters(req.query);
  // Tri: sort=champ:dir (ex: nom:asc, quantite:desc)
  let sort = { nom: 1 };
  const sortQ = (req.query.sort || '').toString().trim();
  if (sortQ) {
    const [field, dir] = sortQ.split(':');
    if (field) sort = { [field]: dir === 'desc' ? -1 : 1 };
  }
  const [total, rows] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({ total, page, limit, items: rows });
});

// Export CSV avec filtres
app.get('/items/export.csv', async (req, res) => {
  const filter = buildFilters(req.query);
  const rows = await Item.find(filter).sort({ nom: 1 });
  const headers = ['id', 'nom', 'categorie', 'sous_categorie', 'quantite'];
  const escapeCsv = (v) => {
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
app.patch('/items/:id/quantite', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { set, inc } = req.body || {};
  const update = {};
  if (typeof set === 'number') update.$set = { quantite: set };
  if (typeof inc === 'number') update.$inc = { quantite: inc };
  if (!update.$set && !update.$inc) return res.status(400).json({ error: 'set ou inc requis' });
  const doc = await Item.findOneAndUpdate({ id }, update, { new: true });
  if (!doc) return res.status(404).json({ error: 'Item non trouvé' });
  res.json(doc);
});

const port = parseInt(process.env.PORT || '4000', 10);
app.listen(port, () => console.log(`API démarrée sur http://localhost:${port}`));
