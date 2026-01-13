/**
 * EatByDate Service
 * Queries EatByDate.com for shelf life information via Netlify function
 */

export interface EatByDateResult {
  foodName: string;
  storageType: 'refrigerator' | 'freezer' | 'pantry';
  days: number;
  source: 'eatbydate';
}

/**
 * Get shelf life information from EatByDate.com
 * Uses Netlify function to scrape the website
 */
export const getEatByDateShelfLife = async (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Promise<EatByDateResult | null> => {
  try {
    // Call Netlify function to scrape EatByDate
    const functionUrl = '/.netlify/functions/eatbydate-scraper';
    const params = new URLSearchParams({
      foodName,
      storageType
    });

    const response = await fetch(`${functionUrl}?${params.toString()}`);

    if (!response.ok) {
      // 404 means item not found, which is fine - just return null
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch EatByDate data: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (data && data.days && data.days > 0) {
      return data as EatByDateResult;
    }

    return null;
  } catch (error) {
    console.error('Error fetching EatByDate shelf life:', error);
    // Don't throw - just return null so other sources can be tried
    return null;
  }
};

/**
 * Get suggested expiration date from EatByDate
 */
export const getEatByDateExpirationDate = async (
  foodName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry' = 'refrigerator'
): Promise<Date | null> => {
  const result = await getEatByDateShelfLife(foodName, storageType);
  
  if (!result || !result.days) {
    return null;
  }

  // Calculate expiration date: today + shelf life days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expirationDate = new Date(today);
  expirationDate.setDate(expirationDate.getDate() + result.days);
  
  return expirationDate;
};
