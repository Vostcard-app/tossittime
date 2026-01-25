/**
 * Recipe Import Types
 */

export interface RecipeSite {
  id: string;
  label: string;
  baseUrl: string;
  searchTemplateUrl: string; // Contains {query} placeholder
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedIngredient {
  name: string; // Clean ingredient name (descriptors removed)
  quantity: number | null;
  unit: string | null; // Standard unit abbreviation only: c, pt, qt, gal, oz, lb, g, kg, ml, l (or L). Null for non-standard measurements (e.g., "Sprig", "piece", "clove")
  formattedAmount?: string; // e.g., "3 Lbs"
}

export interface RecipeImportResult {
  title: string;
  ingredients: string[];
  parsedIngredients?: ParsedIngredient[]; // AI-parsed structured ingredient data
  imageUrl?: string;
  sourceUrl: string;
  sourceDomain: string;
}

export interface RecipeSiteData {
  label: string;
  baseUrl: string;
  searchTemplateUrl: string;
  enabled: boolean;
}

