/**
 * Multi-Source Shelf Life Service
 * Orchestrates multiple sources for determining best by dates:
 * 1. FoodKeeper (primary, local JSON data)
 * 2. EatByDate (web scraping via Netlify function)
 * 3. USDA/NCHFP (fallback for dry goods)
 */

import { getSuggestedExpirationDate, findFoodItem } from './foodkeeperService';
import { getEatByDateExpirationDate } from './eatbydateService';
import { getDryGoodsShelfLife } from './shelfLifeService';

export interface ShelfLifeResult {
  expirationDate: Date;
  source: 'foodkeeper' | 'eatbydate' | 'usda' | 'default';
  qualityMessage?: string;
  notes?: string;
}

/**
 * Get best by date from multiple sources
 * Tries sources in priority order: FoodKeeper -> EatByDate -> USDA/NCHFP
 */
export const getBestByDateFromMultipleSources = async (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Promise<ShelfLifeResult | null> => {
  // 1. Try FoodKeeper first (fastest, most reliable)
  const foodKeeperDate = getSuggestedExpirationDate(foodName, storageType);
  if (foodKeeperDate) {
    return {
      expirationDate: foodKeeperDate,
      source: 'foodkeeper'
    };
  }

  // 2. Try EatByDate (web scraping, may be slower)
  try {
    const eatByDateDate = await getEatByDateExpirationDate(foodName, storageType);
    if (eatByDateDate) {
      return {
        expirationDate: eatByDateDate,
        source: 'eatbydate'
      };
    }
  } catch (error) {
    // EatByDate failed, continue to next source
    console.warn('EatByDate lookup failed:', error);
  }

  // 3. For pantry/dry goods, try USDA/NCHFP shelf life service
  if (storageType === 'pantry') {
    const foodKeeperItem = findFoodItem(foodName);
    const shelfLifeResult = getDryGoodsShelfLife(foodName, foodKeeperItem || null);
    
    if (shelfLifeResult) {
      return {
        expirationDate: shelfLifeResult.expirationDate,
        source: shelfLifeResult.source === 'foodKeeper' ? 'foodkeeper' : 
                shelfLifeResult.source === 'dryGoodsTable' ? 'usda' : 'default',
        qualityMessage: shelfLifeResult.qualityMessage,
        notes: shelfLifeResult.notes
      };
    }
  }

  // No data found from any source
  return null;
};

/**
 * Get suggested expiration date (simplified interface)
 * This is the main function to use when calculating expiration dates
 */
export const getSuggestedExpirationDateMultiSource = async (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Promise<Date | null> => {
  const result = await getBestByDateFromMultipleSources(foodName, storageType);
  return result ? result.expirationDate : null;
};
