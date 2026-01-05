/**
 * Food Item Types
 */

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
  isDryCanned?: boolean; // Explicitly mark as dry/canned goods
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
  isDryCanned?: boolean; // Explicitly mark as dry/canned goods
}

export type FoodItemStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface FoodKeeperItem {
  name: string;
  category: string;
  refrigeratorDays?: number | null;
  freezerDays?: number | null;
  pantryDays?: number | null;
}

