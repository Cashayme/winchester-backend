// Types pour la configuration Discord
interface DiscordConfig {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  REDIRECT_URI: string;
  GUILD_ID: string;
  BOT_TOKEN: string;
  REQUIRED_ROLE_ID: string;
  SCOPES: string;
}

// Configuration des sessions
interface SessionConfig {
  SECRET: string;
  COOKIE: {
    secure: boolean;
    maxAge: number;
    sameSite: 'lax' | 'strict' | 'none';
    httpOnly: boolean;
  };
}

// Fonction pour créer la configuration Discord (appelée après le chargement des variables d'environnement)
export function createDiscordConfig(): DiscordConfig {
  return {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || 'your_discord_client_id',
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || 'your_discord_client_secret',
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/auth/callback',
    GUILD_ID: process.env.DISCORD_GUILD_ID || '',
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
    REQUIRED_ROLE_ID: process.env.DISCORD_REQUIRED_ROLE_ID || '',
    SCOPES: 'identify guilds guilds.members.read'
  };
}

// Configuration des sessions (sessions persistantes)
export const SESSION_CONFIG: SessionConfig = {
  SECRET: process.env.SESSION_SECRET || 'your_session_secret',
  COOKIE: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    sameSite: 'lax',
    httpOnly: true
  }
};
