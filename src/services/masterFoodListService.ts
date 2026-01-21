import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { FoodKeeperItem } from '../types';

const COLLECTION_NAME = 'masterFoodList';

export interface MasterFoodListItem extends FoodKeeperItem {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Normalize food item name for use as document ID
 * Converts to lowercase, trims, and replaces spaces with hyphens
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Get all master food list items from Firestore
 */
export async function getAllMasterFoodItems(): Promise<MasterFoodListItem[]> {
  try {
    const itemsRef = collection(db, COLLECTION_NAME);
    const q = query(itemsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as MasterFoodListItem[];
  } catch (error) {
    console.error('Error getting all master food items:', error);
    throw error;
  }
}

/**
 * Get a single master food list item by ID
 */
export async function getMasterFoodItem(id: string): Promise<MasterFoodListItem | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate(),
      updatedAt: docSnap.data().updatedAt?.toDate(),
    } as MasterFoodListItem;
  } catch (error) {
    console.error('Error getting master food item:', error);
    throw error;
  }
}

/**
 * Get a master food list item by name (case-insensitive)
 */
export async function getMasterFoodItemByName(name: string): Promise<MasterFoodListItem | null> {
  try {
    const normalizedName = name.trim().toLowerCase();
    const itemsRef = collection(db, COLLECTION_NAME);
    const q = query(
      itemsRef,
      where('nameLower', '==', normalizedName),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    } as MasterFoodListItem;
  } catch (error) {
    console.error('Error getting master food item by name:', error);
    throw error;
  }
}

/**
 * Create a new master food list item
 */
export async function createMasterFoodItem(
  item: FoodKeeperItem,
  adminEmail: string
): Promise<MasterFoodListItem> {
  try {
    // Validate required fields
    if (!item.name || !item.name.trim()) {
      throw new Error('Food item name is required');
    }
    if (!item.category || !item.category.trim()) {
      throw new Error('Food item category is required');
    }
    
    // Check if item with same name already exists
    const existing = await getMasterFoodItemByName(item.name);
    if (existing) {
      throw new Error(`Food item "${item.name}" already exists`);
    }
    
    // Use normalized name as document ID
    const normalizedId = normalizeName(item.name);
    const docRef = doc(db, COLLECTION_NAME, normalizedId);
    
    const itemData = {
      name: item.name.trim(),
      nameLower: item.name.trim().toLowerCase(), // For case-insensitive search
      category: item.category.trim(),
      refrigeratorDays: item.refrigeratorDays ?? null,
      freezerDays: item.freezerDays ?? null,
      pantryDays: item.pantryDays ?? null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: adminEmail,
    };
    
    await setDoc(docRef, itemData);
    
    return {
      id: normalizedId,
      ...itemData,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MasterFoodListItem;
  } catch (error) {
    console.error('Error creating master food item:', error);
    throw error;
  }
}

/**
 * Update an existing master food list item
 */
export async function updateMasterFoodItem(
  id: string,
  updates: Partial<FoodKeeperItem>,
  adminEmail: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    
    // Build update object
    const updateData: any = {
      updatedAt: Timestamp.now(),
      updatedBy: adminEmail,
    };
    
    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
      updateData.nameLower = updates.name.trim().toLowerCase();
    }
    if (updates.category !== undefined) {
      updateData.category = updates.category.trim();
    }
    if (updates.refrigeratorDays !== undefined) {
      updateData.refrigeratorDays = updates.refrigeratorDays ?? null;
    }
    if (updates.freezerDays !== undefined) {
      updateData.freezerDays = updates.freezerDays ?? null;
    }
    if (updates.pantryDays !== undefined) {
      updateData.pantryDays = updates.pantryDays ?? null;
    }
    
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating master food item:', error);
    throw error;
  }
}

/**
 * Delete a master food list item
 */
export async function deleteMasterFoodItem(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting master food item:', error);
    throw error;
  }
}

/**
 * Search master food list items by name
 */
export async function searchMasterFoodItems(
  queryText: string,
  limitCount: number = 50
): Promise<MasterFoodListItem[]> {
  try {
    if (!queryText || !queryText.trim()) {
      return getAllMasterFoodItems();
    }
    
    const normalizedQuery = queryText.trim().toLowerCase();
    const itemsRef = collection(db, COLLECTION_NAME);
    
    // Firestore doesn't support full-text search, so we'll get all items and filter client-side
    // For better performance with large datasets, consider using Algolia or similar
    const q = query(itemsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    
    const allItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as MasterFoodListItem[];
    
    // Filter by name (case-insensitive)
    const filtered = allItems
      .filter(item => item.name.toLowerCase().includes(normalizedQuery))
      .slice(0, limitCount);
    
    return filtered;
  } catch (error) {
    console.error('Error searching master food items:', error);
    throw error;
  }
}

/**
 * Get all unique categories from master food list
 */
export async function getMasterFoodListCategories(): Promise<string[]> {
  try {
    const items = await getAllMasterFoodItems();
    const categories = new Set<string>();
    
    items.forEach(item => {
      if (item.category) {
        categories.add(item.category);
      }
    });
    
    return Array.from(categories).sort();
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
}

/**
 * Import food items from JSON data to Firestore
 * This is a one-time migration function
 */
export async function importFromJSON(
  jsonItems: FoodKeeperItem[],
  adminEmail: string
): Promise<{ imported: number; skipped: number; errors: number }> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const item of jsonItems) {
    try {
      // Check if item already exists
      const existing = await getMasterFoodItemByName(item.name);
      if (existing) {
        skipped++;
        continue;
      }
      
      // Create item
      await createMasterFoodItem(item, adminEmail);
      imported++;
    } catch (error) {
      console.error(`Error importing item "${item.name}":`, error);
      errors++;
    }
  }
  
  return { imported, skipped, errors };
}
