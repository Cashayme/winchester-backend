import mongoose, { Document, Schema } from 'mongoose';
import type { GameItem, GameItemStat } from '../types/index.js';

// Interface pour le document Item
export interface IItem extends Document {
  id?: number;
  nom: string;
  categorie: string;
  sous_categorie?: string;
  tier?: string | number;
  unique?: boolean;
  description?: string;
  statistiques?: IItemStat[];
  sources?: any[];
  image?: string;
  image_url?: string;
  image_local?: string;
  tier_icon_url?: string;
  tier_icon_local?: string;
  url_fiche?: string;
  quantite?: number;
}

// Interface pour les statistiques des items
interface IItemStat {
  attribut: string;
  valeur: string | number;
  est_pourcentage: boolean;
  mieux_plus_haut: boolean;
}

// Schéma des statistiques des items
const itemStatSchema = new Schema<IItemStat>({
  attribut: { type: String, required: true },
  valeur: { type: Schema.Types.Mixed, required: true },
  est_pourcentage: { type: Boolean, required: true },
  mieux_plus_haut: { type: Boolean, required: true },
}, { _id: false });

// Schéma principal des items
const itemSchema = new Schema<IItem>({
  id: { type: Number, index: true },
  nom: { type: String, index: true },
  categorie: { type: String },
  sous_categorie: { type: String },
  tier: { type: Schema.Types.Mixed },
  unique: { type: Boolean },
  description: { type: String },
  statistiques: [itemStatSchema],
  sources: [{ type: Schema.Types.Mixed }],
  image: { type: String },
  image_url: { type: String },
  image_local: { type: String },
  tier_icon_url: { type: String },
  tier_icon_local: { type: String },
  url_fiche: { type: String },
  // Gestion quantités
  quantite: { type: Number, default: 0 },
});

// Assure un index unique sparse sur id
itemSchema.index({ id: 1 }, { unique: true, sparse: true });

// Méthodes statiques
itemSchema.statics.findByIdOrName = function(idOrName: string | number) {
  if (typeof idOrName === 'number') {
    return this.findOne({ id: idOrName });
  }
  return this.findOne({ nom: new RegExp(`^${idOrName}$`, 'i') });
};

// Méthodes d'instance
itemSchema.methods.getDisplayName = function(): string {
  return `${this.nom}${this.tier ? ` (Tier ${this.tier})` : ''}`;
};

itemSchema.methods.hasStock = function(): boolean {
  return (this.quantite || 0) > 0;
};

// Export du modèle
const Item = mongoose.model<IItem>('Item', itemSchema);
export default Item;
