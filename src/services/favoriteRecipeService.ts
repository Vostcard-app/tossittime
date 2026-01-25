/**
 * Favorite Recipe Service
 * Handles operations for favorite recipes
 */

import {
  Timestamp,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData
} from 'firebase/firestore';
import type { FavoriteRecipe, FavoriteRecipeData } from '../types/favoriteRecipe';
import { transformSnapshot, cleanFirestoreData, logServiceOperation, logServiceError, handleSubscriptionError } from './baseService';
import { toServiceError } from './errors';
import { buildUserQueryWithOrder } from './firestoreQueryBuilder';
import { getDateFieldsForCollection } from '../utils/firestoreDateUtils';
import { getSubscriptionErrorMessage } from './baseService';
import { showToast } from '../components/Toast';
import { collection, doc, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export const favoriteRecipeService = {
  /**
   * Get all favorite recipes for a user
   */
  async getFavoriteRecipes(userId: string): Promise<FavoriteRecipe[]> {
    logServiceOperation('getFavoriteRecipes', 'favoriteRecipes', { userId });

    try {
      const q = buildUserQueryWithOrder('favoriteRecipes', userId, 'createdAt', 'desc');
      const querySnapshot = await getDocs(q);
      const dateFields = getDateFieldsForCollection('favoriteRecipes');
      return transformSnapshot<FavoriteRecipe>(querySnapshot, dateFields);
    } catch (error) {
      logServiceError('getFavoriteRecipes', 'favoriteRecipes', error, { userId });
      throw toServiceError(error, 'favoriteRecipes');
    }
  },

  /**
   * Save a favorite recipe
   */
  async saveFavoriteRecipe(userId: string, data: FavoriteRecipeData): Promise<string> {
    logServiceOperation('saveFavoriteRecipe', 'favoriteRecipes', { userId, dishName: data.dishName });

    try {
      const now = Timestamp.now();
      const recipeData: Record<string, unknown> = {
        userId,
        dishName: data.dishName,
        recipeTitle: data.recipeTitle || null,
        recipeIngredients: data.recipeIngredients,
        recipeSourceUrl: data.recipeSourceUrl || null,
        recipeSourceDomain: data.recipeSourceDomain || null,
        recipeImageUrl: data.recipeImageUrl || null,
        createdAt: now
      };

      // Include parsedIngredients if available
      if (data.parsedIngredients && data.parsedIngredients.length > 0) {
        recipeData.parsedIngredients = data.parsedIngredients;
      }

      const cleanData = cleanFirestoreData(recipeData);
      const docRef = await addDoc(collection(db, 'favoriteRecipes'), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('saveFavoriteRecipe', 'favoriteRecipes', error as Error, { userId, dishName: data.dishName });
      throw toServiceError(error as Error, 'favoriteRecipes');
    }
  },

  /**
   * Delete a favorite recipe
   */
  async deleteFavoriteRecipe(recipeId: string): Promise<void> {
    logServiceOperation('deleteFavoriteRecipe', 'favoriteRecipes', { recipeId });

    try {
      const docRef = doc(db, 'favoriteRecipes', recipeId);
      await deleteDoc(docRef);
    } catch (error) {
      logServiceError('deleteFavoriteRecipe', 'favoriteRecipes', error, { recipeId });
      throw toServiceError(error, 'favoriteRecipes');
    }
  },

  /**
   * Subscribe to favorite recipes for real-time updates
   */
  subscribeToFavoriteRecipes(
    userId: string,
    callback: (recipes: FavoriteRecipe[]) => void
  ): () => void {
    logServiceOperation('subscribeToFavoriteRecipes', 'favoriteRecipes', { userId });

    try {
      const q = buildUserQueryWithOrder('favoriteRecipes', userId, 'createdAt', 'desc');
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot: QuerySnapshot<DocumentData>) => {
          try {
            const dateFields = getDateFieldsForCollection('favoriteRecipes');
            const recipes = transformSnapshot<FavoriteRecipe>(snapshot, dateFields);
            callback(recipes);
          } catch (error) {
            handleSubscriptionError(error, 'favoriteRecipes', userId);
            
            // Show user-visible error message
            const errorMessage = getSubscriptionErrorMessage(error, 'favorite recipes');
            if (errorMessage) {
              showToast(errorMessage, 'error', 5000);
            }
            
            callback([]);
          }
        },
        (error) => {
          handleSubscriptionError(error, 'favoriteRecipes', userId);
          
          // Show user-visible error message
          const errorMessage = getSubscriptionErrorMessage(error, 'favorite recipes');
          if (errorMessage) {
            showToast(errorMessage, 'error', 5000);
          }
          
          callback([]);
        }
      );

      return unsubscribe;
    } catch (error) {
      logServiceError('subscribeToFavoriteRecipes', 'favoriteRecipes', error as Error, { userId });
      // Return a no-op function if subscription fails
      return () => {};
    }
  }
};
