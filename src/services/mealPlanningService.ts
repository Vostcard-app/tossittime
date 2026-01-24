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
  LeftoverMeal,
  Dish
} from '../types';
import {
  handleSubscriptionError,
  cleanFirestoreData,
  logServiceOperation,
  logServiceError
} from './baseService';
import { toServiceError } from './errors';
import { generateMealSuggestions, replanMeals } from './openaiService';
import { mealProfileService } from './mealProfileService';
import { leftoverMealService } from './leftoverMealService';
import { foodItemService } from './foodItemService';
import { addDays, startOfWeek, format, isSameDay, startOfDay } from 'date-fns';

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
    servingSize?: number, // Optional day-specific serving size
    dietApproach?: string, // Optional day-specific diet approach
    dietStrict?: boolean // Optional day-specific strict setting
  ): Promise<MealSuggestion[]> {
    logServiceOperation('generateDailySuggestions', 'mealPlans', { userId, date, mealType });

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
        const expDate = item.bestByDate || item.thawDate;
        if (!expDate) return false;
        return expDate >= now && expDate <= twoWeeksFromNow;
      });

      // Get leftover meals (gracefully handle if index not created yet)
      let leftoverMeals: LeftoverMeal[] = [];
      try {
        leftoverMeals = await leftoverMealService.getLeftoverMeals(
          userId,
          date,
          date
        );
      } catch (error: any) {
        // If index error, continue without leftover meals
        if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
          logServiceOperation('getLeftoverMeals', 'leftoverMeals', { 
            note: 'Index not created yet, continuing without leftover meals' 
          });
        } else {
          throw error; // Re-throw other errors
        }
      }

      // Get schedule for this day
      const daySchedule = await mealProfileService.getEffectiveSchedule(userId, date);

      // Build context for AI - focused on this specific day and meal type
      const bestBySoonItemsMapped = expiringItems.map(item => ({
        id: item.id,
        name: item.name,
        bestByDate: item.bestByDate,
        thawDate: item.thawDate,
        category: item.category
      }));
      const context = {
        expiringItems: bestBySoonItemsMapped, // Keep for backward compatibility
        bestBySoonItems: bestBySoonItemsMapped,
        leftoverMeals,
        userPreferences: {
          dislikedFoods: profile.dislikedFoods,
          foodPreferences: profile.foodPreferences,
          // If dietApproach is undefined, use profile default
          // If dietApproach is empty string (explicitly "None"), use undefined (no diet approach)
          // Otherwise use the specified diet approach
          dietApproach: dietApproach === undefined 
            ? profile.dietApproach 
            : (dietApproach === '' ? undefined : dietApproach),
          dietStrict: dietStrict !== undefined ? dietStrict : profile.dietStrict, // Use day-specific or profile default
          favoriteMeals: profile.favoriteMeals || [],
          servingSize: servingSize || profile.servingSize || 2, // Use day-specific or profile default
          mealDurationPreferences: profile.mealDurationPreferences
        },
        schedule: [daySchedule],
        currentInventory: allItems.map(item => ({
          id: item.id,
          name: item.name,
          bestByDate: item.bestByDate,
          thawDate: item.thawDate
        }))
      };

      // Generate suggestions for this specific day and meal type
      const allSuggestions = await generateMealSuggestions(context, mealType);
      
      // Filter to only this meal type and limit to 3
      const filtered = allSuggestions
        .filter(s => s.mealType === mealType && isSameDay(new Date(s.date), date))
        .slice(0, 3);

      // If we don't have 3 suggestions, generate more based on preferences only
      if (filtered.length < 3 && expiringItems.length === 0) {
        // Generate preference-based suggestions
        const prefContext = {
          ...context,
          expiringItems: [],
          bestBySoonItems: [],
          currentInventory: []
        };
        const prefSuggestions = await generateMealSuggestions(prefContext);
        const prefFiltered = prefSuggestions
          .filter(s => s.mealType === mealType && isSameDay(new Date(s.date), date))
          .slice(0, 3 - filtered.length);
        filtered.push(...prefFiltered);
      }

      return filtered.slice(0, 3);
    } catch (error) {
      logServiceError('generateDailySuggestions', 'mealPlans', error, { userId });
      throw toServiceError(error, 'mealPlans');
    }
  },

  /**
   * Generate meal suggestions using AI (legacy method - kept for compatibility)
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
        const expDate = item.bestByDate || item.thawDate;
        if (!expDate) return false;
        return expDate >= now && expDate <= twoWeeksFromNow;
      });

      // Get leftover meals (gracefully handle if index not created yet)
      const weekEndDate = addDays(weekStartDate, 7);
      let leftoverMeals: LeftoverMeal[] = [];
      try {
        leftoverMeals = await leftoverMealService.getLeftoverMeals(
          userId,
          weekStartDate,
          weekEndDate
        );
      } catch (error: any) {
        // If index error, continue without leftover meals
        if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
          logServiceOperation('getLeftoverMeals', 'leftoverMeals', { 
            note: 'Index not created yet, continuing without leftover meals' 
          });
        } else {
          throw error; // Re-throw other errors
        }
      }

      // Get schedule for each day of the week
      const schedule = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStartDate, i);
        const daySchedule = await mealProfileService.getEffectiveSchedule(userId, date);
        schedule.push(daySchedule);
      }

      // Build context for AI
      const bestBySoonItemsMapped = expiringItems.map(item => ({
        id: item.id,
        name: item.name,
        bestByDate: item.bestByDate,
        thawDate: item.thawDate,
        category: item.category
      }));
      const context = {
        expiringItems: bestBySoonItemsMapped, // Keep for backward compatibility
        bestBySoonItems: bestBySoonItemsMapped,
        leftoverMeals,
        userPreferences: {
          dislikedFoods: profile.dislikedFoods,
          foodPreferences: profile.foodPreferences,
          dietApproach: profile.dietApproach,
          dietStrict: profile.dietStrict,
          favoriteMeals: profile.favoriteMeals || [],
          servingSize: profile.servingSize || 2,
          mealDurationPreferences: profile.mealDurationPreferences
        },
        schedule,
        currentInventory: allItems.map(item => ({
          id: item.id,
          name: item.name,
          bestByDate: item.bestByDate,
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
          finishBy,
          startCookingAt,
          confirmed: false,
          skipped: false,
          isLeftover: false,
          dishes: []
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
      const updateData: any = {};

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
        meals: data.meals.map((meal: any) => {
          const normalizedMeal: PlannedMeal = {
            ...meal,
            date: startOfDay(meal.date.toDate()) // Normalize to start of day for consistent comparison
          };
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
          meals: data.meals.map((meal: any) => {
            const normalizedMeal: PlannedMeal = {
              ...meal,
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
      // Get leftover meals (gracefully handle if index not created yet)
      let leftoverMeals: LeftoverMeal[] = [];
      try {
        leftoverMeals = await leftoverMealService.getLeftoverMeals(userId, weekStart, weekEnd);
      } catch (error: any) {
        // If index error, continue without leftover meals
        if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
          logServiceOperation('getLeftoverMeals', 'leftoverMeals', { 
            note: 'Index not created yet, continuing without leftover meals' 
          });
        } else {
          throw error; // Re-throw other errors
        }
      }

      // Get schedule
      const schedule = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const daySchedule = await mealProfileService.getEffectiveSchedule(userId, date);
        schedule.push(daySchedule);
      }

      // Build replanning context
      const bestBySoonItemsMapped = availableItems
        .filter(item => {
          const expDate = item.bestByDate || item.thawDate;
          return expDate && expDate <= addDays(new Date(), 14);
        })
        .map(item => ({
          id: item.id,
          name: item.name,
          bestByDate: item.bestByDate,
          thawDate: item.thawDate,
          category: item.category
        }));
      const context = {
        expiringItems: bestBySoonItemsMapped, // Keep for backward compatibility
        bestBySoonItems: bestBySoonItemsMapped,
        leftoverMeals,
        userPreferences: {
          dislikedFoods: profile?.dislikedFoods || [],
          foodPreferences: profile?.foodPreferences || [],
          dietApproach: profile?.dietApproach,
          dietStrict: profile?.dietStrict,
          favoriteMeals: profile?.favoriteMeals || [],
          servingSize: profile?.servingSize || 2,
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
          bestByDate: item.bestByDate,
          thawDate: item.thawDate
        })),
        skippedMeals,
        wasteRiskItems: wasteRiskItems.map(item => ({
          id: item.id,
          name: item.name,
          bestByDate: item.bestByDate,
          thawDate: item.thawDate,
          daysUntilBestBy: item.bestByDate
            ? Math.ceil((item.bestByDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
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
          finishBy,
          startCookingAt,
          confirmed: false,
          skipped: false,
          isLeftover: false,
          dishes: []
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
      });

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
          // Legacy support: check dishes for claimed items
          meal.dishes?.forEach(dish => {
            dish.claimedItemIds?.forEach(itemId => reservedItemIds.add(itemId));
          });
          // Legacy: also check meal-level claimedItemIds
          meal.claimedItemIds?.forEach(itemId => reservedItemIds.add(itemId));
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
        const expDate = item.bestByDate || item.thawDate;
        if (!expDate) continue;

        // Find when this item is planned to be used
        const plannedUse = plan.meals
          .filter(meal => {
            if (meal.skipped) return false;
            // Check dishes for claimed items
            const claimedInDish = meal.dishes?.some(dish => dish.claimedItemIds?.includes(item.id));
            // Legacy: also check meal-level claimedItemIds
            const claimedInMeal = meal.claimedItemIds?.includes(item.id);
            return claimedInDish || claimedInMeal;
          })
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


