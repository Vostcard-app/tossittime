/**
 * Application Constants
 */

// Storage Keys
export const STORAGE_KEYS = {
  LAST_SHOPPING_LIST_ID: 'tossittime:lastShoppingListId',
} as const;

// Default Values
export const DEFAULTS = {
  REMINDER_DAYS: 7,
  SHOPPING_LIST_NAME: 'Shop list',
} as const;

// Theme Colors
export const COLORS = {
  PRIMARY: '#002B4D',
  SECONDARY: '#6b7280',
  SUCCESS: '#10b981',
  WARNING: '#eab308',
  ERROR: '#ef4444',
  BEST_BY_SOON: '#eab308', // Keep EXPIRING_SOON for backward compatibility
  EXPIRING_SOON: '#eab308', // Deprecated: use BEST_BY_SOON
  PAST_BEST_BY: '#ef4444', // Keep EXPIRED for backward compatibility
  EXPIRED: '#ef4444', // Deprecated: use PAST_BEST_BY
  FRESH: '#6b7280',
  THAW: '#F4A261',
  FREEZE: '#3b82f6',
} as const;

// Status Colors
export const STATUS_COLORS = {
  bestBySoon: '#eab308',
  pastBestBy: '#ef4444',
  fresh: '#6b7280',
  // Legacy aliases for backward compatibility
  expiring_soon: '#eab308', // Deprecated: use bestBySoon
  expired: '#ef4444', // Deprecated: use pastBestBy
} as const;

// Status Background Colors
export const STATUS_BG_COLORS = {
  bestBySoon: '#fef9c3',
  pastBestBy: '#fee2e2',
  fresh: '#f3f4f6',
  // Legacy aliases for backward compatibility
  expiring_soon: '#fef9c3', // Deprecated: use bestBySoon
  expired: '#fee2e2', // Deprecated: use pastBestBy
} as const;

