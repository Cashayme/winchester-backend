import ActivityLog, { ActivityAction } from '../models/ActivityLog.js';

export interface LogData {
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
}

class ActivityLogger {
  async logActivity(logData: LogData): Promise<void> {
    try {
      const log = new ActivityLog(logData);
      await log.save();
      console.log(`📝 Activity logged: ${logData.action} by ${logData.username}`);
    } catch (error) {
      console.error('❌ Error logging activity:', error);
      // Ne pas throw pour ne pas casser le flux principal
    }
  }

  // Méthodes spécifiques pour chaque type d'action
  async logChestCreation(userId: string, username: string, chestName: string): Promise<void> {
    await this.logActivity({
      userId,
      username,
      action: 'CREATE_CHEST',
      chestName,
      details: `Création du coffre "${chestName}"`
    });
  }

  async logItemQuantityUpdate(
    userId: string,
    username: string,
    chestId: string,
    chestName: string,
    itemId: string,
    itemName: string,
    oldQuantity: number,
    newQuantity: number
  ): Promise<void> {
    const action = newQuantity > oldQuantity ? 'ADD_ITEM' : 'REMOVE_ITEM';
    const quantityChange = Math.abs(newQuantity - oldQuantity);

    await this.logActivity({
      userId,
      username,
      action,
      chestId,
      chestName,
      itemId,
      itemName,
      oldQuantity,
      newQuantity,
      details: `${newQuantity > oldQuantity ? 'Ajout' : 'Suppression'} de ${quantityChange} ${itemName} dans ${chestName}`
    });
  }

  async logChestDeletion(userId: string, username: string, chestId: string, chestName: string): Promise<void> {
    await this.logActivity({
      userId,
      username,
      action: 'DELETE_CHEST',
      chestId,
      chestName,
      details: `Suppression du coffre "${chestName}"`
    });
  }

  async logChestRename(userId: string, username: string, chestId: string, oldName: string, newName: string): Promise<void> {
    await this.logActivity({
      userId,
      username,
      action: 'RENAME_CHEST',
      chestId,
      chestName: newName,
      details: `Renommage du coffre "${oldName}" → "${newName}"`
    });
  }

  async logUserLogin(userId: string, username: string): Promise<void> {
    await this.logActivity({
      userId,
      username,
      action: 'LOGIN',
      details: `Connexion de ${username}`
    });
  }

  async logUserLogout(userId: string, username: string): Promise<void> {
    await this.logActivity({
      userId,
      username,
      action: 'LOGOUT',
      details: `Déconnexion de ${username}`
    });
  }
}

export default new ActivityLogger();
