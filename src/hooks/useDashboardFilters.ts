/**
 * useDashboardFilters Hook
 * Handles filter state and filtered items logic for dashboard
 */

import { useState, useMemo } from 'react';
import { isDryCannedItem } from '../utils/storageUtils';
import type { FoodItem } from '../types';

type FilterType = 'all' | 'bestBySoon' | 'pastBestBy';

export function useDashboardFilters(foodItems: FoodItem[]) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Filter items by storage type (perishable vs dry/canned)
  const itemsByStorageType = useMemo(() => {
    const perishableItems: FoodItem[] = [];
    const dryCannedItems: FoodItem[] = [];
    
    foodItems.forEach(item => {
      if (isDryCannedItem(item)) {
        dryCannedItems.push(item);
      } else {
        perishableItems.push(item);
      }
    });
    
    return { perishableItems, dryCannedItems };
  }, [foodItems]);

  // Combine storage tab filter with status filter
  const getFilteredItems = (storageTab: 'perishable' | 'dryCanned') => {
    // First filter by storage type
    const storageFiltered = storageTab === 'perishable' 
      ? itemsByStorageType.perishableItems 
      : itemsByStorageType.dryCannedItems;
    
    // Then filter by status
    if (filter === 'all') return storageFiltered;
    return storageFiltered.filter(item => item.status === filter);
  };

  return {
    filter,
    setFilter,
    itemsByStorageType,
    getFilteredItems
  };
}

