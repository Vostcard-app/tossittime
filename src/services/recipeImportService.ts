/**
 * Recipe Import Service
 * Handles recipe import from URLs and recipe site management
 */

import type { RecipeSite, RecipeImportResult } from '../types/recipeImport';
import type { FoodItem } from '../types';
import { recipeSiteService } from './recipeSiteService';
import { logServiceOperation, logServiceError } from './baseService';

/**
 * Recipe Import Service
 */
export const recipeImportService = {
  /**
   * Import recipe from URL
   */
  async importRecipe(url: string): Promise<RecipeImportResult> {
    logServiceOperation('importRecipe', 'recipeImport', { url });

    try {
      const response = await fetch('/.netlify/functions/recipe-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to import recipe: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logServiceError('importRecipe', 'recipeImport', error, { url });
      throw error;
    }
  },

  /**
   * Get all recipe sites
   */
  async getRecipeSites(): Promise<RecipeSite[]> {
    return recipeSiteService.getRecipeSites();
  },

  /**
   * Get enabled recipe sites only
   */
  async getEnabledRecipeSites(): Promise<RecipeSite[]> {
    return recipeSiteService.getEnabledRecipeSites();
  },

  /**
   * Build search URL for a recipe site
   */
  buildSearchUrl(site: RecipeSite, query: string): string {
    // If no search template URL or no {query} placeholder, just return base URL
    if (!site.searchTemplateUrl || !site.searchTemplateUrl.includes('{query}')) {
      return site.baseUrl;
    }
    
    const encodedQuery = encodeURIComponent(query);
    return site.searchTemplateUrl.replace('{query}', encodedQuery);
  },

  /**
   * Generate suggested query from expiring items
   * Returns top 1-2 expiring items as a search query
   */
  generateSuggestedQuery(expiringItems: FoodItem[]): string {
    if (expiringItems.length === 0) {
      return '';
    }

    // Get top 1-2 items (sorted by expiration date, closest first)
    const sorted = [...expiringItems]
      .filter(item => item.expirationDate || item.thawDate)
      .sort((a, b) => {
        const dateA = a.expirationDate || a.thawDate || new Date(0);
        const dateB = b.expirationDate || b.thawDate || new Date(0);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 2)
      .map(item => item.name);

    return sorted.join(' ');
  },

  /**
   * Check if ingredient is available in pantry
   * Simple case-insensitive substring matching
   */
  checkIngredientAvailability(
    ingredient: string,
    pantryItems: FoodItem[]
  ): 'have' | 'missing' {
    const normalizedIngredient = ingredient.toLowerCase().trim();
    
    // Remove common measurement words for better matching
    const measurementWords = ['cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'piece', 'pieces', 'clove', 'cloves'];
    const cleanedIngredient = measurementWords.reduce((text, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      return text.replace(regex, '').trim();
    }, normalizedIngredient);

    const hasIngredient = pantryItems.some(item => {
      const normalizedItemName = item.name.toLowerCase();
      return (
        cleanedIngredient.includes(normalizedItemName) ||
        normalizedItemName.includes(cleanedIngredient) ||
        normalizedIngredient.includes(normalizedItemName) ||
        normalizedItemName.includes(normalizedIngredient)
      );
    });

    return hasIngredient ? 'have' : 'missing';
  }
};

