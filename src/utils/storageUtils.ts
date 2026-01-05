/**
 * Storage Type Utilities
 * Helper functions for determining if items are dry/canned or perishable
 */

import { findFoodItem } from '../services/foodkeeperService';
import type { FoodItem } from '../types';

/**
 * Determine if an item is dry/canned based on FoodKeeper data or explicit flag
 */
export function isDryCannedItem(item: FoodItem): boolean {
  // First check explicit flag
  if (item.isDryCanned !== undefined) {
    return item.isDryCanned;
  }
  
  // Fall back to FoodKeeper data lookup
  const foodKeeperItem = findFoodItem(item.name);
  if (!foodKeeperItem) {
    // Default to perishable if not found in FoodKeeper data
    return false;
  }
  
  // If item has pantryDays (even if also has refrigeratorDays), it's dry/canned
  return foodKeeperItem.pantryDays !== null && foodKeeperItem.pantryDays !== undefined;
}

