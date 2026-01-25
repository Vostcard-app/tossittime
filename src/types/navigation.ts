/**
 * Navigation State Types
 */

// Location state types for navigation
export interface AddItemLocationState {
  fromShoppingList?: boolean;
  shoppingListItemId?: string;
  itemName?: string;
  editingItem?: import('./foodItem').FoodItem;
  forceFreeze?: boolean;
  storageType?: 'pantry' | 'refrigerator'; // Storage type from Dashboard tab
  scannedLabelData?: {
    itemName: string;
    quantity?: number;
    expirationDate?: Date;
    category?: string;
  };
}

export interface CalendarLocationState {
  defaultView?: 'month' | 'week' | 'day';
}

export interface PlannedMealCalendarLocationState {
  favoriteRecipe?: import('./favoriteRecipe').FavoriteRecipe;
  selectedDate?: Date;
  selectedMealType?: import('./mealPlan').MealType;
}

