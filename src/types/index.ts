/**
 * Types Barrel Export
 * Central export point for all type definitions
 */

// Food Item Types
export type {
  FoodItem,
  FoodItemData,
  FoodItemStatus,
  FoodKeeperItem
} from './foodItem';

// Shopping List Types
export type {
  ShoppingList,
  ShoppingListItem
} from './shoppingList';

// User Types
export type {
  UserSettings,
  UserItem,
  UserItemData,
  UserCategory,
  UserCategoryData,
  UserInfo
} from './user';

// Navigation Types
export type {
  AddItemLocationState,
  CalendarLocationState
} from './navigation';

// Common Types
export type {
  FirestoreData,
  FirestoreUpdateData,
  ErrorWithCode,
  CSSPropertiesWithVars
} from './common';

export { getErrorInfo } from './common';

// Component Types
export type * from './components';

// Meal Planning Types
export type {
  MealType,
  MealPlanStatus,
  WeeklyScheduleDay,
  ScheduleAmendment,
  MealProfile,
  MealSchedule,
  PlannedMeal,
  MealPlan,
  MealSuggestion,
  UnplannedEvent,
  LeftoverMeal,
  MealPlanningContext,
  ReplanningContext
} from './mealPlan';
