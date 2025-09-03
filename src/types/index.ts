// Types partagés pour l'application

// Types pour les sessions utilisateur
export interface UserSession {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  accessToken: string;
  roles?: UserRoles;
}

export interface UserRoles {
  list: string[];
  hasRequiredRole: boolean;
  lastChecked: number;
  username: string;
}

// Extension du module Express pour ajouter les propriétés personnalisées
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        roles: string[];
        lastRoleCheck: number;
      };
    }
  }
}

// Types pour les requêtes étendues
export interface AuthenticatedRequest extends Express.Request {
  session: Express.Request['session'] & {
    user?: UserSession;
  };
}

// Types pour les données Discord
export interface DiscordTokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  banner?: string;
  owner: boolean;
  permissions: string;
  permissions_new: string;
  features: string[];
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string;
  roles: string[];
  joined_at: string;
  deaf: boolean;
  mute: boolean;
}

// Types pour les items du jeu
export interface GameItem {
  id?: number;
  _id?: string;
  nom: string;
  categorie: string;
  sous_categorie?: string;
  tier?: string | number;
  unique?: boolean;
  description?: string;
  statistiques?: GameItemStat[];
  schema?: any[];
  sources?: any[];
  image?: string;
  image_url?: string;
  image_local?: string;
  tier_icon_url?: string;
  tier_icon_local?: string;
  url_fiche?: string;
  quantite?: number;
}

export interface GameItemStat {
  attribut: string;
  valeur: string | number;
  est_pourcentage: boolean;
  mieux_plus_haut: boolean;
}

// Types pour les coffres
export interface Chest {
  _id?: string;
  name: string;
  items: ChestEntry[];
  createdAt?: Date;
}

export interface ChestEntry {
  itemId?: number;
  itemMongoId?: string;
  quantity: number;
}

// Types pour les filtres de recherche
export interface ItemFilters {
  q?: string;
  categorie?: string;
  sous_categorie?: string;
  tier?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

// Types pour les réponses API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
