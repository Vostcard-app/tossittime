/**
 * Meal Planning Service
 * Core meal plan generation and management
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  onSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type {
  MealPlan,
  MealSuggestion,
  PlannedMeal,
  UnplannedEvent,
  FoodItem,
  MealType,
  Dish
} from '../types';
import {
  handleSubscriptionError,
  cleanFirestoreData,
  logServiceOperation,
  logServiceError,
  getSubscriptionErrorMessage
} from './baseService';
import { showToast } from '../components/Toast';
import { toServiceError } from './errors';
import { addDays, startOfWeek, isSameDay, startOfDay } from 'date-fns';
import { generateDailySuggestions, generateMealSuggestionsForWeek, createPlannedMealsFromSuggestions } from './mealPlanGenerator';
import { replanMealsAfterEvent } from './mealPlanReplanner';
import { recalculateInventory, getWasteRiskItems } from './mealPlanInventory';

/**
 * Migrate legacy meal structure to nested dishes format
 * This ensures meals created before the refactor are accessible
 */
function migrateLegacyMeal(meal: PlannedMeal): PlannedMeal {
  // If meal already has dishes, return as-is
  if (meal.dishes && meal.dishes.length > 0) {
    return meal;
  }

  // Check if this is a legacy meal (has old structure)
  const hasLegacyData = meal.mealName || meal.recipeTitle || 
    (meal.recipeIngredients && meal.recipeIngredients.length > 0) || 
    (meal.suggestedIngredients && meal.suggestedIngredients.length > 0);

  if (hasLegacyData) {
    // Create a dish from legacy meal data
    const dish: Dish = {
      id: meal.id + '-dish-0', // Generate a unique ID for the migrated dish
      dishName: meal.mealName || meal.recipeTitle || 'Unnamed Dish',
      recipeTitle: meal.recipeTitle || null,
      recipeIngredients: meal.recipeIngredients || meal.suggestedIngredients || [],
      recipeSourceUrl: meal.recipeSourceUrl || null,
      recipeSourceDomain: meal.recipeSourceDomain || null,
      recipeImageUrl: meal.recipeImageUrl || null,
      reservedQuantities: meal.reservedQuantities || {},
      claimedItemIds: meal.claimedItemIds || meal.usesBestBySoonItems || [],
      claimedShoppingListItemIds: meal.claimedShoppingListItemIds || [],
      completed: meal.completed || false
    };

    return {
      ...meal,
      dishes: [dish]
    };
  }

  // No legacy data, ensure dishes array exists
  return {
    ...meal,
    dishes: []
  };
}

/**
 * Meal Planning Service
 */
