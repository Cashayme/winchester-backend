import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dune';
  const dbName = process.env.MONGO_DB || 'dune';
  // Par défaut, on cherche le JSON à la racine du repo (un niveau au-dessus du dossier backend)
  const defaultJson = path.resolve(process.cwd(), '../dune_awakening_items_fr.json');
  const providedPath = process.env.DATA_PATH;
  const jsonPath = providedPath ? path.resolve(providedPath) : defaultJson;

  if (!fs.existsSync(jsonPath)) {
    console.error(`[import] Fichier introuvable: ${jsonPath}`);
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { dbName });

  const itemSchema = new mongoose.Schema({
    id: { type: Number, index: true, unique: true, sparse: true },
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
    quantite: { type: Number, default: 0 },
  });

  const Item = mongoose.model('Item', itemSchema);

  // DROP forcé pour repartir proprement
  try {
    await Item.collection.drop();
    console.log('[import] collection items dropped');
  } catch (e) {
    if (!(e && e.codeName === 'NamespaceNotFound')) {
      console.warn('[import] drop skipped:', e?.codeName || e?.message || e);
    }
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const items = Array.isArray(raw?.items) ? raw.items : [];
  let inserted = 0;
  for (const it of items) {
    const doc = { ...it };
    if (typeof doc.quantite !== 'number') doc.quantite = 0;
    // Éviter id null/undefined dans l'upsert: fallback sur nom
    const hasValidId = typeof doc.id === 'number' && !Number.isNaN(doc.id);
    const query = hasValidId ? { id: doc.id } : { nom: doc.nom };
    // Ne jamais écrire id:null
    if (!hasValidId) delete doc.id;
    await Item.updateOne(query, { $set: doc }, { upsert: true });
    inserted += 1;
  }

  const count = await Item.countDocuments({});
  console.log(`[import] upserts=${inserted}, total=${count}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
