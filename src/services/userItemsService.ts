import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UserItem, UserItemData, ErrorWithCode } from '../types';
import { cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * User Items Service
 * Handles operations for user items (master list of items)
 */
export const userItemsService = {
  /**
   * Get all user items
   */
  async getUserItems(userId: string): Promise<UserItem[]> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      orderBy('lastUsed', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate() : undefined
    })) as UserItem[];
  },

  /**
   * Get user item by name
   */
  async getUserItemByName(userId: string, name: string): Promise<UserItem | null> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      where('name', '==', name)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate() : undefined
    } as UserItem;
  },

  /**
   * Create or update user item by name
   */
  async createOrUpdateUserItem(userId: string, data: UserItemData): Promise<string> {
    const existing = await this.getUserItemByName(userId, data.name);
    
    if (existing) {
      // Update existing item
      const docRef = doc(db, 'userItems', existing.id);
      await updateDoc(docRef, {
        expirationLength: data.expirationLength,
        category: data.category || null,
        lastUsed: Timestamp.now()
      });
      return existing.id;
    } else {
      // Create new item
      const cleanData: Record<string, unknown> = {
        userId,
        name: data.name,
        expirationLength: data.expirationLength,
        createdAt: Timestamp.now(),
        lastUsed: Timestamp.now()
      };
      
      if (data.category) {
        cleanData.category = data.category;
      }
      
      const docRef = await addDoc(collection(db, 'userItems'), cleanData);
      return docRef.id;
    }
  },

  /**
   * Update user item by ID
   */
  async updateUserItem(itemId: string, data: Partial<UserItemData>): Promise<void> {
    logServiceOperation('updateUserItem', 'userItems', { itemId });
    
    try {
      const docRef = doc(db, 'userItems', itemId);
      const updateData = cleanFirestoreData({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.expirationLength !== undefined && { expirationLength: data.expirationLength }),
        ...(data.category !== undefined && { category: data.category || null })
      });
      
      await updateDoc(docRef, updateData);
    } catch (error) {
      logServiceError('updateUserItem', 'userItems', error, { itemId });
      throw toServiceError(error, 'userItems');
    }
  },

  /**
   * Update all user items with the same name
   */
  async updateAllUserItemsByName(userId: string, name: string, data: Partial<UserItemData>): Promise<void> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      where('name', '==', name)
    );
    
    const querySnapshot = await getDocs(q);
    const updatePromises = querySnapshot.docs.map(doc => {
      const updateData = cleanFirestoreData({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.expirationLength !== undefined && { expirationLength: data.expirationLength }),
        ...(data.category !== undefined && { category: data.category || null })
      });
      return updateDoc(doc.ref, updateData);
    });
    
    await Promise.all(updatePromises);
  },

  /**
   * Subscribe to user items changes
   */
  subscribeToUserItems(
    userId: string,
    callback: (items: UserItem[]) => void
  ): () => void {
    console.log('🔍 userItemsService.subscribeToUserItems: Starting subscription for userId:', userId);
    
    // Try the query with orderBy first
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      orderBy('lastUsed', 'desc')
    );
    
    let unsubscribe: () => void;
    
    unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        console.log('📦 userItemsService: Snapshot received, docs:', snapshot.docs.length);
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          console.log('📦 userItemsService: Processing doc:', doc.id, {
            name: data.name,
            expirationLength: data.expirationLength,
            category: data.category,
            lastUsed: data.lastUsed ? data.lastUsed.toDate() : null
          });
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt.toDate(),
            lastUsed: data.lastUsed ? data.lastUsed.toDate() : undefined
          };
        }) as UserItem[];
        console.log('📦 userItemsService: Mapped items count:', items.length);
        callback(items);
      },
      (error: Error) => {
        console.error('❌ Error in user items subscription:', error);
        const errWithCode = error as ErrorWithCode;
        console.error('❌ Error code:', errWithCode.code);
        console.error('❌ Error message:', error.message);
        // Check if it's an index error
        if (errWithCode.code === 'failed-precondition' || error.message?.includes('index')) {
          console.warn('⚠️ Firestore index required for userItems query.');
          console.warn('📋 Create the index here: https://console.firebase.google.com/v1/r/project/tossittime/firestore/indexes');
          console.warn('💡 Falling back to query without orderBy...');
          // Try a simpler query without orderBy as fallback
          const fallbackQ = query(
            collection(db, 'userItems'),
            where('userId', '==', userId)
          );
          unsubscribe = onSnapshot(
            fallbackQ,
            (snapshot: QuerySnapshot) => {
              console.log('📦 userItemsService (fallback): Snapshot received, docs:', snapshot.docs.length);
              const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt.toDate(),
                  lastUsed: data.lastUsed ? data.lastUsed.toDate() : undefined
                };
              }) as UserItem[];
              // Sort by lastUsed descending manually
              items.sort((a, b) => {
                if (!a.lastUsed && !b.lastUsed) return 0;
                if (!a.lastUsed) return 1;
                if (!b.lastUsed) return -1;
                return b.lastUsed.getTime() - a.lastUsed.getTime();
              });
              callback(items);
            },
            (fallbackError: Error) => {
              console.error('❌ Error in fallback user items subscription:', fallbackError);
              callback([]);
            }
          );
        } else {
          callback([]);
        }
      }
    );
    
    return () => unsubscribe();
  }
};

