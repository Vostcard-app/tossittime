import {
  Timestamp,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData
} from 'firebase/firestore';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { ShoppingListItem } from '../types';
import { handleSubscriptionError, transformSnapshot, cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';
import { buildQueryWithFilters } from './firestoreQueryBuilder';

/**
 * Shopping List Service
 * Handles operations for individual shopping list items
 */
export const shoppingListService = {
  /**
   * Get all shopping list items for a specific list
   */
  async getShoppingListItems(userId: string, listId: string): Promise<ShoppingListItem[]> {
    logServiceOperation('getShoppingListItems', 'shoppingList', { userId, listId });

    try {
      const q = buildQueryWithFilters('shoppingList', userId, [['listId', '==', listId]], 'createdAt', 'desc');
      const querySnapshot = await getDocs(q);
      return transformSnapshot<ShoppingListItem>(querySnapshot, ['createdAt']);
    } catch (error) {
      logServiceError('getShoppingListItems', 'shoppingList', error, { userId, listId });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Subscribe to shopping list changes
   */
  subscribeToShoppingList(
    userId: string,
    listId: string,
    callback: (items: ShoppingListItem[]) => void
  ): () => void {
    logServiceOperation('subscribeToShoppingList', 'shoppingList', { userId, listId });

    const q = buildQueryWithFilters('shoppingList', userId, [['listId', '==', listId]], 'createdAt', 'desc');

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = transformSnapshot<ShoppingListItem>(snapshot, ['createdAt']);
        callback(items);
      },
      (error) => {
        handleSubscriptionError(
          error,
          'shoppingList',
          userId,
          () => {
            // Fallback query without orderBy (synchronous return of promise)
            return getDocs(buildQueryWithFilters('shoppingList', userId, [['listId', '==', listId]]));
          },
          (snapshot) => {
            const items = transformSnapshot<ShoppingListItem>(snapshot, ['createdAt']);
            callback(items);
          }
        );
        callback([]); // Return empty array so app doesn't break
      }
    );

    return unsubscribe;
  },

  /**
   * Add item to shopping list
   */
  async addShoppingListItem(
    userId: string, 
    listId: string, 
    name: string, 
    crossedOff?: boolean,
    source?: string,
    mealId?: string,
    quantity?: number,
    quantityUnit?: string
  ): Promise<string> {
    logServiceOperation('addShoppingListItem', 'shoppingList', { userId, listId, name, source, mealId, quantity, quantityUnit });
    
    try {
      const cleanData = cleanFirestoreData({
        userId,
        listId,
        name,
        createdAt: Timestamp.now(),
        ...(crossedOff !== undefined && { crossedOff }),
        ...(source && { source }),
        ...(mealId && { mealId }),
        ...(quantity !== undefined && { quantity }),
        ...(quantityUnit && { quantityUnit })
      });
      
      const docRef = await addDoc(collection(db, 'shoppingList'), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('addShoppingListItem', 'shoppingList', error, { userId, listId, name });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Update crossedOff status of a shopping list item
   */
  async updateShoppingListItemCrossedOff(itemId: string, crossedOff: boolean): Promise<void> {
    logServiceOperation('updateShoppingListItemCrossedOff', 'shoppingList', { itemId, crossedOff });
    
    try {
      await updateDoc(doc(db, 'shoppingList', itemId), { crossedOff });
    } catch (error) {
      logServiceError('updateShoppingListItemCrossedOff', 'shoppingList', error, { itemId });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Update name of a shopping list item
   */
  async updateShoppingListItemName(itemId: string, name: string): Promise<void> {
    logServiceOperation('updateShoppingListItemName', 'shoppingList', { itemId, name });
    
    try {
      await updateDoc(doc(db, 'shoppingList', itemId), { name });
    } catch (error) {
      logServiceError('updateShoppingListItemName', 'shoppingList', error, { itemId });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Update shopping list item with partial data
   */
  async updateShoppingListItem(userId: string, itemId: string, updates: Partial<ShoppingListItem>): Promise<void> {
    logServiceOperation('updateShoppingListItem', 'shoppingList', { userId, itemId, updates });
    
    try {
      const cleanData = cleanFirestoreData(updates);
      await updateDoc(doc(db, 'shoppingList', itemId), cleanData);
    } catch (error) {
      logServiceError('updateShoppingListItem', 'shoppingList', error, { userId, itemId });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Delete item from shopping list
   */
  async deleteShoppingListItem(itemId: string): Promise<void> {
    logServiceOperation('deleteShoppingListItem', 'shoppingList', { itemId });
    
    try {
      await deleteDoc(doc(db, 'shoppingList', itemId));
    } catch (error) {
      logServiceError('deleteShoppingListItem', 'shoppingList', error, { itemId });
      throw toServiceError(error, 'shoppingList');
    }
  },

  /**
   * Delete all shopping list items for a given mealId
   */
  async deleteShoppingListItemsByMealId(userId: string, mealId: string): Promise<void> {
    logServiceOperation('deleteShoppingListItemsByMealId', 'shoppingList', { userId, mealId });
    
    try {
      // Don't use ordering for deletion - it requires a composite index
      // We just need to find all items with this mealId
      const q = buildQueryWithFilters('shoppingList', userId, [['mealId', '==', mealId]]);
      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.map(docSnapshot => 
        deleteDoc(doc(db, 'shoppingList', docSnapshot.id))
      );
      
      await Promise.all(deletePromises);
    } catch (error) {
      logServiceError('deleteShoppingListItemsByMealId', 'shoppingList', error, { userId, mealId });
      throw toServiceError(error, 'shoppingList');
    }
  }
};

