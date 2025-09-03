import { createDiscordConfig } from '../config/discord.js';
import { DiscordTokenData, DiscordUser, DiscordGuild, DiscordMember } from '../types/index.js';

export class DiscordService {
  // Échanger le code contre un token
  static async exchangeCodeForToken(code: string): Promise<DiscordTokenData> {
    const config = createDiscordConfig();
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.REDIRECT_URI,
      }),
    });

    const tokenData = await response.json() as DiscordTokenData & { error?: string; error_description?: string };

    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Erreur d\'authentification Discord');
    }

    return tokenData;
  }

  // Récupérer les informations utilisateur
  static async getUserInfo(accessToken: string): Promise<DiscordUser> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return await response.json();
  }

  // Récupérer les serveurs de l'utilisateur
  static async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Impossible de récupérer les serveurs');
    }

    return await response.json();
  }

  // Récupérer les détails d'un membre sur un serveur
  static async getGuildMember(guildId: string, userId: string): Promise<DiscordMember | null> {
    const config = createDiscordConfig();
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: {
        Authorization: `Bot ${config.BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  }
}
