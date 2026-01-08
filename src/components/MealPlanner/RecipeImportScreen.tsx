/**
 * Recipe Import Screen
 * Allows users to paste recipe URL and import it
 * Shows ingredients with checkboxes for selection before saving
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { recipeImportService, mealPlanningService, foodItemService, shoppingListService, shoppingListsService } from '../../services';
import type { RecipeImportResult } from '../../types/recipeImport';
import type { MealType, PlannedMeal, FoodItem } from '../../types';
import { showToast } from '../Toast';
import { startOfWeek, addDays } from 'date-fns';

interface RecipeImportScreenProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedMealType: MealType;
  selectedIngredients?: string[]; // Originally selected ingredients from ingredient picker
}

export const RecipeImportScreen: React.FC<RecipeImportScreenProps> = ({
  isOpen,
  onClose,
  selectedDate,
  selectedMealType,
  selectedIngredients = []
}) => {
  const [user] = useAuthState(auth);
  const [urlInput, setUrlInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState<RecipeImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [pantryItems, setPantryItems] = useState<FoodItem[]>([]);
  const [selectedIngredientIndices, setSelectedIngredientIndices] = useState<Set<number>>(new Set());
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [userShoppingLists, setUserShoppingLists] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [shoppingListItems, setShoppingListItems] = useState<any[]>([]);
  const [reservedQuantitiesMap, setReservedQuantitiesMap] = useState<Record<string, number>>({});

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
        setLoadingLists(true);
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
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const allMeals: PlannedMeal[] = [];
        let weekStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        while (weekStart <= monthEnd) {
          const plan = await mealPlanningService.getMealPlan(user.uid, weekStart);
          if (plan) {
            allMeals.push(...plan.meals);
          }
          weekStart = addDays(weekStart, 7);
        }
        
        // Calculate reserved quantities (excluding the current meal being edited)
        const reservedMap = recipeImportService.calculateReservedQuantities(allMeals, pantryItems);
        setReservedQuantitiesMap(reservedMap);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoadingLists(false);
      }
    };

    loadData();
  }, [user, isOpen, pantryItems]);

  // Check ingredient availability against pantry items (excluding shopping list items and reserved quantities)
  const ingredientStatuses = useMemo(() => {
    if (!importedRecipe) return [];
    
    return importedRecipe.ingredients.map((ingredient, index) => {
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
  }, [importedRecipe, pantryItems, shoppingListItems, reservedQuantitiesMap]);

  // Set default selections (only missing items selected by default)
  useEffect(() => {
    if (!importedRecipe || selectedIngredientIndices.size > 0) return;

    const missingIndices = ingredientStatuses
      .filter(item => item.status === 'missing')
      .map(item => item.index);
    
    setSelectedIngredientIndices(new Set(missingIndices));
  }, [ingredientStatuses, importedRecipe]);

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
      const recipe = await recipeImportService.importRecipe(urlInput.trim());
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

      // Create a planned meal from the recipe
      const plannedMeal: PlannedMeal = {
        id: `recipe-${Date.now()}`,
        date: selectedDate,
        mealType: selectedMealType,
        mealName: importedRecipe.title,
        finishBy: '18:00', // Default, can be updated later
        suggestedIngredients: selectedIngredients.length > 0 ? selectedIngredients : importedRecipe.ingredients,
        usesExpiringItems: [],
        confirmed: false,
        shoppingListItems: [],
        skipped: false,
        isLeftover: false,
        recipeTitle: importedRecipe.title,
        recipeIngredients: importedRecipe.ingredients,
        recipeSourceUrl: importedRecipe.sourceUrl,
        recipeSourceDomain: importedRecipe.sourceDomain,
        recipeImageUrl: importedRecipe.imageUrl,
        reservedQuantities
      };

      // Get or create meal plan for this week
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() - selectedDate.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);

      let mealPlan = await mealPlanningService.getMealPlan(user.uid, weekStart);
      
      if (!mealPlan) {
        // Create new meal plan with just this recipe meal
        mealPlan = await mealPlanningService.createMealPlan(user.uid, weekStart, []);
      }

      // Add the recipe meal to the plan
      const updatedMeals = [...mealPlan.meals, plannedMeal];
      await mealPlanningService.updateMealPlan(mealPlan.id, { meals: updatedMeals });

      // Add selected ingredients to shopping list
      const selectedItems = Array.from(selectedIngredientIndices)
        .map(index => importedRecipe.ingredients[index])
        .filter(Boolean);

      if (selectedItems.length > 0) {
        for (const ingredient of selectedItems) {
          await shoppingListService.addShoppingListItem(
            user.uid,
            targetListId,
            ingredient,
            false,
            'recipe_import',
            plannedMeal.id
          );
        }
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
                  <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                    {ingredientStatuses.map(({ ingredient, index, status, count, availableQuantity, neededQuantity }) => {
                      const isAvailable = status === 'available' || status === 'partial';
                      const backgroundColor = isAvailable 
                        ? (selectedIngredientIndices.has(index) ? '#d1fae5' : '#ecfdf5')
                        : (selectedIngredientIndices.has(index) ? '#fee2e2' : '#fef2f2');
                      const borderColor = isAvailable ? '#10b981' : '#ef4444';
                      const badgeBg = isAvailable ? '#10b981' : '#ef4444';

                      return (
                        <label
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            marginBottom: '0.25rem',
                            backgroundColor,
                            border: `2px solid ${borderColor}`,
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (isAvailable) {
                              e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#a7f3d0' : '#d1fae5';
                            } else {
                              e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#fecaca' : '#fee2e2';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isAvailable) {
                              e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#d1fae5' : '#ecfdf5';
                            } else {
                              e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#fee2e2' : '#fef2f2';
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIngredientIndices.has(index)}
                            onChange={() => toggleIngredient(index)}
                            style={{
                              marginRight: '0.75rem',
                              width: '1.25rem',
                              height: '1.25rem',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ flex: 1, fontSize: '0.875rem', color: '#1f2937' }}>{ingredient}</span>
                          {isAvailable && count > 0 && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontWeight: '600',
                                backgroundColor: badgeBg,
                                color: '#ffffff',
                                marginRight: '0.5rem'
                              }}
                            >
                              {neededQuantity !== null && availableQuantity !== undefined
                                ? `${availableQuantity} available (need ${neededQuantity})`
                                : `${count} in dashboard`}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontWeight: '500',
                              backgroundColor: badgeBg,
                              color: '#ffffff'
                            }}
                          >
                            {isAvailable ? (status === 'partial' ? 'Partial' : 'Available') : 'Missing'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
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
