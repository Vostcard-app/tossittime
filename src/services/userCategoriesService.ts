import {
  collection,
  doc,
  getDoc,
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
import { db } from '../firebase/firebaseConfig';
import type { UserCategory, UserCategoryData, ErrorWithCode } from '../types';
import { cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * User Categories Service
 * Handles operations for user categories
 */
export const userCategoriesService = {
  /**
   * Get all user categories
   */
  async getUserCategories(userId: string): Promise<UserCategory[]> {
    const q = query(
      collection(db, 'userCategories'),
      where('userId', '==', userId),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as UserCategory[];
  },

  /**
   * Get user category by name
   */
  async getUserCategoryByName(userId: string, name: string): Promise<UserCategory | null> {
    const q = query(
      collection(db, 'userCategories'),
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
      createdAt: doc.data().createdAt.toDate()
    } as UserCategory;
  },

  /**
   * Create category
   */
  async createCategory(userId: string, data: UserCategoryData): Promise<string> {
    // Check if category with same name already exists
    const existing = await this.getUserCategoryByName(userId, data.name);
    if (existing) {
      throw new Error('Category with this name already exists');
    }
    
    const docRef = await addDoc(collection(db, 'userCategories'), {
      userId,
      name: data.name,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },

  /**
   * Update category
   */
  async updateCategory(categoryId: string, data: Partial<UserCategoryData>): Promise<void> {
    logServiceOperation('updateCategory', 'userCategories', { categoryId });
    
    try {
      const docRef = doc(db, 'userCategories', categoryId);
      const updateData: Record<string, unknown> = {};
      
      if (data.name !== undefined) {
        // Check if another category with this name exists
        const categoryDoc = await getDoc(docRef);
        if (!categoryDoc.exists()) {
          throw new Error('Category not found');
        }
        const userId = categoryDoc.data().userId;
        const existing = await this.getUserCategoryByName(userId, data.name);
        if (existing && existing.id !== categoryId) {
          throw new Error('Category with this name already exists');
        }
        updateData.name = data.name;
      }
      
      await updateDoc(docRef, cleanFirestoreData(updateData));
    } catch (error) {
      logServiceError('updateCategory', 'userCategories', error, { categoryId });
      throw toServiceError(error, 'userCategories');
    }
  },

  /**
   * Delete category
   */
  async deleteCategory(categoryId: string): Promise<void> {
    logServiceOperation('deleteCategory', 'userCategories', { categoryId });
    
    try {
      const docRef = doc(db, 'userCategories', categoryId);
      await deleteDoc(docRef);
    } catch (error) {
      logServiceError('deleteCategory', 'userCategories', error, { categoryId });
      throw toServiceError(error, 'userCategories');
    }
  },

  /**
   * Subscribe to user categories changes
   */
  subscribeToUserCategories(
    userId: string,
    callback: (categories: UserCategory[]) => void
  ): () => void {
    const q = query(
      collection(db, 'userCategories'),
      where('userId', '==', userId),
      orderBy('name', 'asc')
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        const categories = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate()
        })) as UserCategory[];
        callback(categories);
      },
      (error: Error) => {
        console.error('❌ Error in user categories subscription:', error);
        // Fallback: try without orderBy if index is missing
        const errWithCode = error as ErrorWithCode;
        if (errWithCode.code === 'failed-precondition' && error.message?.includes('index')) {
          console.warn('⚠️ Firestore index for userCategories (userId, name) is missing. Attempting fallback query without orderBy.');
          const fallbackQ = query(
            collection(db, 'userCategories'),
            where('userId', '==', userId)
          );
          onSnapshot(fallbackQ, (fallbackSnapshot: QuerySnapshot) => {
            const categories = fallbackSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt.toDate()
            })) as UserCategory[];
            // Sort manually if fallback is used
            categories.sort((a, b) => a.name.localeCompare(b.name));
            callback(categories);
          }, (fallbackError: Error) => {
            console.error('❌ Fallback query for user categories also failed:', fallbackError);
            callback([]);
          });
        } else {
          callback([]);
        }
      }
    );
    
    return unsubscribe;
  }
};

