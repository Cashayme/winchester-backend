import mongoose from 'mongoose';

// Interface pour les options de connexion MongoDB
interface DatabaseConfig {
  mongoUri: string;
  dbName: string;
}

// Fonction pour établir la connexion à MongoDB
export async function connectDatabase(): Promise<void> {
  const mongoUri: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/dune';
  const dbName: string = process.env.MONGO_DB || 'dune';

  try {
    // Configuration des options de connexion
    const connectionOptions: any = {
      dbName,
      ssl: true,
      authSource: 'admin',
    };

    await mongoose.connect(mongoUri, connectionOptions);

    console.log('✅ Connexion MongoDB établie');
    console.log(`📊 Base de données: ${dbName}`);
    console.log(`🔗 URI: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`); // Masque les credentials

    // Événements de connexion
    mongoose.connection.on('error', (error) => {
      console.error('❌ Erreur de connexion MongoDB:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📡 Déconnexion de MongoDB');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 Reconnexion à MongoDB réussie');
    });

  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    console.error('💡 Vérifiez que MongoDB est démarré et accessible');
    console.error(`🔗 URI tentée: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
    process.exit(1);
  }
}

// Fonction pour fermer proprement la connexion
export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.connection.close();
    console.log('👋 Connexion MongoDB fermée');
  } catch (error) {
    console.error('❌ Erreur lors de la fermeture de MongoDB:', error);
  }
}

// Fonction pour vérifier l'état de la connexion
export function getDatabaseStatus(): {
  connected: boolean;
  readyState: number;
  name: string;
  host: string;
  port: number;
} {
  const conn = mongoose.connection;
  return {
    connected: conn.readyState === 1,
    readyState: conn.readyState,
    name: conn.name,
    host: conn.host,
    port: conn.port,
  };
}

// Export de mongoose pour une utilisation directe si nécessaire
export default mongoose;
