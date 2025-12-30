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

// Base utilities and error classes
export * from './baseService';
export * from './errors';

