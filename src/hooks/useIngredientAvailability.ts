/**
 * Custom hook for managing ingredient availability checking
 * Handles loading pantry items, shopping lists, planned meals, and calculating availability
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { 
  foodItemService, 
  shoppingListService, 
  shoppingListsService, 
  mealPlanningService,
  recipeImportService 
} from '../services';
import type { FoodItem, ShoppingListItem, PlannedMeal } from '../types';

export interface IngredientStatus {
  ingredient: string;
  index: number;
  status: 'available' | 'missing' | 'partial';
  matchingItems: FoodItem[];
  count: number;
  availableQuantity: number;
  neededQuantity: number;
}

interface UseIngredientAvailabilityOptions {
  isOpen?: boolean;
  excludeMealId?: string; // Optional meal ID to exclude from reserved quantities calculation
}

export const useIngredientAvailability = (
  ingredients: string[],
  options: UseIngredientAvailabilityOptions = {}
) => {
  const { isOpen = true, excludeMealId } = options;
  const [user] = useAuthState(auth);
  
  const [pantryItems, setPantryItems] = useState<FoodItem[]>([]);
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);
  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [userShoppingLists, setUserShoppingLists] = useState<any[]>([]);
  const [targetListId, setTargetListId] = useState<string | null>(null);

  // Load pantry items (dashboard items) for cross-reference
  useEffect(() => {
    if (!user || !isOpen) return;

    const unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
      setPantryItems(items);
    });

    return () => unsubscribe();
  }, [user, isOpen]);

  // Load shopping lists and items, and calculate reserved quantities
  useEffect(() => {
    if (!user || !isOpen) return;

    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load shopping lists
        const lists = await shoppingListsService.getShoppingLists(user.uid);
        setUserShoppingLists(lists);
        
        // Set default list
        const defaultList = lists.find(list => list.isDefault) || lists[0];
        if (defaultList) {
          setTargetListId(defaultList.id);
          
          // Load shopping list items from default list
          const items = await shoppingListService.getShoppingListItems(user.uid, defaultList.id);
          setShoppingListItems(items);
        } else {
          setShoppingListItems([]);
        }

        // Load all planned meals to calculate reserved quantities
        const allMeals = await mealPlanningService.loadAllPlannedMealsForMonth(user.uid);
        
        // Exclude the current meal being edited if provided
        const mealsToConsider = excludeMealId 
          ? allMeals.filter(meal => meal.id !== excludeMealId)
          : allMeals;
        
        // Calculate reserved quantities
        const reservedMap = recipeImportService.calculateReservedQuantities(mealsToConsider, pantryItems);
        setReservedQuantitiesMap(reservedMap);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, isOpen, pantryItems, excludeMealId]);

  // Check ingredient availability against pantry items (excluding shopping list items and reserved quantities)
  const ingredientStatuses = useMemo<IngredientStatus[]>(() => {
    if (!ingredients || ingredients.length === 0) return [];
    
    return ingredients.map((ingredient, index) => {
      const matchResult = recipeImportService.checkIngredientAvailabilityDetailed(
        ingredient, 
        pantryItems, 
        shoppingListItems,
        reservedQuantitiesMap
      );
      return {
        ingredient,
        index,
        status: matchResult.status,
        matchingItems: matchResult.matchingItems,
        count: matchResult.count,
        availableQuantity: matchResult.availableQuantity,
        neededQuantity: matchResult.neededQuantity
      };
    });
  }, [ingredients, pantryItems, shoppingListItems, reservedQuantitiesMap]);

  return {
    pantryItems,
    shoppingListItems,
    reservedQuantitiesMap,
    ingredientStatuses,
    loading,
    userShoppingLists,
    targetListId,
    setTargetListId
  };
};
