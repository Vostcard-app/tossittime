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
}

export interface CalendarLocationState {
  defaultView?: 'month' | 'week' | 'day';
}

