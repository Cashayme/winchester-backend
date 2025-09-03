import mongoose, { Document, Schema } from 'mongoose';

// Types d'actions pour les logs
export type ActivityAction =
  | 'CREATE_CHEST'
  | 'UPDATE_ITEM_QUANTITY'
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'DELETE_CHEST'
  | 'RENAME_CHEST'
  | 'LOGIN'
  | 'LOGOUT';

// Interface pour le document ActivityLog
export interface IActivityLog extends Document {
  userId: string;
  username: string;
  action: ActivityAction;
  chestId?: string;
  chestName?: string;
  itemId?: string;
  itemName?: string;
  oldQuantity?: number;
  newQuantity?: number;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Schéma des logs d'activité
const activityLogSchema = new Schema<IActivityLog>({
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  action: {
    type: String,
    required: true,
    enum: ['CREATE_CHEST', 'UPDATE_ITEM_QUANTITY', 'ADD_ITEM', 'REMOVE_ITEM', 'DELETE_CHEST', 'LOGIN', 'LOGOUT']
  },
  chestId: { type: String, index: true },
  chestName: { type: String },
  itemId: { type: String, index: true },
  itemName: { type: String },
  oldQuantity: { type: Number },
  newQuantity: { type: Number },
  details: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
}, {
  timestamps: true,
  collection: 'activity_logs'
});

// Index pour les requêtes fréquentes
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

// Méthodes statiques
activityLogSchema.statics.getRecentActivity = function(limit: number = 50) {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'username')
    .lean();
};

activityLogSchema.statics.getUserActivity = function(userId: string, limit: number = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

activityLogSchema.statics.getChestActivity = function(chestId: string, limit: number = 20) {
  return this.find({ chestId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
