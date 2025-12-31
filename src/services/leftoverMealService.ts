/**
 * Leftover Meal Service
 * Handles leftover meal tracking and calendar integration
 */

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
import type { LeftoverMeal } from '../types';
import { 
  handleSubscriptionError, 
  transformSnapshot, 
  cleanFirestoreData, 
  logServiceOperation, 
  logServiceError 
} from './baseService';
import { toServiceError } from './errors';
import { foodItemService } from './foodItemService';

/**
 * Leftover Meal Service
 */
export const leftoverMealService = {
  /**
   * Add leftover meal
   */
  async addLeftoverMeal(leftover: Omit<LeftoverMeal, 'id' | 'createdAt'>): Promise<string> {
    logServiceOperation('addLeftoverMeal', 'leftoverMeals', { userId: leftover.userId });
    
    try {
      const cleanData = cleanFirestoreData({
        ...leftover,
        createdAt: Timestamp.now()
      });
      
      const docRef = await addDoc(collection(db, 'leftoverMeals'), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('addLeftoverMeal', 'leftoverMeals', error, { userId: leftover.userId });
      throw toServiceError(error, 'leftoverMeals');
    }
  },

  /**
   * Get leftover meals for a date range
   */
  async getLeftoverMeals(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<LeftoverMeal[]> {
    logServiceOperation('getLeftoverMeals', 'leftoverMeals', { userId, startDate, endDate });
    
    try {
      const q = query(
        collection(db, 'leftoverMeals'),
        where('userId', '==', userId),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate)),
        orderBy('date', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      return transformSnapshot<LeftoverMeal>(querySnapshot, ['date', 'createdAt', 'expirationDate']);
    } catch (error) {
      logServiceError('getLeftoverMeals', 'leftoverMeals', error, { userId });
      throw toServiceError(error, 'leftoverMeals');
    }
  },

  /**
   * Subscribe to leftover meals
   */
  subscribeToLeftoverMeals(
    userId: string,
    callback: (meals: LeftoverMeal[]) => void
  ): () => void {
    const q = query(
      collection(db, 'leftoverMeals'),
      where('userId', '==', userId),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const meals = transformSnapshot<LeftoverMeal>(snapshot, ['date', 'createdAt', 'expirationDate']);
        callback(meals);
      },
      (error) => {
        handleSubscriptionError(
          error,
          'leftoverMeals',
          userId,
          undefined,
          undefined
        );
        callback([]);
      }
    );

    return unsubscribe;
  },

  /**
   * Delete leftover meal
   */
  async deleteLeftoverMeal(mealId: string): Promise<void> {
    logServiceOperation('deleteLeftoverMeal', 'leftoverMeals', { mealId });
    
    try {
      await deleteDoc(doc(db, 'leftoverMeals', mealId));
    } catch (error) {
      logServiceError('deleteLeftoverMeal', 'leftoverMeals', error, { mealId });
      throw toServiceError(error, 'leftoverMeals');
    }
  },

  /**
   * Sync leftover meal to calendar as food item
   */
  async syncToCalendar(leftoverMeal: LeftoverMeal): Promise<void> {
    logServiceOperation('syncToCalendar', 'leftoverMeals', { mealId: leftoverMeal.id });
    
    try {
      if (!leftoverMeal.addedToCalendar) {
        // Create a food item for the leftover meal
        const expirationDate = leftoverMeal.expirationDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // Default 2 days
        
        await foodItemService.addFoodItem(
          leftoverMeal.userId,
          {
            name: `Leftover: ${leftoverMeal.mealName}`,
            category: 'Leftovers',
            expirationDate,
            notes: `Leftover meal: ${leftoverMeal.ingredients.join(', ')}`,
            quantity: 1
          },
          'fresh' // Status for new leftover
        );

        // Mark as added to calendar
        const docRef = doc(db, 'leftoverMeals', leftoverMeal.id);
        await updateDoc(docRef, { addedToCalendar: true });
      }
    } catch (error) {
      logServiceError('syncToCalendar', 'leftoverMeals', error, { mealId: leftoverMeal.id });
      throw toServiceError(error, 'leftoverMeals');
    }
  }
};

