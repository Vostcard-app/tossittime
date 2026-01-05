import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseConfig';
import type { FoodItem, FoodItemData } from '../types';
import { analyticsService } from './analyticsService';
import { handleSubscriptionError, cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * Food Items Service
 * Handles all CRUD operations for food items
 */
export const foodItemService = {
  /**
   * Get all food items for a user
   */
  async getFoodItems(userId: string): Promise<FoodItem[]> {
    const q = query(
      collection(db, 'foodItems'),
      where('userId', '==', userId),
      orderBy('expirationDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      expirationDate: doc.data().expirationDate.toDate(),
      addedDate: doc.data().addedDate.toDate()
    })) as FoodItem[];
  },

  /**
   * Subscribe to food items changes
   */
  subscribeToFoodItems(
    userId: string,
    callback: (items: FoodItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'foodItems'),
      where('userId', '==', userId)
      // Note: Can't orderBy expirationDate since frozen items don't have it
      // Will need to sort in memory instead
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            expirationDate: data.expirationDate ? data.expirationDate.toDate() : undefined,
            thawDate: data.thawDate ? data.thawDate.toDate() : undefined,
            addedDate: data.addedDate.toDate()
          } as FoodItem;
        });
        callback(items);
      },
      (error) => {
        handleSubscriptionError(
          error,
          'foodItems',
          userId,
          undefined,
          undefined
        );
        callback([]); // Return empty array so app doesn't break
      }
    );

    return unsubscribe;
  },

  /**
   * Add a new food item
   */
  async addFoodItem(userId: string, data: FoodItemData, status: 'fresh' | 'expiring_soon' | 'expired'): Promise<string> {
    // Check if this is the first item with expiration/thaw date (activation event)
    const hasDate = (data.isFrozen && data.thawDate) || (!data.isFrozen && data.expirationDate);
    let isActivation = false;
    let timeToActivation: number | null = null;
    
    if (hasDate) {
      // Check if user has any existing food items with dates
      const existingItemsQuery = query(
        collection(db, 'foodItems'),
        where('userId', '==', userId)
      );
      const existingSnapshot = await getDocs(existingItemsQuery);
      
      // Check if any existing items have expiration or thaw dates
      const hasExistingItemsWithDates = existingSnapshot.docs.some(doc => {
        const itemData = doc.data();
        return itemData.expirationDate || itemData.thawDate;
      });
      
      if (!hasExistingItemsWithDates) {
        // This is the first item with a date - activation event!
        isActivation = true;
        
        // Calculate time to activation
        const signupTime = await analyticsService.getUserSignupTime(userId);
        if (signupTime) {
          timeToActivation = Math.floor((Date.now() - signupTime.getTime()) / 1000); // seconds
        }
      }
    }
    
    // Remove undefined fields (Firestore doesn't allow undefined)
    const cleanData: Record<string, unknown> = {
      userId,
      name: data.name,
      addedDate: Timestamp.now(),
      status,
      reminderSent: false
    };
    
    // For frozen items: save thawDate, for non-frozen: save expirationDate
    if (data.isFrozen && data.thawDate) {
      cleanData.thawDate = Timestamp.fromDate(data.thawDate);
      // Don't include expirationDate for frozen items
    } else if (data.expirationDate) {
      cleanData.expirationDate = Timestamp.fromDate(data.expirationDate);
    }
    
    if (data.barcode) cleanData.barcode = data.barcode;
    if (data.photoUrl) cleanData.photoUrl = data.photoUrl;
    if (data.quantity) cleanData.quantity = data.quantity;
    if (data.category) cleanData.category = data.category;
    if (data.notes) cleanData.notes = data.notes;
    if (data.isFrozen !== undefined) cleanData.isFrozen = data.isFrozen;
    if (data.freezeCategory) cleanData.freezeCategory = data.freezeCategory;
    if (data.isDryCanned !== undefined) cleanData.isDryCanned = data.isDryCanned;
    
    const docRef = await addDoc(collection(db, 'foodItems'), cleanData);
    
    // Track activation event if this is the first item with a date
    if (isActivation) {
      await analyticsService.trackActivation(userId, {
        itemId: docRef.id,
        itemName: data.name,
        timeToActivation: timeToActivation ?? undefined
      });
    }
    
    return docRef.id;
  },

  /**
   * Update a food item
   */
  async updateFoodItem(itemId: string, updates: Partial<FoodItemData & { status?: 'fresh' | 'expiring_soon' | 'expired'; reminderSent?: boolean }>): Promise<void> {
    logServiceOperation('updateFoodItem', 'foodItems', { itemId });
    
    try {
      const docRef = doc(db, 'foodItems', itemId);
      
      // Filter out undefined values (Firestore doesn't allow undefined)
      const updateData = cleanFirestoreData(updates as Record<string, unknown>);
      
      // Convert Date objects to Firestore Timestamps
      if (updateData.expirationDate && updateData.expirationDate instanceof Date) {
        updateData.expirationDate = Timestamp.fromDate(updateData.expirationDate);
      }
      if (updateData.thawDate && updateData.thawDate instanceof Date) {
        updateData.thawDate = Timestamp.fromDate(updateData.thawDate);
      }
      
      await updateDoc(docRef, updateData);
    } catch (error) {
      logServiceError('updateFoodItem', 'foodItems', error, { itemId });
      throw toServiceError(error, 'foodItems');
    }
  },

  /**
   * Delete a food item
   */
  async deleteFoodItem(itemId: string): Promise<void> {
    logServiceOperation('deleteFoodItem', 'foodItems', { itemId });
    
    try {
      await deleteDoc(doc(db, 'foodItems', itemId));
    } catch (error) {
      logServiceError('deleteFoodItem', 'foodItems', error, { itemId });
      throw toServiceError(error, 'foodItems');
    }
  },

  /**
   * Upload photo for a food item
   */
  async uploadPhoto(userId: string, file: File): Promise<string> {
    logServiceOperation('uploadPhoto', 'foodItems', { userId, fileName: file.name });
    
    try {
      const storageRef = ref(storage, `foodItems/${userId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);
      return photoUrl;
    } catch (error) {
      logServiceError('uploadPhoto', 'foodItems', error, { userId, fileName: file.name });
      throw toServiceError(error, 'foodItems');
    }
  }
};

