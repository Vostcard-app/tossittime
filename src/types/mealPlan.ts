/**
 * Meal Planning Types
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type MealPlanStatus = 'draft' | 'confirmed' | 'active';

/**
 * Weekly Schedule - Default schedule for a day of the week
 */
export interface WeeklyScheduleDay {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday-Saturday
  meals: {
    type: MealType;
    finishBy: string; // HH:mm format
  }[];
}

/**
 * Schedule Amendment - One-time or recurring schedule changes
 */
export interface ScheduleAmendment {
  id: string;
  userId: string;
  date: Date; // Specific date for one-time, or start date for recurring
  mealTypes: MealType[];
  finishBy?: string; // Override finish time for affected meals
  reason?: string;
  isRecurring?: boolean;
  recurringPattern?: {
    frequency: 'weekly' | 'monthly';
    dayOfWeek?: number; // For weekly
    dayOfMonth?: number; // For monthly
    endDate?: Date;
  };
  createdAt: Date;
}

/**
 * User Meal Profile
 */
export interface MealProfile {
  userId: string;
  dislikedFoods: string[];
  foodPreferences: string[]; // e.g., 'vegetarian', 'vegan', 'gluten-free'
  dietApproach?: string; // e.g., 'Paleo', 'Weight Watchers', 'Mediterranean', 'Keto', etc.
  dietStrict?: boolean; // When true, strictly adhere to diet approach criteria
  favoriteMeals: string[]; // User's favorite meals
  servingSize: number; // Number of people meals should feed
  mealDurationPreferences: {
    breakfast: number; // Time in minutes
    lunch: number;
    dinner: number;
  };
  usualSchedule: WeeklyScheduleDay[];
  scheduleAmendments: ScheduleAmendment[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Meal Schedule for a specific date
 */
export interface MealSchedule {
  date: Date;
  meals: {
    type: MealType;
    finishBy: string; // HH:mm format
  }[];
}

/**
 * Dish - Individual dish within a meal
 */
export interface Dish {
  id: string;
  dishName: string; // User-provided dish name
  recipeTitle?: string | null; // Recipe title (if from recipe import)
  recipeIngredients: string[];
  recipeSourceUrl?: string | null;
  recipeSourceDomain?: string | null;
  recipeImageUrl?: string | null;
  reservedQuantities?: Record<string, number>; // Reserved quantities for this dish
  claimedItemIds?: string[]; // IDs of items from dashboard/pantry that are claimed for this dish
  claimedShoppingListItemIds?: string[]; // IDs of shopping list items that are claimed for this dish
  completed?: boolean; // Whether this dish has been prepared
}

/**
 * Planned Meal - Container for a meal type on a date (can contain multiple dishes)
 */
export interface PlannedMeal {
  id: string;
  date: Date;
  mealType: MealType;
  finishBy: string; // HH:mm format
  startCookingAt?: string; // HH:mm format - Calculated based on meal duration
  confirmed: boolean;
  skipped: boolean;
  isLeftover: boolean;
  dishes: Dish[]; // Array of dishes for this meal type
  // Legacy fields for backward compatibility (deprecated)
  mealName?: string; // Deprecated: use dishes[].dishName
  suggestedIngredients?: string[]; // Deprecated: use dishes[].recipeIngredients
  usesBestBySoonItems?: string[]; // Deprecated: use dishes[].claimedItemIds
  shoppingListItems?: string[]; // Deprecated
  completed?: boolean; // Deprecated: use dishes[].completed
  recipeTitle?: string | null; // Deprecated: use dishes[].recipeTitle
  recipeIngredients?: string[] | null; // Deprecated: use dishes[].recipeIngredients
  recipeSourceUrl?: string | null; // Deprecated: use dishes[].recipeSourceUrl
  recipeSourceDomain?: string | null; // Deprecated: use dishes[].recipeSourceDomain
  recipeImageUrl?: string | null; // Deprecated: use dishes[].recipeImageUrl
  reservedQuantities?: Record<string, number>; // Deprecated: use dishes[].reservedQuantities
  claimedItemIds?: string[]; // Deprecated: use dishes[].claimedItemIds
  claimedShoppingListItemIds?: string[]; // Deprecated: use dishes[].claimedShoppingListItemIds
}

/**
 * Meal Plan
 */
export interface MealPlan {
  id: string;
  userId: string;
  weekStartDate: Date;
  meals: PlannedMeal[];
  status: MealPlanStatus;
  createdAt: Date;
  confirmedAt?: Date;
}

/**
 * Meal Suggestion from AI
 */
export interface MealSuggestion {
  mealName: string;
  mealType: MealType;
  date: Date;
  suggestedIngredients: string[];
  usesBestBySoonItems: string[]; // Food item IDs
  usesLeftovers?: string[]; // Leftover meal IDs
  reasoning?: string; // Why this meal was suggested
  priority?: 'high' | 'medium' | 'low'; // Based on best by urgency
}

/**
 * Unplanned Event
 */
export interface UnplannedEvent {
  id: string;
  userId: string;
  date: Date;
  mealTypes: MealType[];
  reason: string;
  createdAt: Date;
}

/**
 * Leftover Meal
 */
export interface LeftoverMeal {
  id: string;
  userId: string;
  date: Date;
  mealName: string;
  mealType: MealType;
  ingredients: string[];
  quantity: string; // e.g., "2 servings"
  addedToCalendar: boolean;
  bestByDate?: Date; // When the leftover is best by
  createdAt: Date;
}

/**
 * Context for meal planning AI
 */
export interface MealPlanningContext {
  bestBySoonItems: Array<{
    id: string;
    name: string;
    bestByDate?: Date;
    thawDate?: Date;
    category?: string;
  }>;
  leftoverMeals: LeftoverMeal[];
  userPreferences: {
    dislikedFoods: string[];
    foodPreferences: string[];
    dietApproach?: string;
    dietStrict?: boolean;
    favoriteMeals: string[];
    servingSize: number;
    mealDurationPreferences: {
      breakfast: number;
      lunch: number;
      dinner: number;
    };
  };
  schedule: MealSchedule[];
  currentInventory: Array<{
    id: string;
    name: string;
    bestByDate?: Date;
    thawDate?: Date;
  }>;
}

/**
 * Context for replanning after unplanned events
 */
export interface ReplanningContext extends MealPlanningContext {
  skippedMeals: PlannedMeal[];
  wasteRiskItems: Array<{
    id: string;
    name: string;
    bestByDate?: Date;
    thawDate?: Date;
    daysUntilBestBy: number;
  }>;
  unplannedEvent: UnplannedEvent;
}

