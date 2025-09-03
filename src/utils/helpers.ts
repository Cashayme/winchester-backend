import mongoose from 'mongoose';
import { ItemFilters } from '../types/index.js';

// Fonction utilitaire pour échapper les regex
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Valide et nettoie un ID MongoDB
 * @param id - L'ID à valider
 * @returns L'ID nettoyé ou null si invalide
 */
export function validateMongoId(id: string | undefined): string | null {
  if (!id || id === 'null' || id === 'undefined' || id.trim() === '') {
    return null;
  }

  const trimmedId = id.trim();

  // Vérifier si c'est un ObjectId valide
  if (!mongoose.Types.ObjectId.isValid(trimmedId)) {
    return null;
  }

  return trimmedId;
}

// Interface pour les filtres MongoDB
interface MongoFilter {
  [key: string]: any;
  $or?: any[];
}

// Fonction pour construire les filtres de recherche
export function buildFilters(query: ItemFilters): MongoFilter {
  const filter: MongoFilter = {};
  const q = (query.q || '').toString().trim();
  const categorie = (query.categorie || '').toString().trim();
  const sous_categorie = (query.sous_categorie || '').toString().trim();
  const tier = (query.tier || '').toString().trim();

  if (q) {
    filter.nom = { $regex: escapeRegex(q), $options: 'i' };
  }

  if (categorie) {
    filter.categorie = { $regex: `^${escapeRegex(categorie)}$`, $options: 'i' };
  }

  if (sous_categorie) {
    filter.sous_categorie = { $regex: `^${escapeRegex(sous_categorie)}$`, $options: 'i' };
  }

  if (tier) {
    const tierNum = Number(tier);
    if (!Number.isNaN(tierNum)) {
      filter.$or = [
        { tier: tierNum },
        { 'tier': { $type: 'number' } },
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

// Fonction pour valider un ID MongoDB
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// Fonction pour nettoyer une chaîne de recherche
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ') // Remplacer les espaces multiples par un seul
    .substring(0, 100); // Limiter la longueur
}

// Fonction pour créer un filtre de pagination
export function createPaginationFilter(page: number, limit: number): { skip: number; limit: number } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));

  return {
    skip: (safePage - 1) * safeLimit,
    limit: safeLimit
  };
}

// Fonction pour formater une réponse d'erreur
export function formatErrorResponse(message: string, code: number = 500): { error: string; code: number } {
  return {
    error: message,
    code
  };
}

// Fonction pour valider les paramètres de requête
export function validateQueryParams(params: Record<string, any>): {
  isValid: boolean;
  errors: string[];
  sanitized: Record<string, any>;
} {
  const errors: string[] = [];
  const sanitized: Record<string, any> = {};

  // Validation de la page
  if (params.page !== undefined) {
    const page = parseInt(params.page.toString(), 10);
    if (isNaN(page) || page < 1) {
      errors.push('page doit être un nombre positif');
    } else {
      sanitized.page = page;
    }
  }

  // Validation de la limite
  if (params.limit !== undefined) {
    const limit = parseInt(params.limit.toString(), 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errors.push('limit doit être un nombre entre 1 et 100');
    } else {
      sanitized.limit = limit;
    }
  }

  // Validation des chaînes de recherche
  ['q', 'categorie', 'sous_categorie', 'tier'].forEach(field => {
    if (params[field] !== undefined) {
      const value = params[field].toString().trim();
      if (value.length > 100) {
        errors.push(`${field} ne peut pas dépasser 100 caractères`);
      } else {
        sanitized[field] = value;
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}
