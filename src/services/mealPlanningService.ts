/**
 * Meal Planning Service
 * Core meal plan generation and management
 */

import {
  collection,
  doc,
  getDoc,
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
  FirestoreUpdateData
} from '../types';
import {
  handleSubscriptionError,
  transformSnapshot,
  cleanFirestoreData,
  logServiceOperation,
  logServiceError
} from './baseService';
import { toServiceError } from './errors';
import { generateMealSuggestions, replanMeals } from './openaiService';
import { mealProfileService } from './mealProfileService';
import { leftoverMealService } from './leftoverMealService';
import { foodItemService } from './foodItemService';
import { addDays, startOfWeek, format, parseISO, isSameDay } from 'date-fns';

/**
 * Meal Planning Service
 */
export const mealPlanningService = {
  /**
   * Generate meal suggestions using AI
   */
  async generateMealSuggestions(
    userId: string,
    weekStartDate: Date
  ): Promise<MealSuggestion[]> {
    logServiceOperation('generateMealSuggestions', 'mealPlans', { userId, weekStartDate });

    try {
      // Get user profile
      const profile = await mealProfileService.getMealProfile(userId);
      if (!profile) {
        throw new Error('Meal profile not found. Please set up your meal preferences first.');
      }

      // Get expiring items (next 7-14 days)
      const allItems = await foodItemService.getFoodItems(userId);
      const now = new Date();
      const twoWeeksFromNow = addDays(now, 14);
      
      const expiringItems = allItems.filter(item => {
        const expDate = item.expirationDate || item.thawDate;
        if (!expDate) return false;
        return expDate >= now && expDate <= twoWeeksFromNow;
      });

      // Get leftover meals
      const weekEndDate = addDays(weekStartDate, 7);
      const leftoverMeals = await leftoverMealService.getLeftoverMeals(
        userId,
        weekStartDate,
        weekEndDate
      );

      // Get schedule for each day of the week
      const schedule = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStartDate, i);
        const daySchedule = await mealProfileService.getEffectiveSchedule(userId, date);
        schedule.push(daySchedule);
      }

      // Build context for AI
      const context = {
        expiringItems: expiringItems.map(item => ({
          id: item.id,
          name: item.name,
          expirationDate: item.expirationDate,
          thawDate: item.thawDate,
          category: item.category
        })),
        leftoverMeals,
        userPreferences: {
          dislikedFoods: profile.dislikedFoods,
          foodPreferences: profile.foodPreferences,
          mealDurationPreferences: profile.mealDurationPreferences
        },
        schedule,
        currentInventory: allItems.map(item => ({
          id: item.id,
          name: item.name,
          expirationDate: item.expirationDate,
          thawDate: item.thawDate
        }))
      };

      // Generate suggestions
      const suggestions = await generateMealSuggestions(context);
      return suggestions;
    } catch (error) {
      logServiceError('generateMealSuggestions', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
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
      // Get profile for meal duration preferences
      const profile = await mealProfileService.getMealProfile(userId);
      const mealDurations = profile?.mealDurationPreferences || {
        breakfast: 20,
        lunch: 30,
        dinner: 40
      };

      // Convert suggestions to planned meals
      // First, get schedules for all days
      const schedulePromises = selectedMeals.map(suggestion => 
        mealProfileService.getEffectiveSchedule(userId, new Date(suggestion.date))
      );
      const schedules = await Promise.all(schedulePromises);

      const plannedMeals: PlannedMeal[] = selectedMeals.map((suggestion, index) => {
        const schedule = schedules[index];
        const finishBy = schedule.meals.find(m => m.type === suggestion.mealType)?.finishBy || '18:00';

        // Calculate start cooking time
        const duration = mealDurations[suggestion.mealType] || 30;
        const [hours, minutes] = finishBy.split(':').map(Number);
        const finishDateTime = new Date(suggestion.date);
        finishDateTime.setHours(hours, minutes, 0, 0);
        const startDateTime = new Date(finishDateTime.getTime() - duration * 60 * 1000);
        const startCookingAt = format(startDateTime, 'HH:mm');

        return {
          id: `meal-${index}-${Date.now()}`,
          date: new Date(suggestion.date),
          mealType: suggestion.mealType,
          mealName: suggestion.mealName,
          finishBy,
          startCookingAt,
          suggestedIngredients: suggestion.suggestedIngredients,
          usesExpiringItems: suggestion.usesExpiringItems,
          confirmed: false,
          shoppingListItems: [],
          skipped: false,
          isLeftover: false
        };
      });

      // Meals are already resolved with correct finishBy times
      const resolvedMeals = plannedMeals;

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
        meals: data.meals.map((meal: any) => ({
          ...meal,
          date: meal.date.toDate()
        })),
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
          meals: data.meals.map((meal: any) => ({
            ...meal,
            date: meal.date.toDate()
          })),
          createdAt: data.createdAt.toDate(),
          confirmedAt: data.confirmedAt?.toDate()
        } as MealPlan;
        callback(plan);
      },
      (error) => {
        handleSubscriptionError(error, 'mealPlans', userId, undefined, undefined);
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
      } as FirestoreUpdateData<MealPlan>);
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

      // Identify skipped meals
      const skippedMeals = currentPlan.meals.filter(meal =>
        isSameDay(meal.date, unplannedEvent.date) &&
        unplannedEvent.mealTypes.includes(meal.mealType)
      );

      // Recalculate inventory
      const availableItems = await this.recalculateInventory(userId, mealPlanId);
      
      // Get waste risk items
      const wasteRiskItems = await this.getWasteRiskItems(userId, mealPlanId);

      // Get profile and leftovers
      const profile = await mealProfileService.getMealProfile(userId);
      const weekStart = startOfWeek(unplannedEvent.date, { weekStartsOn: 0 });
      const weekEnd = addDays(weekStart, 7);
      const leftoverMeals = await leftoverMealService.getLeftoverMeals(userId, weekStart, weekEnd);

      // Get schedule
      const schedule = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const daySchedule = await mealProfileService.getEffectiveSchedule(userId, date);
        schedule.push(daySchedule);
      }

      // Build replanning context
      const context = {
        expiringItems: availableItems
          .filter(item => {
            const expDate = item.expirationDate || item.thawDate;
            return expDate && expDate <= addDays(new Date(), 14);
          })
          .map(item => ({
            id: item.id,
            name: item.name,
            expirationDate: item.expirationDate,
            thawDate: item.thawDate,
            category: item.category
          })),
        leftoverMeals,
        userPreferences: {
          dislikedFoods: profile?.dislikedFoods || [],
          foodPreferences: profile?.foodPreferences || [],
          mealDurationPreferences: profile?.mealDurationPreferences || {
            breakfast: 20,
            lunch: 30,
            dinner: 40
          }
        },
        schedule,
        currentInventory: availableItems.map(item => ({
          id: item.id,
          name: item.name,
          expirationDate: item.expirationDate,
          thawDate: item.thawDate
        })),
        skippedMeals,
        wasteRiskItems: wasteRiskItems.map(item => ({
          id: item.id,
          name: item.name,
          expirationDate: item.expirationDate,
          thawDate: item.thawDate,
          daysUntilExpiration: item.expirationDate
            ? Math.ceil((item.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : item.thawDate
            ? Math.ceil((item.thawDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 999
        })),
        unplannedEvent
      };

      // Generate new suggestions
      const newSuggestions = await replanMeals(context);

      // Mark skipped meals
      const updatedMeals = currentPlan.meals.map(meal => {
        if (skippedMeals.some(sm => sm.id === meal.id)) {
          return { ...meal, skipped: true };
        }
        return meal;
      });

      // Add new meal suggestions
      const profileForDurations = profile || {
        mealDurationPreferences: { breakfast: 20, lunch: 30, dinner: 40 }
      };

      const newPlannedMeals: PlannedMeal[] = newSuggestions.map((suggestion, index) => {
        const finishBy = '18:00'; // Will be resolved from schedule
        const duration = profileForDurations.mealDurationPreferences[suggestion.mealType] || 30;
        const finishDateTime = new Date(suggestion.date);
        const [hours, minutes] = finishBy.split(':').map(Number);
        finishDateTime.setHours(hours, minutes, 0, 0);
        const startDateTime = new Date(finishDateTime.getTime() - duration * 60 * 1000);
        const startCookingAt = format(startDateTime, 'HH:mm');

        return {
          id: `meal-${Date.now()}-${index}`,
          date: new Date(suggestion.date),
          mealType: suggestion.mealType,
          mealName: suggestion.mealName,
          finishBy,
          startCookingAt,
          suggestedIngredients: suggestion.suggestedIngredients,
          usesExpiringItems: suggestion.usesExpiringItems,
          confirmed: false,
          shoppingListItems: [],
          skipped: false,
          isLeftover: false
        };
      });

      // Resolve finishBy times
      const resolvedNewMeals = await Promise.all(
        newPlannedMeals.map(async (meal) => {
          const schedule = await mealProfileService.getEffectiveSchedule(userId, meal.date);
          const scheduledMeal = schedule.meals.find(m => m.type === meal.mealType);
          if (scheduledMeal) {
            const finishBy = scheduledMeal.finishBy;
            const [hours, minutes] = finishBy.split(':').map(Number);
            const finishDateTime = new Date(meal.date);
            finishDateTime.setHours(hours, minutes, 0, 0);
            const duration = profileForDurations.mealDurationPreferences[meal.mealType] || 30;
            const startDateTime = new Date(finishDateTime.getTime() - duration * 60 * 1000);
            return {
              ...meal,
              finishBy,
              startCookingAt: format(startDateTime, 'HH:mm')
            };
          }
          return meal;
        })
      );

      // Combine updated and new meals
      const allMeals = [...updatedMeals, ...resolvedNewMeals];

      // Update meal plan
      const docRef = doc(db, 'mealPlans', currentPlan.id);
      await updateDoc(docRef, {
        meals: allMeals.map(meal => ({
          ...meal,
          date: Timestamp.fromDate(meal.date)
        }))
      } as FirestoreUpdateData<MealPlan>);

      return {
        ...currentPlan,
        meals: allMeals
      };
    } catch (error) {
      logServiceError('replanMeals', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Recalculate inventory accounting for planned usage
   */
  async recalculateInventory(userId: string, mealPlanId: string): Promise<FoodItem[]> {
    logServiceOperation('recalculateInventory', 'mealPlans', { userId, mealPlanId });

    try {
      const plan = await this.getMealPlan(
        userId,
        startOfWeek(new Date(), { weekStartsOn: 0 })
      );
      
      if (!plan) {
        // Return all items if no plan
        return await foodItemService.getFoodItems(userId);
      }

      // Get all items
      const allItems = await foodItemService.getFoodItems(userId);
      
      // Get items that are "reserved" for confirmed or non-skipped meals
      const reservedItemIds = new Set<string>();
      plan.meals
        .filter(meal => meal.confirmed && !meal.skipped)
        .forEach(meal => {
          meal.usesExpiringItems.forEach(itemId => reservedItemIds.add(itemId));
        });

      // Return all items (reserved items are still available, just tracked)
      // In a more sophisticated system, we might track quantities
      return allItems;
    } catch (error) {
      logServiceError('recalculateInventory', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Get items at risk of expiring before being used
   */
  async getWasteRiskItems(userId: string, mealPlanId: string): Promise<FoodItem[]> {
    logServiceOperation('getWasteRiskItems', 'mealPlans', { userId, mealPlanId });

    try {
      const plan = await this.getMealPlan(
        userId,
        startOfWeek(new Date(), { weekStartsOn: 0 })
      );
      
      if (!plan) {
        return [];
      }

      const allItems = await foodItemService.getFoodItems(userId);
      const now = new Date();
      
      // Find items that expire before they're planned to be used
      const wasteRiskItems: FoodItem[] = [];
      
      for (const item of allItems) {
        const expDate = item.expirationDate || item.thawDate;
        if (!expDate) continue;

        // Find when this item is planned to be used
        const plannedUse = plan.meals
          .filter(meal => meal.usesExpiringItems.includes(item.id) && !meal.skipped)
          .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

        if (!plannedUse) {
          // Item not planned - check if it expires soon
          const daysUntilExp = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilExp <= 3) {
            wasteRiskItems.push(item);
          }
        } else if (expDate < plannedUse.date) {
          // Item expires before planned use
          wasteRiskItems.push(item);
        }
      }

      return wasteRiskItems;
    } catch (error) {
      logServiceError('getWasteRiskItems', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  }
};


