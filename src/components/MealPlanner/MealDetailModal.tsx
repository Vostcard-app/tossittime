/**
 * Meal Detail Modal
 * Displays meal information with recipe link, ingredients, edit and delete functionality
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { mealPlanningService, shoppingListService, foodItemService, recipeImportService, favoriteRecipeService } from '../../services';
import type { PlannedMeal, MealType, Dish, FavoriteRecipe } from '../../types';
import { showToast } from '../Toast';
import { format, isSameDay } from 'date-fns';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { IngredientChecklist } from './IngredientChecklist';
import { fuzzyMatchIngredientToItem } from '../../utils/fuzzyIngredientMatcher';

interface MealDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  dish: Dish | null;
  meal: PlannedMeal | null;
  onDishDeleted?: () => void; // Callback to refresh calendar
  // Legacy support for backward compatibility
  onMealDeleted?: () => void; // Deprecated: use onDishDeleted
}

/**
 * Smart truncate text at word boundary with ellipsis
 * Finds the last space before maxLength and truncates there
 */
const smartTruncate = (text: string, maxLength: number = 60): string => {
  if (text.length <= maxLength) return text;
  
  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  // If we found a space, truncate there; otherwise truncate at maxLength
  const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
  return text.substring(0, cutPoint) + '...';
};

