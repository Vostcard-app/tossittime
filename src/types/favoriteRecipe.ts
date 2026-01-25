/**
 * Favorite Recipe Types
 */

import type { ParsedIngredient } from './recipeImport';

export interface FavoriteRecipe {
  id: string;
  userId: string;
  dishName: string;
  recipeTitle?: string | null;
  recipeIngredients: string[];
  recipeSourceUrl?: string | null;
  recipeSourceDomain?: string | null;
  recipeImageUrl?: string | null;
  parsedIngredients?: ParsedIngredient[]; // AI-parsed structured ingredient data
  createdAt: Date;
}

export interface FavoriteRecipeData {
  dishName: string;
  recipeTitle?: string | null;
  recipeIngredients: string[];
  recipeSourceUrl?: string | null;
  recipeSourceDomain?: string | null;
  recipeImageUrl?: string | null;
  parsedIngredients?: ParsedIngredient[];
}
