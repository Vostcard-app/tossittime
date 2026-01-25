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
import type { ShoppingList } from '../types';
import { handleSubscriptionError, transformSnapshot, cleanFirestoreData, logServiceOperation, logServiceError, getSubscriptionErrorMessage } from './baseService';
import { showToast } from '../components/Toast';
import { toServiceError } from './errors';

/**
 * Shopping Lists Service
 * Handles operations for shopping list collections
 */
export const shoppingListsService = {
  /**
   * Get all shopping lists for a user
   */
  async getShoppingLists(userId: string): Promise<ShoppingList[]> {
    const q = query(
      collection(db, 'shoppingLists'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as ShoppingList[];
  },

  /**
   * Subscribe to shopping lists changes
   */
  subscribeToShoppingLists(
    userId: string,
    callback: (lists: ShoppingList[]) => void
  ): () => void {
    const q = query(
      collection(db, 'shoppingLists'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const lists = transformSnapshot<ShoppingList>(snapshot, ['createdAt']);
        callback(lists);
      },
      (error) => {
        handleSubscriptionError(
          error,
          'shoppingLists',
          userId,
          undefined,
          undefined
        );
        
        // Show user-visible error message
        const errorMessage = getSubscriptionErrorMessage(error, 'shopping lists');
        if (errorMessage) {
          showToast(errorMessage, 'error', 5000);
        }
        
        callback([]);
      }
    );
    return unsubscribe;
  },

  /**
   * Create a new shopping list
   */
  async createShoppingList(userId: string, name: string, isDefault: boolean = false): Promise<string> {
    logServiceOperation('createShoppingList', 'shoppingLists', { userId, name, isDefault });
    
    try {
      const cleanData = cleanFirestoreData({
        userId,
        name,
        createdAt: Timestamp.now(),
        isDefault
      });
      const docRef = await addDoc(collection(db, 'shoppingLists'), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('createShoppingList', 'shoppingLists', error, { userId, name });
      throw toServiceError(error, 'shoppingLists');
    }
  },

  /**
   * Update shopping list
   */
  async updateShoppingList(listId: string, data: Partial<ShoppingList>): Promise<void> {
    logServiceOperation('updateShoppingList', 'shoppingLists', { listId });
    
    try {
      const docRef = doc(db, 'shoppingLists', listId);
      const updateData = cleanFirestoreData({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault })
      });
      await updateDoc(docRef, updateData);
    } catch (error) {
      logServiceError('updateShoppingList', 'shoppingLists', error, { listId });
      throw toServiceError(error, 'shoppingLists');
    }
  },

  /**
   * Delete shopping list
   */
  async deleteShoppingList(listId: string): Promise<void> {
    logServiceOperation('deleteShoppingList', 'shoppingLists', { listId });
    
    try {
      await deleteDoc(doc(db, 'shoppingLists', listId));
    } catch (error) {
      logServiceError('deleteShoppingList', 'shoppingLists', error, { listId });
      throw toServiceError(error, 'shoppingLists');
    }
  },

  /**
   * Get or create default "shop list"
   */
  async getDefaultShoppingList(userId: string): Promise<string> {
    try {
      // Try to find existing default list
      const q = query(
        collection(db, 'shoppingLists'),
        where('userId', '==', userId),
        where('isDefault', '==', true)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].id;
      }

      // Try to find list named "Shop list"
      const nameQuery = query(
        collection(db, 'shoppingLists'),
        where('userId', '==', userId),
        where('name', '==', 'Shop list')
      );
      const nameSnapshot = await getDocs(nameQuery);
      
      if (!nameSnapshot.empty) {
        // Mark it as default
        const listId = nameSnapshot.docs[0].id;
        await this.updateShoppingList(listId, { isDefault: true });
        return listId;
      }

      // Create default "Shop list"
      return await this.createShoppingList(userId, 'Shop list', true);
    } catch (error) {
      logServiceError('getDefaultShoppingList', 'shoppingLists', error, { userId });
      throw error;
    }
  }
};