export const MealDetailModal: React.FC<MealDetailModalProps> = ({
  isOpen,
  onClose,
  dish,
  meal,
  onDishDeleted,
  onMealDeleted // Legacy support
}) => {
  const [user] = useAuthState(auth);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [editedMealName, setEditedMealName] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedMealType, setEditedMealType] = useState<MealType>('breakfast');
  const [editedIngredients, setEditedIngredients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedIngredientIndices, setSelectedIngredientIndices] = useState<Set<number>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [favoriteRecipes, setFavoriteRecipes] = useState<FavoriteRecipe[]>([]);

  // Use dish data if available, otherwise fall back to legacy meal data
  // For legacy meals, check if they've been migrated (have dishes array)
  const currentDish = dish || (meal ? (
    // If meal has dishes array, use the first dish (migrated meal)
    meal.dishes && meal.dishes.length > 0 ? meal.dishes[0] : {
      // Legacy meal - create dish object with migrated ID format
      id: meal.id + '-dish-0', // Use migrated dish ID format
      dishName: meal.mealName || '',
      recipeTitle: meal.recipeTitle || null,
      recipeIngredients: meal.recipeIngredients || meal.suggestedIngredients || [],
      recipeSourceUrl: meal.recipeSourceUrl || null,
      recipeSourceDomain: meal.recipeSourceDomain || null,
      recipeImageUrl: meal.recipeImageUrl || null,
      reservedQuantities: meal.reservedQuantities,
      claimedItemIds: meal.claimedItemIds,
      claimedShoppingListItemIds: meal.claimedShoppingListItemIds,
      completed: meal.completed
    }
  ) : null);
  
  const ingredients = currentDish?.recipeIngredients || [];

  // Use ingredient availability hook
  const {
    pantryItems,
    shoppingListItems,
    ingredientStatuses,
    reservedQuantitiesMap,
    targetListId
  } = useIngredientAvailability(
    ingredients,
    { isOpen, excludeMealId: meal?.id }
  );

  if (!isOpen || !currentDish || !meal) return null;

  // Initialize edit state when dish changes
  useEffect(() => {
    if (currentDish) {
      setEditedMealName(currentDish?.dishName || '');
      setEditedDate(format(meal.date, 'yyyy-MM-dd'));
      setEditedMealType(meal.mealType);
      setEditedIngredients(currentDish?.recipeIngredients || []);
      setSelectedIngredientIndices(new Set()); // Reset selections
      setIsPreparing(false); // Reset preparing state
    }
  }, [currentDish, meal]);

  // Load favorite recipes
  useEffect(() => {
    if (!user) {
      setFavoriteRecipes([]);
      return;
    }

    const loadFavorites = async () => {
      try {
        const favorites = await favoriteRecipeService.getFavoriteRecipes(user.uid);
        setFavoriteRecipes(favorites);
      } catch (error) {
        console.error('Error loading favorite recipes:', error);
      }
    };

    loadFavorites();
  }, [user, isOpen]);

  // Note: Real-time subscriptions are handled by useIngredientAvailability hook
  // The hook subscribes to food items and loads shopping list items
  // ingredientStatuses will automatically update when pantry items or shopping list items change

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset to original values
    if (currentDish && meal) {
      setEditedMealName(currentDish.dishName);
      setEditedDate(format(meal.date, 'yyyy-MM-dd'));
      setEditedMealType(meal.mealType);
      setEditedIngredients(currentDish.recipeIngredients || []);
    }
  };

  // Get favorite status for a dish
  const getFavoriteId = (dish: Dish): string | null => {
    if (!dish.recipeSourceUrl) return null;
    
    // Match by recipeSourceUrl (primary) or dishName + recipeSourceUrl
    const favorite = favoriteRecipes.find(fav => 
      fav.recipeSourceUrl === dish.recipeSourceUrl ||
      (fav.dishName === dish.dishName && fav.recipeSourceUrl === dish.recipeSourceUrl)
    );
    
    return favorite?.id || null;
  };

  // Handle favorite toggle
  const handleFavoriteToggle = async (dish: Dish, checked: boolean) => {
    if (!user) return;

    try {
      if (checked) {
        // Add to favorites
        const recipeDomain = dish.recipeSourceDomain || (dish.recipeSourceUrl ? (() => {
          try {
            return new URL(dish.recipeSourceUrl).hostname;
          } catch {
            return null;
          }
        })() : null);

        await favoriteRecipeService.saveFavoriteRecipe(user.uid, {
          dishName: dish.dishName,
          recipeTitle: dish.recipeTitle || dish.dishName,
          recipeIngredients: dish.recipeIngredients,
          recipeSourceUrl: dish.recipeSourceUrl || null,
          recipeSourceDomain: recipeDomain,
          recipeImageUrl: dish.recipeImageUrl || null,
          parsedIngredients: dish.parsedIngredients
        });

        // Reload favorites to get the new ID
        const favorites = await favoriteRecipeService.getFavoriteRecipes(user.uid);
        setFavoriteRecipes(favorites);
        showToast('Recipe added to favorites', 'success');
      } else {
        // Remove from favorites
        const favoriteId = getFavoriteId(dish);
        if (favoriteId) {
          await favoriteRecipeService.deleteFavoriteRecipe(favoriteId);
          
          // Update local state
          setFavoriteRecipes(prev => prev.filter(fav => fav.id !== favoriteId));
          showToast('Recipe removed from favorites', 'success');
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Failed to update favorite. Please try again.', 'error');
    }
  };

  const handleCancelPreparing = () => {
    setIsPreparing(false);
    setSelectedIngredientIndices(new Set()); // Reset selections
  };

  const handleSave = async () => {
    if (!user || !meal || !currentDish) {
      showToast('Please log in to edit dishes', 'error');
      return;
    }

    if (!editedMealName.trim()) {
      showToast('Dish name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      // Parse edited ingredients (split by newlines, filter empty lines, trim)
      const parsedIngredients = editedIngredients
        .map(ing => ing.trim())
        .filter(ing => ing.length > 0);

      // Calculate reserved quantities for new ingredients
      const newReservedQuantities = recipeImportService.calculateMealReservedQuantities(
        parsedIngredients,
        pantryItems
      );

      // Get current shopping list items for this dish
      const currentShoppingListItems = shoppingListItems.filter(item => item.mealId === currentDish.id);
      
      // Two-way sync: Update shopping list based on ingredient changes
      if (targetListId) {
        // Find ingredients that need to be added (missing/not available)
        const ingredientsToAdd: string[] = [];
        for (const ingredient of parsedIngredients) {
          const status = recipeImportService.checkIngredientAvailabilityDetailed(
            ingredient,
            pantryItems,
            shoppingListItems.filter(item => item.mealId !== meal.id), // Exclude current meal's items
            reservedQuantitiesMap
          );
          
          // If missing or partial, check if already in shopping list
          if (status.status === 'missing' || status.status === 'partial') {
            const alreadyInList = currentShoppingListItems.some(item => 
              fuzzyMatchIngredientToItem(ingredient, item.name)
            );
            if (!alreadyInList) {
              ingredientsToAdd.push(ingredient);
            }
          }
        }
        
        // Add missing ingredients to shopping list
        for (const ingredient of ingredientsToAdd) {
          await shoppingListService.addShoppingListItem(
            user.uid,
            targetListId,
            ingredient,
            false,
            'dish_edit',
            currentDish.id
          );
        }
        
        // Remove shopping list items that no longer match any ingredient (fuzzy matching)
        for (const shoppingItem of currentShoppingListItems) {
          const stillMatches = parsedIngredients.some(ingredient =>
            fuzzyMatchIngredientToItem(ingredient, shoppingItem.name)
          );
          if (!stillMatches) {
            await shoppingListService.deleteShoppingListItem(shoppingItem.id);
          }
        }
      }

      // Update dashboard items' usedByMeals arrays
      // Find matching pantry items for each ingredient
      const matchingItemIds: string[] = [];
      for (const ingredient of parsedIngredients) {
        for (const pantryItem of pantryItems) {
          if (fuzzyMatchIngredientToItem(ingredient, pantryItem.name)) {
            if (!matchingItemIds.includes(pantryItem.id)) {
              matchingItemIds.push(pantryItem.id);
            }
          }
        }
      }
      
      // Update usedByMeals for matching items (using dish.id)
      for (const itemId of matchingItemIds) {
        const item = pantryItems.find(p => p.id === itemId);
        if (item) {
          const currentUsedByMeals = item.usedByMeals || [];
          const updatedUsedByMeals = currentUsedByMeals.includes(currentDish.id)
            ? currentUsedByMeals
            : [...currentUsedByMeals, currentDish.id];
          await foodItemService.updateFoodItemUsedByMeals(user.uid, itemId, updatedUsedByMeals);
        }
      }
      
      // Remove dishId from items that no longer match
      const allItemIds = pantryItems.map(item => item.id);
      for (const itemId of allItemIds) {
        if (!matchingItemIds.includes(itemId)) {
          const item = pantryItems.find(p => p.id === itemId);
          if (item && item.usedByMeals?.includes(currentDish.id)) {
            const updatedUsedByMeals = item.usedByMeals.filter(id => id !== currentDish.id);
            await foodItemService.updateFoodItemUsedByMeals(user.uid, itemId, updatedUsedByMeals);
          }
        }
      }

      // Calculate new date
      const newDate = new Date(editedDate);
      newDate.setHours(meal.date.getHours(), meal.date.getMinutes());
      
      // Calculate old and new week starts
      const oldWeekStart = new Date(meal.date);
      oldWeekStart.setDate(meal.date.getDate() - meal.date.getDay()); // Start of week (Sunday)
      oldWeekStart.setHours(0, 0, 0, 0);
      
      const newWeekStart = new Date(newDate);
      newWeekStart.setDate(newDate.getDate() - newDate.getDay()); // Start of week (Sunday)
      newWeekStart.setHours(0, 0, 0, 0);

      // Get the old meal plan (where meal currently is)
      const oldMealPlan = await mealPlanningService.getMealPlan(user.uid, oldWeekStart);
      
      if (!oldMealPlan) {
        showToast('Meal plan not found', 'error');
        setSaving(false);
        return;
      }

      // Check if date changed to a different week
      const weekChanged = oldWeekStart.getTime() !== newWeekStart.getTime();

      // Update the dish
      const updatedDish: Partial<Dish> = {
        dishName: editedMealName.trim(),
        recipeTitle: currentDish.recipeSourceUrl ? editedMealName.trim() : currentDish.recipeTitle,
        recipeIngredients: parsedIngredients,
        reservedQuantities: newReservedQuantities
      };

      // If meal type or date changed, we need to move the dish to a different meal
      if (weekChanged || editedMealType !== meal.mealType) {
        // Remove dish from old meal
        await mealPlanningService.removeDishFromMeal(user.uid, meal.id, currentDish.id);

        // Get or create new week's meal plan
        let newMealPlan = await mealPlanningService.getMealPlan(user.uid, newWeekStart);
        
        if (!newMealPlan) {
          newMealPlan = await mealPlanningService.createEmptyMealPlan(user.uid, newWeekStart);
        }

        // Get or create PlannedMeal for new date and meal type
        let newPlannedMeal = newMealPlan.meals.find(
          m => isSameDay(m.date, newDate) && m.mealType === editedMealType
        );

        if (!newPlannedMeal) {
          const newMealId = `meal-${Date.now()}`;
          newPlannedMeal = {
            id: newMealId,
            date: newDate,
            mealType: editedMealType,
            finishBy: meal.finishBy,
            confirmed: meal.confirmed,
            skipped: meal.skipped,
            isLeftover: meal.isLeftover,
            dishes: []
          };
        }

        // Add updated dish to new meal
        const updatedDishFull: Dish = {
          ...currentDish,
          ...updatedDish
        };
        await mealPlanningService.addDishToMeal(user.uid, newPlannedMeal.id, updatedDishFull);
      } else {
        // Same week and meal type - check if date changed
        const dateChanged = !isSameDay(meal.date, newDate);
        
        if (dateChanged) {
          // Update the meal's date
          const mealIndex = oldMealPlan.meals.findIndex(m => m.id === meal.id);
          if (mealIndex >= 0) {
            oldMealPlan.meals[mealIndex] = {
              ...oldMealPlan.meals[mealIndex],
              date: newDate
            };
            await mealPlanningService.updateMealPlan(oldMealPlan.id, { meals: oldMealPlan.meals });
          }
        }
        
        // Update the dish
        await mealPlanningService.updateDishInMeal(user.uid, meal.id, currentDish.id, updatedDish);
      }

      showToast('Dish updated successfully', 'success');
      setIsEditing(false);
      onDishDeleted?.(); // Refresh calendar
      onMealDeleted?.(); // Legacy support
    } catch (error) {
      console.error('Error updating meal:', error);
      showToast('Failed to update meal. Please try again.', 'error');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !meal || !meal.id) {
      showToast('Please log in to delete meals', 'error');
      return;
    }

    if (!currentDish || !currentDish.id) {
      console.error('[handleDelete] currentDish is missing or has no ID', { currentDish, meal });
      showToast('Unable to delete: dish information is missing', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${currentDish.dishName}"? This will also remove associated ingredients from your shopping list.`)) {
      return;
    }

    setDeleting(true);
    try {
      console.log('[handleDelete] Attempting to delete dish', {
        dishId: currentDish.id,
        dishName: currentDish.dishName,
        mealId: meal.id,
        mealDate: meal.date,
        mealType: meal.mealType,
        hasDishes: meal.dishes?.length || 0
      });

      // Delete all shopping list items associated with this dish
      try {
        await shoppingListService.deleteShoppingListItemsByMealId(user.uid, currentDish.id);
        console.log('[handleDelete] Shopping list items deleted');
      } catch (shoppingListError) {
        console.warn('[handleDelete] Error deleting shopping list items (continuing anyway):', shoppingListError);
        // Continue with dish deletion even if shopping list deletion fails
      }

      // Remove the dish from the meal
      await mealPlanningService.removeDishFromMeal(user.uid, meal.id, currentDish.id);
      console.log('[handleDelete] Dish removed from meal successfully');

      // If this was the last dish, we could optionally delete the meal, but for now we'll keep it
      showToast('Dish deleted successfully', 'success');
      onDishDeleted?.(); // Refresh calendar
      onMealDeleted?.(); // Legacy support
      onClose();
    } catch (error: any) {
      console.error('[handleDelete] Error deleting dish:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      console.error('[handleDelete] Error details:', {
        errorMessage,
        dishId: currentDish.id,
        mealId: meal.id,
        error
      });
      showToast(`Failed to delete dish: ${errorMessage}`, 'error');
      setDeleting(false);
    }
  };

  const displayName = currentDish.dishName;
  const truncatedDisplayName = smartTruncate(displayName, 60);

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredientIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredientIndices(newSelected);
  };

  const handlePrepared = () => {
    // Enter preparing mode - show ingredient selection
    setIsPreparing(true);
    // Pre-select all ingredients by default
    const allIndices = new Set(ingredients.map((_ingredient: string, index: number) => index));
    setSelectedIngredientIndices(allIndices);
  };

  const handleConfirmPrepared = async () => {
    if (!user || !meal || !currentDish) {
      showToast('Please log in to mark dishes as prepared', 'error');
      return;
    }

    if (selectedIngredientIndices.size === 0) {
      showToast('Please select at least one ingredient to mark as prepared', 'error');
      return;
    }

    setPreparing(true);
    try {
      // Get checked ingredients
      const checkedIngredients = ingredients.filter((_ingredient: string, index: number) => 
        selectedIngredientIndices.has(index)
      );

      // Delete claimed shopping list items that match checked ingredients
      if (currentDish.claimedShoppingListItemIds && currentDish.claimedShoppingListItemIds.length > 0) {
        const claimedShoppingItems = shoppingListItems.filter(item => 
          currentDish.claimedShoppingListItemIds!.includes(item.id)
        );

        for (const shoppingItem of claimedShoppingItems) {
          // Check if this shopping list item matches any checked ingredient
          const matchesCheckedIngredient = checkedIngredients.some((ingredient: string) =>
            fuzzyMatchIngredientToItem(ingredient, shoppingItem.name)
          );
          if (matchesCheckedIngredient) {
            await shoppingListService.deleteShoppingListItem(shoppingItem.id);
          }
        }
      }

      // Process claimed dashboard items that match checked ingredients
      if (currentDish.claimedItemIds && currentDish.claimedItemIds.length > 0) {
        const claimedItems = pantryItems.filter(item => 
          currentDish.claimedItemIds!.includes(item.id)
        );

        // Filter to only items that match checked ingredients
        const itemsToProcess: string[] = [];
        const reservedQuantitiesForChecked: Record<string, number> = {};

        for (const item of claimedItems) {
          // Check if this item matches any checked ingredient
          const matchesCheckedIngredient = checkedIngredients.some((ingredient: string) =>
            fuzzyMatchIngredientToItem(ingredient, item.name)
          );
          
          if (matchesCheckedIngredient) {
            itemsToProcess.push(item.id);
            // Get reserved quantity for this item
            const normalizedName = item.name.toLowerCase().trim();
            if (currentDish.reservedQuantities?.[normalizedName]) {
              reservedQuantitiesForChecked[normalizedName] = currentDish.reservedQuantities[normalizedName];
            }
          }
        }

        // Reduce quantities and remove dishId from usedByMeals for checked ingredients only
        if (itemsToProcess.length > 0 && Object.keys(reservedQuantitiesForChecked).length > 0) {
          await foodItemService.markItemsAsUsedForMeal(
            user.uid,
            currentDish.id,
            itemsToProcess,
            reservedQuantitiesForChecked
          );
        }
      }

      // Mark dish as completed
      await mealPlanningService.updateDishInMeal(user.uid, meal.id, currentDish.id, { completed: true });

      showToast('Dish marked as prepared!', 'success');
      onDishDeleted?.(); // Refresh calendar
      onMealDeleted?.(); // Legacy support
      onClose();
    } catch (error) {
      console.error('Error marking dish as prepared:', error);
      showToast('Failed to mark dish as prepared. Please try again.', 'error');
      setPreparing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1003,
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
              {currentDish.dishName}
            </h2>
            {currentDish.completed && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '12px',
                  fontWeight: '600',
                  backgroundColor: '#10b981',
                  color: '#ffffff'
                }}
              >
                Completed
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem 0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Meal Name */}
          <div style={{ marginBottom: '1.5rem' }}>
            {isEditing ? (
              <>
                <input
                  type="text"
                  value={editedMealName}
                  onChange={(e) => setEditedMealName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    marginBottom: '0.5rem'
                  }}
                  placeholder="Meal name"
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px'
                    }}
                  />
                  <select
                    value={editedMealType}
                    onChange={(e) => setEditedMealType(e.target.value as MealType)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px'
                    }}
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
                  {truncatedDisplayName}
                </h3>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  {format(meal.date, 'EEEE, MMMM d, yyyy')}
                </p>
              </>
            )}
          </div>

          {/* Recipe Link and Favorite Checkbox */}
          {currentDish.recipeSourceUrl && !isEditing && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <a
                href={currentDish.recipeSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Recipe
              </a>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>
                <input
                  type="checkbox"
                  checked={getFavoriteId(currentDish) !== null}
                  onChange={(e) => handleFavoriteToggle(currentDish, e.target.checked)}
                  style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    cursor: 'pointer'
                  }}
                />
                Favorite
              </label>
            </div>
          )}

          {/* Ingredients */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
              Ingredients {!isEditing && !isPreparing && `(${ingredients.length})`}
              {isPreparing && ' - Select ingredients to mark as prepared'}
            </h4>
            {isEditing ? (
              <textarea
                value={editedIngredients.join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n');
                  setEditedIngredients(lines);
                }}
                placeholder="Enter ingredients, one per line&#10;Example:&#10;2 cups flour&#10;1 cup sugar&#10;3 eggs"
                style={{
                  width: '100%',
                  minHeight: '200px',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  lineHeight: '1.5'
                }}
              />
            ) : ingredients.length > 0 ? (
              <IngredientChecklist
                ingredientStatuses={ingredientStatuses}
                selectedIngredientIndices={selectedIngredientIndices}
                onToggleIngredient={toggleIngredient}
              />
            ) : (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                No ingredients listed.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: saving ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : isPreparing ? (
              <>
                <button
                  onClick={handleCancelPreparing}
                  disabled={preparing}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: preparing ? 'not-allowed' : 'pointer',
                    opacity: preparing ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPrepared}
                  disabled={preparing}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: preparing ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: preparing ? 'not-allowed' : 'pointer'
                  }}
                >
                  {preparing ? 'Preparing...' : 'Confirm Prepared'}
                </button>
              </>
            ) : (
              <>
                {!meal.completed && (
                  <button
                    onClick={handlePrepared}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Prepared
                  </button>
                )}
                <button
                  onClick={handleEdit}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: deleting ? '#9ca3af' : '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: deleting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
