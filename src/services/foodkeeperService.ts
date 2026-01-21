import { addDays } from 'date-fns';
import type { FoodKeeperItem } from '../types';
import foodkeeperData from '../data/foodkeeper.json';
import { getDryGoodsShelfLife } from './shelfLifeService';
import { getAllMasterFoodItems } from './masterFoodListService';

// Load FoodKeeper data from JSON (fallback)
const foodKeeperItemsJSON: FoodKeeperItem[] = foodkeeperData as FoodKeeperItem[];

// Cache for Firestore data
let foodKeeperItemsCache: FoodKeeperItem[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get food keeper items from Firestore with JSON fallback
 */
async function getFoodKeeperItems(): Promise<FoodKeeperItem[]> {
  // Check cache first
  const now = Date.now();
  if (foodKeeperItemsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return foodKeeperItemsCache;
  }
  
  try {
    // Try to get from Firestore
    const firestoreItems = await getAllMasterFoodItems();
    if (firestoreItems && firestoreItems.length > 0) {
      // Convert to FoodKeeperItem format (remove id, createdAt, updatedAt)
      const items: FoodKeeperItem[] = firestoreItems.map(item => ({
        name: item.name,
        category: item.category,
        refrigeratorDays: item.refrigeratorDays,
        freezerDays: item.freezerDays,
        pantryDays: item.pantryDays,
      }));
      
      // Update cache
      foodKeeperItemsCache = items;
      cacheTimestamp = now;
      return items;
    }
  } catch (error) {
    console.warn('Failed to load master food list from Firestore, using JSON fallback:', error);
  }
  
  // Fallback to JSON
  return foodKeeperItemsJSON;
}

/**
 * Get food keeper items synchronously (uses cache or JSON)
 * For backward compatibility with existing code
 */
function getFoodKeeperItemsSync(): FoodKeeperItem[] {
  // If cache exists, use it
  if (foodKeeperItemsCache) {
    return foodKeeperItemsCache;
  }
  
  // Otherwise use JSON
  return foodKeeperItemsJSON;
}

/**
 * Find a food item in the FoodKeeper dataset using exact match first, then fuzzy match
 * Uses Firestore data if available, falls back to JSON
 */
export const findFoodItem = (query: string): FoodKeeperItem | null => {
  if (!query || !query.trim()) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const foodKeeperItems = getFoodKeeperItemsSync();

  // First, try exact match (case-insensitive)
  const exactMatch = foodKeeperItems.find(
    item => item.name.toLowerCase() === normalizedQuery
  );

  if (exactMatch) {
    return exactMatch;
  }

  // If no exact match, try fuzzy matching (substring match)
  const fuzzyMatches = foodKeeperItems
    .filter(item => item.name.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      // Prefer shorter names (more specific matches)
      // Also prefer matches that start with the query
      const aStartsWith = a.name.toLowerCase().startsWith(normalizedQuery);
      const bStartsWith = b.name.toLowerCase().startsWith(normalizedQuery);
      
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      return a.name.length - b.name.length;
    });

  return fuzzyMatches.length > 0 ? fuzzyMatches[0] : null;
};

/**
 * Async version that loads from Firestore first
 */
export const findFoodItemAsync = async (query: string): Promise<FoodKeeperItem | null> => {
  if (!query || !query.trim()) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const foodKeeperItems = await getFoodKeeperItems();

  // First, try exact match (case-insensitive)
  const exactMatch = foodKeeperItems.find(
    item => item.name.toLowerCase() === normalizedQuery
  );

  if (exactMatch) {
    return exactMatch;
  }

  // If no exact match, try fuzzy matching (substring match)
  const fuzzyMatches = foodKeeperItems
    .filter(item => item.name.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      // Prefer shorter names (more specific matches)
      // Also prefer matches that start with the query
      const aStartsWith = a.name.toLowerCase().startsWith(normalizedQuery);
      const bStartsWith = b.name.toLowerCase().startsWith(normalizedQuery);
      
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      return a.name.length - b.name.length;
    });

  return fuzzyMatches.length > 0 ? fuzzyMatches[0] : null;
};

/**
 * Find multiple food items in the FoodKeeper dataset matching the query
 * Returns up to 10 matches sorted by relevance
 * Uses Firestore data if available, falls back to JSON
 */
