/**
 * Recipe Import Screen
 * Allows users to paste recipe URL and import it
 * Shows ingredients with checkboxes for selection before saving
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { recipeImportService, mealPlanningService, shoppingListService } from '../../services';
import type { RecipeImportResult } from '../../types/recipeImport';
import type { MealType, Dish } from '../../types';
import { isSameDay, startOfWeek } from 'date-fns';
import { showToast } from '../Toast';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { IngredientChecklist } from './IngredientChecklist';
import { parseIngredientQuantity, cleanIngredientName } from '../../utils/ingredientQuantityParser';
import { capitalizeItemName } from '../../utils/formatting';

interface RecipeImportScreenProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedMealType: MealType;
  selectedIngredients?: string[]; // Originally selected ingredients from ingredient picker
  initialRecipeUrl?: string; // Pre-populated recipe URL from ingredient picker
}

export const RecipeImportScreen: React.FC<RecipeImportScreenProps> = ({
  isOpen,
  onClose,
  selectedDate,
  selectedMealType,
  initialRecipeUrl
}) => {
  const [user] = useAuthState(auth);
  const [urlInput, setUrlInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState<RecipeImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIngredientIndices, setSelectedIngredientIndices] = useState<Set<number>>(new Set());
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [editedIngredients, setEditedIngredients] = useState<Map<number, string>>(new Map());

  // Use the custom hook for ingredient availability
  const {
    pantryItems,
    shoppingListItems,
    ingredientStatuses,
    loading: loadingLists,
    userShoppingLists,
    targetListId,
    setTargetListId
  } = useIngredientAvailability(
    importedRecipe?.ingredients || [],
    { isOpen }
  );

  // Initialize URL input from prop and auto-import if provided
  useEffect(() => {
    if (isOpen && initialRecipeUrl && initialRecipeUrl.trim() && !importedRecipe) {
      setUrlInput(initialRecipeUrl);
      // Auto-import the recipe
      const autoImport = async () => {
        if (!user) return;
        setImporting(true);
        try {
          const recipe = await recipeImportService.importRecipe(initialRecipeUrl.trim(), user.uid);
          setImportedRecipe(recipe);
          setSelectedIngredientIndices(new Set());
          showToast('Recipe imported successfully', 'success');
        } catch (error: any) {
          console.error('Error auto-importing recipe:', error);
          showToast(error.message || 'Failed to import recipe', 'error');
        } finally {
          setImporting(false);
        }
      };
      autoImport();
    } else if (isOpen && !initialRecipeUrl) {
      setUrlInput('');
    }
  }, [isOpen, initialRecipeUrl, user, importedRecipe]);

  // Reset selections when recipe is imported
  useEffect(() => {
    if (importedRecipe) {
      setSelectedIngredientIndices(new Set());
      setEditedIngredients(new Map());
    }
  }, [importedRecipe]);

  // Reset selections when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setSelectedIngredientIndices(new Set());
      setEditedIngredients(new Map());
      setImportedRecipe(null);
    } else {
      // Reset selections when modal opens
      setSelectedIngredientIndices(new Set());
    }
  }, [isOpen]);

  // No auto-selection - user must explicitly choose ingredients

  const handleImportFromUrl = async () => {
    if (!urlInput.trim()) {
      showToast('Please enter a recipe URL', 'error');
      return;
    }

    if (!user) {
      showToast('Please log in to import recipes', 'error');
      return;
    }

    setImporting(true);
    try {
      const recipe = await recipeImportService.importRecipe(urlInput.trim(), user.uid);
      setImportedRecipe(recipe);
      setSelectedIngredientIndices(new Set()); // Reset selections
      showToast('Recipe imported successfully', 'success');
    } catch (error: any) {
      console.error('Error importing recipe:', error);
      showToast(error.message || 'Failed to import recipe', 'error');
    } finally {
      setImporting(false);
    }
  };

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredientIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredientIndices(newSelected);
  };

  const startEditing = (index: number) => {
    setEditingIngredientIndex(index);
    // Initialize edited value if not already set
    if (!editedIngredients.has(index) && importedRecipe) {
      const newEdited = new Map(editedIngredients);
      newEdited.set(index, importedRecipe.ingredients[index]);
      setEditedIngredients(newEdited);
    }
  };

  const saveEdit = (_index: number) => {
    setEditingIngredientIndex(null);
  };

  const cancelEdit = (index: number) => {
    setEditingIngredientIndex(null);
    // Optionally remove the edited value to revert to original
    const newEdited = new Map(editedIngredients);
    newEdited.delete(index);
    setEditedIngredients(newEdited);
  };

  const updateEditedIngredient = (index: number, value: string) => {
    const newEdited = new Map(editedIngredients);
    newEdited.set(index, value);
    setEditedIngredients(newEdited);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit(index);
    }
  };

  const handleSaveRecipe = async () => {
    if (!user || !importedRecipe) {
      showToast('Please import a recipe first', 'error');
      return;
    }

    if (!targetListId) {
      showToast('Please select a shopping list', 'error');
      return;
    }

    setSaving(true);
    try {
      // Calculate reserved quantities for this meal
      const reservedQuantities = recipeImportService.calculateMealReservedQuantities(
        importedRecipe.ingredients,
        pantryItems
      );

      const dishId = `dish-${Date.now()}`;

      // Get or create meal plan for this week
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      weekStart.setHours(0, 0, 0, 0);

      let mealPlan = await mealPlanningService.getMealPlan(user.uid, weekStart);
      
      if (!mealPlan) {
        mealPlan = await mealPlanningService.createMealPlan(user.uid, weekStart, []);
      }

      // Get or create PlannedMeal for this date and meal type
      let plannedMeal = mealPlan.meals.find(
        m => isSameDay(m.date, selectedDate) && m.mealType === selectedMealType
      );

      if (!plannedMeal) {
        const mealId = `meal-${Date.now()}`;
        plannedMeal = {
          id: mealId,
          date: selectedDate,
          mealType: selectedMealType,
          finishBy: '18:00',
          confirmed: false,
          skipped: false,
          isLeftover: false,
          dishes: []
        };
      }

      // Claim items from dashboard/pantry for this dish
      const claimedItemIds = await recipeImportService.claimItemsForMeal(
        user.uid,
        dishId,
        importedRecipe.ingredients,
        pantryItems,
        reservedQuantities
      );

      // Claim existing shopping list items for this dish
      const claimedShoppingListItemIds = await recipeImportService.claimShoppingListItemsForMeal(
        user.uid,
        dishId,
        importedRecipe.ingredients,
        shoppingListItems
      );

      // Add selected ingredients to shopping list and track their IDs
      // Use edited ingredient if available, otherwise use original
      const selectedItems = Array.from(selectedIngredientIndices)
        .map(index => editedIngredients.get(index) || importedRecipe.ingredients[index])
        .filter(Boolean);

      const newlyAddedItemIds: string[] = [];
      if (selectedItems.length > 0) {
        for (const ingredient of selectedItems) {
          // Try to use AI-parsed ingredient data if available
          const ingredientIndex = importedRecipe.ingredients.indexOf(ingredient);
          const parsedIngredient = importedRecipe.parsedIngredients && ingredientIndex >= 0 
            ? importedRecipe.parsedIngredients[ingredientIndex]
            : null;
          
          let itemName: string;
          let quantity: number | undefined;
          
          if (parsedIngredient) {
            // Use AI-parsed data - capitalize the name
            itemName = capitalizeItemName(parsedIngredient.name);
            quantity = parsedIngredient.quantity ?? undefined;
          } else {
            // Fallback to manual parsing
            const parsed = parseIngredientQuantity(ingredient);
            const cleanedName = cleanIngredientName(parsed.itemName);
            itemName = capitalizeItemName(cleanedName);
            quantity = parsed.quantity ?? undefined;
          }
          
          const itemId = await shoppingListService.addShoppingListItem(
            user.uid,
            targetListId,
            itemName,
            false,
            'recipe_import',
            dishId,
            quantity
          );
          newlyAddedItemIds.push(itemId);
        }
      }

      // Combine claimed and newly added shopping list item IDs
      const allClaimedShoppingListItemIds = [...claimedShoppingListItemIds, ...newlyAddedItemIds];

      // Create the dish
      const dish: Dish = {
        id: dishId,
        dishName: importedRecipe.title,
        recipeTitle: importedRecipe.title,
        recipeIngredients: importedRecipe.ingredients,
        recipeSourceUrl: importedRecipe.sourceUrl || null,
        recipeSourceDomain: importedRecipe.sourceDomain || null,
        recipeImageUrl: importedRecipe.imageUrl || null,
        reservedQuantities,
        claimedItemIds,
        claimedShoppingListItemIds: allClaimedShoppingListItemIds,
        completed: false
      };

      // Add dish to PlannedMeal
      const updatedDishes = [...(plannedMeal.dishes || []), dish];
      plannedMeal.dishes = updatedDishes;

      // Update or add PlannedMeal to meal plan
      const mealIndex = mealPlan.meals.findIndex(m => m.id === plannedMeal!.id);
      if (mealIndex >= 0) {
        mealPlan.meals[mealIndex] = plannedMeal;
      } else {
        mealPlan.meals.push(plannedMeal);
      }

      await mealPlanningService.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });

      if (selectedItems.length > 0) {
        showToast(`Recipe saved and ${selectedItems.length} ingredient(s) added to shopping list!`, 'success');
      } else {
        showToast('Recipe saved to meal planner successfully!', 'success');
      }

      // Close the modal
      onClose();
    } catch (error) {
      console.error('Error saving recipe:', error);
      showToast('Failed to save recipe to meal planner. Please try again.', 'error');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const availableCount = ingredientStatuses.filter(item => item.status === 'available' || item.status === 'partial').length;
  const missingCount = ingredientStatuses.filter(item => item.status === 'missing').length;

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
        zIndex: 1002,
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
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Plan from URL</h2>
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
          {!importedRecipe ? (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Paste Recipe URL:
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/recipe"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleImportFromUrl();
                    }
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
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
                  Cancel
                </button>
                <button
                  onClick={handleImportFromUrl}
                  disabled={importing || !urlInput.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: importing || !urlInput.trim() ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: importing || !urlInput.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {importing ? 'Importing...' : 'Import Recipe'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Recipe Preview */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
                  {importedRecipe.title}
                </h3>

                {importedRecipe.imageUrl && (
                  <img
                    src={importedRecipe.imageUrl}
                    alt={importedRecipe.title}
                    style={{
                      width: '100%',
                      maxHeight: '200px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      marginBottom: '1rem'
                    }}
                  />
                )}

                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem', color: '#6b7280' }}>
                  Recipe from{' '}
                  <a
                    href={importedRecipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#002B4D', textDecoration: 'underline' }}
                  >
                    {importedRecipe.sourceDomain}
                  </a>
                </div>

                {/* Shopping List Selection */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                    Select Shopping List:
                  </label>
                  <select
                    value={targetListId || ''}
                    onChange={(e) => setTargetListId(e.target.value)}
                    disabled={loadingLists}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      backgroundColor: loadingLists ? '#f3f4f6' : '#ffffff'
                    }}
                  >
                    <option value="">Select a list...</option>
                    {userShoppingLists.map(list => (
                      <option key={list.id} value={list.id}>
                        {list.name} {list.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ingredients with Checkboxes */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                      Ingredients ({importedRecipe.ingredients.length})
                    </h4>
                    {ingredientStatuses.length > 0 && (
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        <span style={{ color: '#059669', marginRight: '0.5rem' }}>In Dashboard: {availableCount}</span>
                        <span style={{ color: '#dc2626' }}>Missing: {missingCount}</span>
                      </div>
                    )}
                  </div>
                  <IngredientChecklist
                    ingredientStatuses={ingredientStatuses}
                    parsedIngredients={importedRecipe?.parsedIngredients}
                    selectedIngredientIndices={selectedIngredientIndices}
                    onToggleIngredient={toggleIngredient}
                    editingIngredientIndex={editingIngredientIndex}
                    editedIngredients={editedIngredients}
                    onStartEditing={startEditing}
                    onSaveEdit={saveEdit}
                    onUpdateEditedIngredient={updateEditedIngredient}
                    onEditKeyDown={handleEditKeyDown}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setImportedRecipe(null);
                    setUrlInput('');
                    setSelectedIngredientIndices(new Set());
                  }}
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
                  Back
                </button>
                <button
                  onClick={handleSaveRecipe}
                  disabled={saving || !targetListId}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: saving || !targetListId ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving || !targetListId ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : `Save & Add ${selectedIngredientIndices.size} to List`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
