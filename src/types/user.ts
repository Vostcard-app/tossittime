/**
 * User Types
 */

export interface UserSettings {
  userId: string;
  email?: string; // User's email address
  username?: string; // Username extracted from email (part before @)
  reminderDays: number; // Days before expiration to send reminder
  notificationsEnabled: boolean;
  defaultCategory?: string;
  lastUsedShoppingListId?: string;
  isPremium?: boolean; // Premium subscription status
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'; // Default: 'MM/DD/YYYY'
  weightUnit?: 'pounds' | 'kilograms'; // Default: 'pounds'
  hasSeenScanWarning?: boolean; // Track if user has seen first scan warning
}

export interface UserItem {
  id: string;
  userId: string;
  name: string;
  expirationLength: number; // Number of days from addedDate to expiration
  category?: string;
  createdAt: Date;
  lastUsed?: Date; // Track when last added to a list
  isDryCanned?: boolean; // Explicitly mark as dry/canned goods
}

export interface UserItemData {
  name: string;
  expirationLength: number;
  category?: string;
  isDryCanned?: boolean; // Explicitly mark as dry/canned goods
}

export interface UserCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface UserCategoryData {
  name: string;
}

// User info type for admin service
export interface UserInfo {
  uid: string;
  email?: string;
  username?: string;
}