export const mealPlanningService = {
  /**
   * Generate 3 meal suggestions for a specific day
   */
  async generateDailySuggestions(
    userId: string,
    date: Date,
    mealType: MealType,
    servingSize?: number,
    dietApproach?: string,
    dietStrict?: boolean
  ): Promise<MealSuggestion[]> {
    return generateDailySuggestions(userId, date, mealType, servingSize, dietApproach, dietStrict);
  },

  /**
   * Generate meal suggestions using AI (legacy method - kept for compatibility)
   */
  async generateMealSuggestions(
    userId: string,
    weekStartDate: Date
  ): Promise<MealSuggestion[]> {
    return generateMealSuggestionsForWeek(userId, weekStartDate);
  },

  /**
   * Create meal plan from selected suggestions
   */
  async createMealPlan(
    userId: string,
    weekStartDate: Date,
    selectedMeals: MealSuggestion[]
  ): Promise<MealPlan> {
    logServiceOperation('createMealPlan', 'mealPlans', { userId, weekStartDate });

    try {
      // Convert suggestions to planned meals
      const resolvedMeals = await createPlannedMealsFromSuggestions(userId, selectedMeals);

      // Create meal plan document
      const cleanData = cleanFirestoreData({
        userId,
        weekStartDate: Timestamp.fromDate(weekStartDate),
        meals: resolvedMeals.map(meal => ({
          ...meal,
          date: Timestamp.fromDate(meal.date)
        })),
        status: 'draft' as const,
        createdAt: Timestamp.now()
      });

      const docRef = await addDoc(collection(db, 'mealPlans'), cleanData);
      
      return {
        id: docRef.id,
        userId,
        weekStartDate,
        meals: resolvedMeals,
        status: 'draft',
        createdAt: new Date()
      };
    } catch (error) {
      logServiceError('createMealPlan', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Create an empty meal plan for a week
   */
  async createEmptyMealPlan(userId: string, weekStartDate: Date): Promise<MealPlan> {
    logServiceOperation('createEmptyMealPlan', 'mealPlans', { userId, weekStartDate });

    try {
      const cleanData = cleanFirestoreData({
        userId,
        weekStartDate: Timestamp.fromDate(weekStartDate),
        meals: [],
        status: 'draft' as const,
        createdAt: Timestamp.now()
      });

      const docRef = await addDoc(collection(db, 'mealPlans'), cleanData);
      
      return {
        id: docRef.id,
        userId,
        weekStartDate,
        meals: [],
        status: 'draft',
        createdAt: new Date()
      };
    } catch (error) {
      logServiceError('createEmptyMealPlan', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Update an existing meal plan
   */
  async updateMealPlan(mealPlanId: string, updates: Partial<MealPlan>): Promise<void> {
    logServiceOperation('updateMealPlan', 'mealPlans', { mealPlanId, updates });

    try {
      const docRef = doc(db, 'mealPlans', mealPlanId);
      const updateData: Partial<{
        meals: Array<Omit<PlannedMeal, 'date'> & { date: Timestamp }>;
        status: string;
        weekStartDate: Timestamp;
        confirmedAt: Timestamp;
      }> = {};

      if (updates.meals) {
        updateData.meals = updates.meals.map(meal => ({
          ...meal,
          date: Timestamp.fromDate(meal.date)
        }));
      }

      if (updates.status) {
        updateData.status = updates.status;
      }

      if (updates.weekStartDate) {
        updateData.weekStartDate = Timestamp.fromDate(updates.weekStartDate);
      }

      if (updates.confirmedAt) {
        updateData.confirmedAt = Timestamp.fromDate(updates.confirmedAt);
      }

      await updateDoc(docRef, cleanFirestoreData(updateData));
    } catch (error) {
      logServiceError('updateMealPlan', 'mealPlans', error, { mealPlanId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Get meal plan for a week
   */
  async getMealPlan(userId: string, weekStartDate: Date): Promise<MealPlan | null> {
    logServiceOperation('getMealPlan', 'mealPlans', { userId, weekStartDate });

    try {
      const weekEndDate = addDays(weekStartDate, 7);
      const q = query(
        collection(db, 'mealPlans'),
        where('userId', '==', userId),
        where('weekStartDate', '>=', Timestamp.fromDate(weekStartDate)),
        where('weekStartDate', '<', Timestamp.fromDate(weekEndDate))
      );

      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return null;
      }

      const doc = querySnapshot.docs[0];
      const data = doc.data();
      
      return {
        id: doc.id,
        ...data,
        weekStartDate: data.weekStartDate.toDate(),
        meals: data.meals.map((meal: DocumentData) => {
          const normalizedMeal: PlannedMeal = {
            ...meal,
            date: startOfDay(meal.date.toDate()) // Normalize to start of day for consistent comparison
          } as PlannedMeal;
          // Migrate legacy meals to nested dishes structure
          return migrateLegacyMeal(normalizedMeal);
        }),
        createdAt: data.createdAt.toDate(),
        confirmedAt: data.confirmedAt?.toDate()
      } as MealPlan;
    } catch (error) {
      logServiceError('getMealPlan', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Subscribe to meal plan changes
   */
  subscribeToMealPlan(
    userId: string,
    weekStartDate: Date,
    callback: (plan: MealPlan | null) => void
  ): () => void {
    const weekEndDate = addDays(weekStartDate, 7);
    const q = query(
      collection(db, 'mealPlans'),
      where('userId', '==', userId),
      where('weekStartDate', '>=', Timestamp.fromDate(weekStartDate)),
      where('weekStartDate', '<', Timestamp.fromDate(weekEndDate))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (snapshot.empty) {
          callback(null);
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        const plan: MealPlan = {
          id: doc.id,
          ...data,
          weekStartDate: data.weekStartDate.toDate(),
          meals: data.meals.map((meal: DocumentData) => {
            const normalizedMeal: PlannedMeal = {
              ...(meal as PlannedMeal),
              date: startOfDay(meal.date.toDate()) // Normalize to start of day for consistent comparison
            };
            // Migrate legacy meals to nested dishes structure
            return migrateLegacyMeal(normalizedMeal);
          }),
          createdAt: data.createdAt.toDate(),
          confirmedAt: data.confirmedAt?.toDate()
        } as MealPlan;
        callback(plan);
      },
      (error) => {
        handleSubscriptionError(error, 'mealPlans', userId, undefined, undefined);
        
        // Show user-visible error message
        const errorMessage = getSubscriptionErrorMessage(error, 'meal plans');
        if (errorMessage) {
          showToast(errorMessage, 'error', 5000);
        }
        
        callback(null);
      }
    );

    return unsubscribe;
  },

  /**
   * Confirm daily meals
   */
  async confirmDailyMeals(userId: string, date: Date, mealIds: string[]): Promise<void> {
    logServiceOperation('confirmDailyMeals', 'mealPlans', { userId, date, mealIds });

    try {
      const weekStart = startOfWeek(date, { weekStartsOn: 0 });
      const plan = await this.getMealPlan(userId, weekStart);
      
      if (!plan) {
        throw new Error('Meal plan not found');
      }

      // Update meal confirmation status
      const updatedMeals = plan.meals.map(meal => {
        if (isSameDay(meal.date, date) && mealIds.includes(meal.id)) {
          return { ...meal, confirmed: true };
        }
        return meal;
      });

      const docRef = doc(db, 'mealPlans', plan.id);
      await updateDoc(docRef, {
        meals: updatedMeals.map(meal => ({
          ...meal,
          date: Timestamp.fromDate(meal.date)
        }))
      });
    } catch (error) {
      logServiceError('confirmDailyMeals', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Replan meals after unplanned event
   */
  async replanMeals(
    userId: string,
    mealPlanId: string,
    unplannedEvent: UnplannedEvent
  ): Promise<MealPlan> {
    logServiceOperation('replanMeals', 'mealPlans', { userId, mealPlanId });

    try {
      // Get current plan
      const currentPlan = await this.getMealPlan(userId, 
        startOfWeek(unplannedEvent.date, { weekStartsOn: 0 })
      );
      
      if (!currentPlan) {
        throw new Error('Meal plan not found');
      }

      // Replan meals
      const updatedPlan = await replanMealsAfterEvent(userId, currentPlan, unplannedEvent);

      // Update meal plan in Firestore
      const docRef = doc(db, 'mealPlans', currentPlan.id);
      await updateDoc(docRef, {
        meals: updatedPlan.meals.map(meal => ({
          ...meal,
          date: Timestamp.fromDate(meal.date)
        }))
      });

      return updatedPlan;
    } catch (error) {
      logServiceError('replanMeals', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Recalculate inventory accounting for planned usage
   */
  async recalculateInventory(userId: string, mealPlanId: string): Promise<FoodItem[]> {
    const plan = await this.getMealPlan(
      userId,
      startOfWeek(new Date(), { weekStartsOn: 0 })
    );
    return recalculateInventory(userId, mealPlanId, plan);
  },

  /**
   * Get items at risk of expiring before being used
   */
  async getWasteRiskItems(userId: string, mealPlanId: string): Promise<FoodItem[]> {
    const plan = await this.getMealPlan(
      userId,
      startOfWeek(new Date(), { weekStartsOn: 0 })
    );
    return getWasteRiskItems(userId, mealPlanId, plan);
  },

  /**
   * Load all planned meals for a given month
   * Returns an array of all PlannedMeal objects across all meal plans in the month
   */
  async loadAllPlannedMealsForMonth(userId: string, monthDate: Date = new Date()): Promise<PlannedMeal[]> {
    logServiceOperation('loadAllPlannedMealsForMonth', 'mealPlans', { userId, monthDate });

    try {
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      
      const allMeals: PlannedMeal[] = [];
      let weekStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      
      while (weekStart <= monthEnd) {
        const plan = await this.getMealPlan(userId, weekStart);
        if (plan) {
          allMeals.push(...plan.meals);
        }
        weekStart = addDays(weekStart, 7);
      }
      
      return allMeals;
    } catch (error) {
      logServiceError('loadAllPlannedMealsForMonth', 'mealPlans', error, { userId, monthDate });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Load 21 meals starting from a given date
   * Returns an array of up to 21 PlannedMeal objects in chronological order
   */
  async loadMealsFromDate(userId: string, startDate: Date, limit: number = 21): Promise<PlannedMeal[]> {
    logServiceOperation('loadMealsFromDate', 'mealPlans', { userId, startDate, limit });

    try {
      const normalizedStartDate = startOfDay(startDate);
      const allMeals: PlannedMeal[] = [];
      
      // Start from the week containing the start date
      let weekStart = startOfWeek(normalizedStartDate, { weekStartsOn: 0 });
      weekStart.setHours(0, 0, 0, 0);
      
      // Load meals until we have enough or reach reasonable limit (4 weeks ahead)
      const maxWeeks = 4;
      let weeksChecked = 0;
      
      while (allMeals.length < limit && weeksChecked < maxWeeks) {
        const plan = await this.getMealPlan(userId, weekStart);
        if (plan) {
          // Filter meals that are on or after the start date
          const relevantMeals = plan.meals.filter(meal => {
            const mealDate = startOfDay(meal.date);
            return mealDate >= normalizedStartDate && meal.dishes && meal.dishes.length > 0;
          });
          allMeals.push(...relevantMeals);
        }
        weekStart = addDays(weekStart, 7);
        weeksChecked++;
      }
      
      // Sort by date and meal type, then take first 21
      allMeals.sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        // If same date, order by meal type: breakfast, lunch, dinner
        const mealTypeOrder: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };
        return mealTypeOrder[a.mealType] - mealTypeOrder[b.mealType];
      });
      
      return allMeals.slice(0, limit);
    } catch (error) {
      logServiceError('loadMealsFromDate', 'mealPlans', error, { userId, startDate, limit });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Get PlannedMeal for a specific date and meal type
   */
  async getMealForDateAndType(userId: string, date: Date, mealType: MealType): Promise<PlannedMeal | null> {
    logServiceOperation('getMealForDateAndType', 'mealPlans', { userId, date, mealType });

    try {
      const weekStart = startOfWeek(date, { weekStartsOn: 0 });
      weekStart.setHours(0, 0, 0, 0);

      const mealPlan = await this.getMealPlan(userId, weekStart);
      if (!mealPlan) {
        return null;
      }

      const meal = mealPlan.meals.find(
        m => isSameDay(m.date, date) && m.mealType === mealType
      );

      return meal || null;
    } catch (error) {
      logServiceError('getMealForDateAndType', 'mealPlans', error, { userId, date, mealType });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Get meal plan containing a specific meal
   */
  async getMealPlanForMeal(userId: string, mealId: string): Promise<MealPlan | null> {
    logServiceOperation('getMealPlanForMeal', 'mealPlans', { userId, mealId });

    try {
      // Search through recent meal plans (last 3 months)
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, 1);

      let weekStart = startOfWeek(threeMonthsAgo, { weekStartsOn: 0 });
      weekStart.setHours(0, 0, 0, 0);

      while (weekStart <= threeMonthsFromNow) {
        const plan = await this.getMealPlan(userId, weekStart);
        if (plan && plan.meals.some(m => m.id === mealId)) {
          return plan;
        }
        weekStart = addDays(weekStart, 7);
      }

      return null;
    } catch (error) {
      logServiceError('getMealPlanForMeal', 'mealPlans', error, { userId, mealId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Add a dish to a PlannedMeal
   */
  async addDishToMeal(userId: string, mealId: string, dish: Dish): Promise<void> {
    logServiceOperation('addDishToMeal', 'mealPlans', { userId, mealId, dish });

    try {
      const mealPlan = await this.getMealPlanForMeal(userId, mealId);
      if (!mealPlan) {
        throw new Error('Meal plan not found');
      }

      const mealIndex = mealPlan.meals.findIndex(m => m.id === mealId);
      if (mealIndex < 0) {
        throw new Error('Meal not found');
      }

      const meal = mealPlan.meals[mealIndex];
      const updatedDishes = [...(meal.dishes || []), dish];
      mealPlan.meals[mealIndex] = {
        ...meal,
        dishes: updatedDishes
      };

      await this.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });
    } catch (error) {
      logServiceError('addDishToMeal', 'mealPlans', error, { userId, mealId, dish });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Remove a dish from a PlannedMeal
   */
  async removeDishFromMeal(userId: string, mealId: string, dishId: string): Promise<void> {
    logServiceOperation('removeDishFromMeal', 'mealPlans', { userId, mealId, dishId });

    try {
      const mealPlan = await this.getMealPlanForMeal(userId, mealId);
      if (!mealPlan) {
        console.error(`[removeDishFromMeal] Meal plan not found for mealId: ${mealId}`);
        throw new Error('Meal plan not found');
      }

      const mealIndex = mealPlan.meals.findIndex(m => m.id === mealId);
      if (mealIndex < 0) {
        console.error(`[removeDishFromMeal] Meal not found in plan. mealId: ${mealId}, planId: ${mealPlan.id}`);
        throw new Error('Meal not found in meal plan');
      }

      const meal = mealPlan.meals[mealIndex];
      
      // Ensure meal is migrated (has dishes array)
      const migratedMeal = migrateLegacyMeal(meal);
      
      // Log dish information for debugging
      console.log(`[removeDishFromMeal] Looking for dishId: ${dishId}`);
      console.log(`[removeDishFromMeal] Meal ID: ${meal.id}, Date: ${meal.date}, Type: ${meal.mealType}`);
      console.log(`[removeDishFromMeal] Meal has ${migratedMeal.dishes?.length || 0} dishes`);
      console.log(`[removeDishFromMeal] Dish IDs:`, migratedMeal.dishes?.map(d => d.id) || []);
      console.log(`[removeDishFromMeal] Was legacy meal:`, !meal.dishes || meal.dishes.length === 0);
      
      // Check if dish exists
      const dishExists = migratedMeal.dishes?.some(d => d.id === dishId);
      if (!dishExists) {
        // Special case: if this is a legacy meal and we're trying to delete the migrated dish
        // (which has ID meal.id + '-dish-0'), and the meal doesn't have dishes in Firestore yet,
        // we should delete the entire meal instead
        if (!meal.dishes || meal.dishes.length === 0) {
          // This is a legacy meal that hasn't been saved with dishes array yet
          // If we're trying to delete the migrated dish (meal.id + '-dish-0'), remove the entire meal
          if (dishId === meal.id + '-dish-0') {
            console.log(`[removeDishFromMeal] Legacy meal detected, removing entire meal`);
            const updatedMeals = mealPlan.meals.filter(m => m.id !== mealId);
            mealPlan.meals = updatedMeals;
            await this.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });
            console.log(`[removeDishFromMeal] Successfully removed legacy meal ${mealId}`);
            return;
          }
        }
        
        console.error(`[removeDishFromMeal] Dish not found. dishId: ${dishId}, available dish IDs:`, migratedMeal.dishes?.map(d => d.id) || []);
        throw new Error(`Dish with ID ${dishId} not found in meal. Available dish IDs: ${migratedMeal.dishes?.map(d => d.id).join(', ') || 'none'}`);
      }

      const updatedDishes = (migratedMeal.dishes || []).filter(d => d.id !== dishId);
      
      // If this was the last dish, we could optionally delete the meal, but for now, just update with remaining dishes
      mealPlan.meals[mealIndex] = {
        ...migratedMeal,
        dishes: updatedDishes
      };

      await this.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });
      console.log(`[removeDishFromMeal] Successfully removed dish ${dishId} from meal ${mealId}`);
    } catch (error) {
      logServiceError('removeDishFromMeal', 'mealPlans', error, { userId, mealId, dishId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Delete an entire meal from a meal plan
   */
  async deleteMeal(userId: string, mealId: string): Promise<void> {
    logServiceOperation('deleteMeal', 'mealPlans', { userId, mealId });

    try {
      const mealPlan = await this.getMealPlanForMeal(userId, mealId);
      if (!mealPlan) {
        console.error(`[deleteMeal] Meal plan not found for mealId: ${mealId}`);
        throw new Error('Meal plan not found');
      }

      const mealIndex = mealPlan.meals.findIndex(m => m.id === mealId);
      if (mealIndex < 0) {
        console.error(`[deleteMeal] Meal not found in plan. mealId: ${mealId}, planId: ${mealPlan.id}`);
        throw new Error('Meal not found in meal plan');
      }

      // Remove the meal from the plan
      const updatedMeals = mealPlan.meals.filter(m => m.id !== mealId);
      mealPlan.meals = updatedMeals;

      await this.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });
      console.log(`[deleteMeal] Successfully deleted meal ${mealId}`);
    } catch (error) {
      logServiceError('deleteMeal', 'mealPlans', error, { userId, mealId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Update a dish in a PlannedMeal
   */
  async updateDishInMeal(userId: string, mealId: string, dishId: string, updates: Partial<Dish>): Promise<void> {
    logServiceOperation('updateDishInMeal', 'mealPlans', { userId, mealId, dishId, updates });

    try {
      const mealPlan = await this.getMealPlanForMeal(userId, mealId);
      if (!mealPlan) {
        throw new Error('Meal plan not found');
      }

      const mealIndex = mealPlan.meals.findIndex(m => m.id === mealId);
      if (mealIndex < 0) {
        throw new Error('Meal not found');
      }

      const meal = mealPlan.meals[mealIndex];
      const dishIndex = (meal.dishes || []).findIndex(d => d.id === dishId);
      if (dishIndex < 0) {
        throw new Error('Dish not found');
      }

      const updatedDishes = [...(meal.dishes || [])];
      updatedDishes[dishIndex] = {
        ...updatedDishes[dishIndex],
        ...updates
      };

      mealPlan.meals[mealIndex] = {
        ...meal,
        dishes: updatedDishes
      };

      await this.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });
    } catch (error) {
      logServiceError('updateDishInMeal', 'mealPlans', error, { userId, mealId, dishId, updates });
      throw toServiceError(error, 'mealPlans');
    }
  }
};


