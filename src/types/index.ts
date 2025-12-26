export interface FoodItem {
  id: string;
  userId: string;
  name: string;
  barcode?: string;
  expirationDate?: Date; // Optional - frozen items use thawDate instead
  thawDate?: Date; // For frozen items
  addedDate: Date;
  photoUrl?: string;
  quantity?: number;
  category?: string;
  status: 'fresh' | 'expiring_soon' | 'expired';
  reminderSent?: boolean;
  notes?: string;
  isFrozen?: boolean;
  freezeCategory?: string;
}

export interface FoodItemData {
  name: string;
  barcode?: string;
  expirationDate?: Date; // Optional - frozen items use thawDate instead
  thawDate?: Date; // For frozen items
  photoUrl?: string;
  quantity?: number;
  category?: string;
  notes?: string;
  isFrozen?: boolean;
  freezeCategory?: string;
}

export interface ShoppingList {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  isDefault?: boolean;
}

export interface ShoppingListItem {
  id: string;
  userId: string;
  listId: string;
  name: string;
  createdAt: Date;
}

export interface UserSettings {
  userId: string;
  reminderDays: number; // Days before expiration to send reminder
  notificationsEnabled: boolean;
  defaultCategory?: string;
  lastUsedShoppingListId?: string;
}

export type FoodItemStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface FoodKeeperItem {
  name: string;
  category: string;
  refrigeratorDays?: number | null;
  freezerDays?: number | null;
  pantryDays?: number | null;
}

export interface UserItem {
  id: string;
  userId: string;
  name: string;
  expirationLength: number; // Number of days from addedDate to expiration
  category?: string;
  createdAt: Date;
  lastUsed?: Date; // Track when last added to a list
}

export interface UserItemData {
  name: string;
  expirationLength: number;
  category?: string;
}