export const findFoodItems = (query: string, limitCount: number = 10): FoodKeeperItem[] => {
  if (!query || !query.trim()) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const foodKeeperItems = getFoodKeeperItemsSync();

  // Get all matches
  const matches = foodKeeperItems
    .filter(item => item.name.toLowerCase().includes(normalizedQuery))
    .map(item => {
      const nameLower = item.name.toLowerCase();
      let score = 0;
      
      // Exact match gets highest score
      if (nameLower === normalizedQuery) {
        score = 1000;
      }
      // Starts with query gets high score
      else if (nameLower.startsWith(normalizedQuery)) {
        score = 500;
      }
      // Contains query gets lower score
      else {
        score = 100;
      }
      
      // Prefer shorter names (more specific)
      score -= item.name.length;
      
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limitCount)
    .map(result => result.item);

  return matches;
};

/**
 * Async version that loads from Firestore first
 */
export const findFoodItemsAsync = async (query: string, limitCount: number = 10): Promise<FoodKeeperItem[]> => {
  if (!query || !query.trim()) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const foodKeeperItems = await getFoodKeeperItems();

  // Get all matches
  const matches = foodKeeperItems
    .filter(item => item.name.toLowerCase().includes(normalizedQuery))
    .map(item => {
      const nameLower = item.name.toLowerCase();
      let score = 0;
      
      // Exact match gets highest score
      if (nameLower === normalizedQuery) {
        score = 1000;
      }
      // Starts with query gets high score
      else if (nameLower.startsWith(normalizedQuery)) {
        score = 500;
      }
      // Contains query gets lower score
      else {
        score = 100;
      }
      
      // Prefer shorter names (more specific)
      score -= item.name.length;
      
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limitCount)
    .map(result => result.item);

  return matches;
};

/**
 * Get suggested expiration date based on FoodKeeper data
 * For pantry/dry goods, falls back to USDA/NCHFP-based shelf life service
 * Defaults to refrigerator storage time
 * Uses Firestore data if available, falls back to JSON
 */
export const getSuggestedExpirationDate = (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Date | null => {
  const item = findFoodItem(foodName);
  
  let storageDays: number | null | undefined;

  if (item) {
    switch (storageType) {
      case 'refrigerator':
        storageDays = item.refrigeratorDays;
        break;
      case 'freezer':
        storageDays = item.freezerDays;
        break;
      case 'pantry':
        storageDays = item.pantryDays;
        break;
    }
  }

  // For pantry/dry goods: if FoodKeeper has no data, use USDA/NCHFP-based shelf life service
  if (storageType === 'pantry' && (!storageDays || storageDays <= 0)) {
    const shelfLifeResult = getDryGoodsShelfLife(foodName, item || null);
    if (shelfLifeResult) {
      return shelfLifeResult.expirationDate;
    }
  }

  // If no storage time available, invalid, or zero/negative, return null
  if (!storageDays || storageDays <= 0) {
    return null;
  }

  // Calculate expiration date: today + storage days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return addDays(today, storageDays);
};

/**
 * Async version that loads from Firestore first
 */
export const getSuggestedExpirationDateAsync = async (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Promise<Date | null> => {
  const item = await findFoodItemAsync(foodName);
  
  let storageDays: number | null | undefined;

  if (item) {
    switch (storageType) {
      case 'refrigerator':
        storageDays = item.refrigeratorDays;
        break;
      case 'freezer':
        storageDays = item.freezerDays;
        break;
      case 'pantry':
        storageDays = item.pantryDays;
        break;
    }
  }

  // For pantry/dry goods: if FoodKeeper has no data, use USDA/NCHFP-based shelf life service
  if (storageType === 'pantry' && (!storageDays || storageDays <= 0)) {
    const shelfLifeResult = getDryGoodsShelfLife(foodName, item || null);
    if (shelfLifeResult) {
      return shelfLifeResult.expirationDate;
    }
  }

  // If no storage time available, invalid, or zero/negative, return null
  if (!storageDays || storageDays <= 0) {
    return null;
  }

  // Calculate expiration date: today + storage days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return addDays(today, storageDays);
};

/**
 * Load FoodKeeper data (for future use if we need to reload or update)
 * Returns cached Firestore data or JSON fallback
 */
export const loadFoodKeeperData = (): FoodKeeperItem[] => {
  return getFoodKeeperItemsSync();
};

/**
 * Load FoodKeeper data from Firestore (async)
 * Refreshes cache
 */
export const loadFoodKeeperDataAsync = async (): Promise<FoodKeeperItem[]> => {
  return await getFoodKeeperItems();
};

/**
 * Clear the food keeper items cache
 * Useful after admin updates the master food list
 */
export const clearFoodKeeperCache = (): void => {
  foodKeeperItemsCache = null;
  cacheTimestamp = 0;
};

