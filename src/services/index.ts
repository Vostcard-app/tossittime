/**
 * Services Barrel Export
 * Central export point for all service modules
 */

// Service implementations
export { foodItemService } from './foodItemService';
export { shoppingListService } from './shoppingListService';
export { shoppingListsService } from './shoppingListsService';
export { userSettingsService } from './userSettingsService';
export { userItemsService } from './userItemsService';
export { userCategoriesService } from './userCategoriesService';
export { adminService } from './adminService';
export { analyticsService } from './analyticsService';
export { analyticsAggregationService } from './analyticsAggregationService';
export { barcodeService } from './barcodeService';
export { findFoodItems } from './foodkeeperService';
export { notificationService } from './notificationService';

// Meal planning services
export { mealProfileService } from './mealProfileService';
export { mealPlanningService } from './mealPlanningService';
export { leftoverMealService } from './leftoverMealService';
export { unplannedEventService } from './unplannedEventService';
export { cookingReminderService } from './cookingReminderService';
export { musgravesService } from './musgravesService';
export { generateMealSuggestions, replanMeals } from './openaiService';

// Base utilities and error classes
export * from './baseService';
export * from './errors';

