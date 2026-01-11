/**
 * Meal Detail Modal
 * Displays meal information with recipe link, ingredients, edit and delete functionality
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { mealPlanningService, shoppingListService, foodItemService, recipeImportService } from '../../services';
import type { PlannedMeal, MealType } from '../../types';
import { showToast } from '../Toast';
import { format } from 'date-fns';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { IngredientChecklist } from './IngredientChecklist';
import { fuzzyMatchIngredientToItem } from '../../utils/fuzzyIngredientMatcher';

interface MealDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  meal: PlannedMeal | null;
  onMealDeleted?: () => void; // Callback to refresh calendar
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

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
  meal,
  onMealDeleted
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

  const ingredients = meal?.recipeIngredients || meal?.suggestedIngredients || [];

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

  if (!isOpen || !meal) return null;

  // Initialize edit state when meal changes
  useEffect(() => {
    if (meal) {
      setEditedMealName(meal.recipeTitle || meal.mealName);
      setEditedDate(format(meal.date, 'yyyy-MM-dd'));
      setEditedMealType(meal.mealType);
      setEditedIngredients(meal.recipeIngredients || meal.suggestedIngredients || []);
      setSelectedIngredientIndices(new Set()); // Reset selections
      setIsPreparing(false); // Reset preparing state
    }
  }, [meal]);

  // Note: Real-time subscriptions are handled by useIngredientAvailability hook
  // The hook subscribes to food items and loads shopping list items
  // ingredientStatuses will automatically update when pantry items or shopping list items change

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset to original values
    if (meal) {
      setEditedMealName(meal.recipeTitle || meal.mealName);
      setEditedDate(format(meal.date, 'yyyy-MM-dd'));
      setEditedMealType(meal.mealType);
      setEditedIngredients(meal.recipeIngredients || meal.suggestedIngredients || []);
    }
  };

  const handleCancelPreparing = () => {
    setIsPreparing(false);
    setSelectedIngredientIndices(new Set()); // Reset selections
  };

  const handleSave = async () => {
    if (!user || !meal) {
      showToast('Please log in to edit meals', 'error');
      return;
    }

    if (!editedMealName.trim()) {
      showToast('Meal name is required', 'error');
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

      // Get current shopping list items for this meal
      const currentShoppingListItems = shoppingListItems.filter(item => item.mealId === meal.id);
      
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
            'meal_edit',
            meal.id
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
      
      // Update usedByMeals for matching items
      for (const itemId of matchingItemIds) {
        const item = pantryItems.find(p => p.id === itemId);
        if (item) {
          const currentUsedByMeals = item.usedByMeals || [];
          const updatedUsedByMeals = currentUsedByMeals.includes(meal.id)
            ? currentUsedByMeals
            : [...currentUsedByMeals, meal.id];
          await foodItemService.updateFoodItemUsedByMeals(user.uid, itemId, updatedUsedByMeals);
        }
      }
      
      // Remove mealId from items that no longer match
      const allItemIds = pantryItems.map(item => item.id);
      for (const itemId of allItemIds) {
        if (!matchingItemIds.includes(itemId)) {
          const item = pantryItems.find(p => p.id === itemId);
          if (item && item.usedByMeals?.includes(meal.id)) {
            const updatedUsedByMeals = item.usedByMeals.filter(id => id !== meal.id);
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

      // Create updated meal object
      const updatedMeal = {
        ...meal,
        mealName: editedMealName.trim(),
        recipeTitle: meal.recipeSourceUrl ? editedMealName.trim() : undefined,
        date: newDate,
        mealType: editedMealType,
        recipeIngredients: parsedIngredients,
        suggestedIngredients: parsedIngredients,
        reservedQuantities: newReservedQuantities
      };

      if (weekChanged) {
        // Remove meal from old week's meal plan
        const oldMeals = oldMealPlan.meals.filter(m => m.id !== meal.id);
        await mealPlanningService.updateMealPlan(oldMealPlan.id, { meals: oldMeals });

        // Get or create new week's meal plan
        let newMealPlan = await mealPlanningService.getMealPlan(user.uid, newWeekStart);
        
        if (!newMealPlan) {
          // Create a new empty meal plan for the new week
          newMealPlan = await mealPlanningService.createEmptyMealPlan(user.uid, newWeekStart);
        }
        
        // Add meal to new week's meal plan (whether it existed or was just created)
        const newMeals = [...newMealPlan.meals, updatedMeal];
        await mealPlanningService.updateMealPlan(newMealPlan.id, { meals: newMeals });
      } else {
        // Same week - just update the meal in place
        const updatedMeals = oldMealPlan.meals.map(m => 
          m.id === meal.id ? updatedMeal : m
        );
        await mealPlanningService.updateMealPlan(oldMealPlan.id, { meals: updatedMeals });
      }

      showToast('Meal updated successfully', 'success');
      setIsEditing(false);
      onMealDeleted?.(); // Refresh calendar
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

    if (!window.confirm(`Are you sure you want to delete "${meal.recipeTitle || meal.mealName}"? This will also remove associated ingredients from your shopping list.`)) {
      return;
    }

    setDeleting(true);
    try {
      // Delete all shopping list items associated with this meal
      await shoppingListService.deleteShoppingListItemsByMealId(user.uid, meal.id);

      // Find the meal plan for the meal's date week
      const mealDate = new Date(meal.date);
      const mealWeekStart = new Date(mealDate);
      mealWeekStart.setDate(mealDate.getDate() - mealDate.getDay()); // Start of week (Sunday)
      mealWeekStart.setHours(0, 0, 0, 0);
      
      const mealPlan = await mealPlanningService.getMealPlan(user.uid, mealWeekStart);
      
      if (mealPlan) {
        const mealExists = mealPlan.meals.some(m => m.id === meal.id);
        
        if (mealExists) {
          // Remove the meal from the plan
          const updatedMeals = mealPlan.meals.filter(m => m.id !== meal.id);
          await mealPlanningService.updateMealPlan(mealPlan.id, { meals: updatedMeals });
        } else {
          console.warn('Meal not found in meal plan for its date week');
        }
      } else {
        console.warn('Meal plan not found for meal date week');
      }

      showToast('Meal deleted successfully', 'success');
      onMealDeleted?.(); // Refresh calendar
      onClose();
    } catch (error) {
      console.error('Error deleting meal:', error);
      showToast('Failed to delete meal. Please try again.', 'error');
      setDeleting(false);
    }
  };

  const displayName = meal.recipeTitle || meal.mealName;
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
    const allIndices = new Set(ingredients.map((_, index) => index));
    setSelectedIngredientIndices(allIndices);
  };

  const handleConfirmPrepared = async () => {
    if (!user || !meal) {
      showToast('Please log in to mark meals as prepared', 'error');
      return;
    }

    if (selectedIngredientIndices.size === 0) {
      showToast('Please select at least one ingredient to mark as prepared', 'error');
      return;
    }

    setPreparing(true);
    try {
      // Get checked ingredients
      const checkedIngredients = ingredients.filter((_, index) => 
        selectedIngredientIndices.has(index)
      );

      // Delete claimed shopping list items that match checked ingredients
      if (meal.claimedShoppingListItemIds && meal.claimedShoppingListItemIds.length > 0) {
        const claimedShoppingItems = shoppingListItems.filter(item => 
          meal.claimedShoppingListItemIds!.includes(item.id)
        );

        for (const shoppingItem of claimedShoppingItems) {
          // Check if this shopping list item matches any checked ingredient
          const matchesCheckedIngredient = checkedIngredients.some(ingredient =>
            fuzzyMatchIngredientToItem(ingredient, shoppingItem.name)
          );
          if (matchesCheckedIngredient) {
            await shoppingListService.deleteShoppingListItem(shoppingItem.id);
          }
        }
      }

      // Process claimed dashboard items that match checked ingredients
      if (meal.claimedItemIds && meal.claimedItemIds.length > 0) {
        const claimedItems = pantryItems.filter(item => 
          meal.claimedItemIds!.includes(item.id)
        );

        // Filter to only items that match checked ingredients
        const itemsToProcess: string[] = [];
        const reservedQuantitiesForChecked: Record<string, number> = {};

        for (const item of claimedItems) {
          // Check if this item matches any checked ingredient
          const matchesCheckedIngredient = checkedIngredients.some(ingredient =>
            fuzzyMatchIngredientToItem(ingredient, item.name)
          );
          
          if (matchesCheckedIngredient) {
            itemsToProcess.push(item.id);
            // Get reserved quantity for this item
            const normalizedName = item.name.toLowerCase().trim();
            if (meal.reservedQuantities?.[normalizedName]) {
              reservedQuantitiesForChecked[normalizedName] = meal.reservedQuantities[normalizedName];
            }
          }
        }

        // Reduce quantities and remove mealId from usedByMeals for checked ingredients only
        if (itemsToProcess.length > 0 && Object.keys(reservedQuantitiesForChecked).length > 0) {
          await foodItemService.markItemsAsUsedForMeal(
            user.uid,
            meal.id,
            itemsToProcess,
            reservedQuantitiesForChecked
          );
        }
      }

      // Mark meal as completed
      const weekStart = new Date(meal.date);
      weekStart.setDate(meal.date.getDate() - meal.date.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const mealPlan = await mealPlanningService.getMealPlan(user.uid, weekStart);
      if (mealPlan) {
        const updatedMeals = mealPlan.meals.map(m => 
          m.id === meal.id ? { ...m, completed: true } : m
        );
        await mealPlanningService.updateMealPlan(mealPlan.id, { meals: updatedMeals });
      }

      showToast('Meal marked as prepared!', 'success');
      onMealDeleted?.(); // Refresh calendar
      onClose();
    } catch (error) {
      console.error('Error marking meal as prepared:', error);
      showToast('Failed to mark meal as prepared. Please try again.', 'error');
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
              {MEAL_TYPE_LABELS[meal.mealType]}
            </h2>
            {meal.completed && (
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

          {/* Recipe Link */}
          {meal.recipeSourceUrl && !isEditing && (
            <div style={{ marginBottom: '1.5rem' }}>
              <a
                href={meal.recipeSourceUrl}
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
