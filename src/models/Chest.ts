import mongoose, { Document, Schema } from 'mongoose';
import type { Chest, ChestEntry } from '../types/index.js';

// Interface pour l'entrée d'un coffre
export interface IChestEntry {
  itemId?: number;
  itemMongoId?: mongoose.Types.ObjectId;
  quantity: number;
}

// Interface pour le document Chest
export interface IChest extends Document {
  name: string;
  items: IChestEntry[];
  createdAt: Date;
}

// Schéma des entrées de coffre
const chestEntrySchema = new Schema<IChestEntry>({
  itemId: { type: Number, required: false, index: true, sparse: true },
  itemMongoId: { type: Schema.Types.ObjectId, required: false, index: true, sparse: true },
  quantity: { type: Number, required: true, default: 0, min: 0 },
}, { _id: false });

// Schéma principal des coffres
const chestSchema = new Schema<IChest>({
  name: { type: String, required: true, trim: true },
  items: { type: [chestEntrySchema], default: [] },
  createdAt: { type: Date, default: () => new Date() },
});

// Index pour assurer l'unicité du nom
chestSchema.index({ name: 1 }, { unique: true });

// Méthodes statiques
chestSchema.statics.findByName = function(name: string) {
  return this.findOne({ name: new RegExp(`^${name}$`, 'i') });
};

chestSchema.statics.getTotalItems = async function(): Promise<number> {
  const result = await this.aggregate([
    { $unwind: '$items' },
    { $group: { _id: null, total: { $sum: '$items.quantity' } } }
  ]);
  return result[0]?.total || 0;
};

// Méthodes d'instance
chestSchema.methods.getItemCount = function(): number {
  return this.items.reduce((total: number, item: IChestEntry) => total + item.quantity, 0);
};

chestSchema.methods.hasItem = function(itemId: number | string): boolean {
  return this.items.some((item: IChestEntry) =>
    (typeof itemId === 'number' && item.itemId === itemId) ||
    (typeof itemId === 'string' && item.itemMongoId?.toString() === itemId)
  );
};

chestSchema.methods.addItem = function(itemId: number | string, quantity: number = 1): void {
  const existingItem = this.items.find((item: IChestEntry) =>
    (typeof itemId === 'number' && item.itemId === itemId) ||
    (typeof itemId === 'string' && item.itemMongoId?.toString() === itemId)
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    if (typeof itemId === 'number') {
      this.items.push({ itemId, quantity });
    } else {
      this.items.push({ itemMongoId: new mongoose.Types.ObjectId(itemId), quantity });
    }
  }

  // Supprimer les items avec quantité 0 ou négative
  this.items = this.items.filter((item: IChestEntry) => item.quantity > 0);
};

chestSchema.methods.removeItem = function(itemId: number | string, quantity: number = 1): boolean {
  const item = this.items.find((item: IChestEntry) =>
    (typeof itemId === 'number' && item.itemId === itemId) ||
    (typeof itemId === 'string' && item.itemMongoId?.toString() === itemId)
  );

  if (!item) return false;

  item.quantity -= quantity;

  if (item.quantity <= 0) {
    this.items = this.items.filter((i: IChestEntry) => i !== item);
  }

  return true;
};

// Export du modèle
const Chest = mongoose.model<IChest>('Chest', chestSchema);
export default Chest;
