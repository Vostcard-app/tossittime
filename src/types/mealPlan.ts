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
 * Planned Meal
 */
export interface PlannedMeal {
  id: string;
  date: Date;
  mealType: MealType;
  mealName: string;
  finishBy: string; // HH:mm format
  startCookingAt?: string; // HH:mm format - Calculated based on meal duration
  suggestedIngredients: string[];
  usesExpiringItems: string[]; // Food item IDs that will be used
  confirmed: boolean;
  shoppingListItems: string[]; // Items needed from store
  skipped: boolean;
  isLeftover: boolean;
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
  usesExpiringItems: string[]; // Food item IDs
  usesLeftovers?: string[]; // Leftover meal IDs
  reasoning?: string; // Why this meal was suggested
  priority?: 'high' | 'medium' | 'low'; // Based on expiration urgency
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
  expirationDate?: Date; // When the leftover expires
  createdAt: Date;
}

/**
 * Context for meal planning AI
 */
export interface MealPlanningContext {
  expiringItems: Array<{
    id: string;
    name: string;
    expirationDate?: Date;
    thawDate?: Date;
    category?: string;
  }>;
  leftoverMeals: LeftoverMeal[];
  userPreferences: {
    dislikedFoods: string[];
    foodPreferences: string[];
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
    expirationDate?: Date;
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
    expirationDate?: Date;
    thawDate?: Date;
    daysUntilExpiration: number;
  }>;
  unplannedEvent: UnplannedEvent;
}

