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
import { db } from '../firebase/firebaseConfig';
import type { ShoppingListItem } from '../types';
import { handleSubscriptionError, transformSnapshot, cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * Shopping List Service
 * Handles operations for individual shopping list items
 */
export const shoppingListService = {
  /**
   * Get all shopping list items for a specific list
   */
  async getShoppingListItems(userId: string, listId: string): Promise<ShoppingListItem[]> {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      where('listId', '==', listId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as ShoppingListItem[];
  },

  /**
   * Subscribe to shopping list changes
   */
  subscribeToShoppingList(
    userId: string,
    listId: string,
    callback: (items: ShoppingListItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      where('listId', '==', listId),
      orderBy('createdAt', 'desc')
    );

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
          undefined,
          undefined
        );
        callback([]); // Return empty array so app doesn't break
      }
    );

    return unsubscribe;
  },

  /**
   * Add item to shopping list
   */
  async addShoppingListItem(userId: string, listId: string, name: string, crossedOff?: boolean): Promise<string> {
    logServiceOperation('addShoppingListItem', 'shoppingList', { userId, listId, name });
    
    try {
      const cleanData = cleanFirestoreData({
        userId,
        listId,
        name,
        createdAt: Timestamp.now(),
        ...(crossedOff !== undefined && { crossedOff })
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
  }
};

