/**
 * Custom Meal Ingredient Screen
 * Allows users to create custom meals with manually entered ingredients
 * Shows ingredients with checkboxes for selection before saving
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { recipeImportService, mealPlanningService, shoppingListService } from '../../services';
import type { MealType, PlannedMeal } from '../../types';
import { showToast } from '../Toast';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { IngredientChecklist } from './IngredientChecklist';

interface CustomMealIngredientScreenProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedMealType: MealType;
  ingredients: string[]; // All ingredients (selected + manually added)
}

const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

export const CustomMealIngredientScreen: React.FC<CustomMealIngredientScreenProps> = ({
  isOpen,
  onClose,
  selectedDate,
  selectedMealType,
  ingredients
}) => {
  const [user] = useAuthState(auth);
  const [saving, setSaving] = useState(false);
  const [selectedIngredientIndices, setSelectedIngredientIndices] = useState<Set<number>>(new Set());
  const [mealName, setMealName] = useState('');

  // Use the custom hook for ingredient availability
  const {
    pantryItems,
    ingredientStatuses,
    loading: loadingLists,
    userShoppingLists,
    targetListId,
    setTargetListId
  } = useIngredientAvailability(
    ingredients,
    { isOpen }
  );

  // Set default selections (only missing items selected by default)
  useEffect(() => {
    if (!ingredients || ingredients.length === 0 || selectedIngredientIndices.size > 0) return;

    const missingIndices = ingredientStatuses
      .filter(item => item.status === 'missing')
      .map(item => item.index);
    
    setSelectedIngredientIndices(new Set(missingIndices));
  }, [ingredientStatuses, ingredients, selectedIngredientIndices.size]);

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredientIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredientIndices(newSelected);
  };

  const handleSaveMeal = async () => {
    if (!user || !ingredients || ingredients.length === 0) {
      showToast('Please add at least one ingredient', 'error');
      return;
    }

    if (selectedIngredientIndices.size > 0 && !targetListId) {
      showToast('Please select a shopping list to add ingredients', 'error');
      return;
    }

    setSaving(true);
    try {
      const mealId = `custom-${Date.now()}`;
      // Use custom meal name or default to meal type label
      const finalMealName = mealName.trim() || mealTypeLabels[selectedMealType];

      // Calculate reserved quantities for this meal
      const reservedQuantities = recipeImportService.calculateMealReservedQuantities(
        ingredients,
        pantryItems
      );

      // Create a planned meal from the custom ingredients
      const plannedMeal: PlannedMeal = {
        id: mealId,
        date: selectedDate,
        mealType: selectedMealType,
        mealName: finalMealName,
        finishBy: '18:00', // Default, can be updated later
        suggestedIngredients: ingredients,
        usesExpiringItems: [],
        confirmed: false,
        shoppingListItems: [],
        skipped: false,
        isLeftover: false,
        recipeTitle: finalMealName,
        recipeIngredients: ingredients,
        // No recipeSourceUrl - this is a custom meal
        recipeSourceUrl: null,
        recipeSourceDomain: null,
        recipeImageUrl: null,
        reservedQuantities
      };

      // Get or create meal plan for this week
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() - selectedDate.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);

      let mealPlan = await mealPlanningService.getMealPlan(user.uid, weekStart);
      
      if (!mealPlan) {
        mealPlan = await mealPlanningService.createMealPlan(user.uid, weekStart, []);
      }

      // Add the custom meal to the plan
      const updatedMeals = [...mealPlan.meals, plannedMeal];
      await mealPlanningService.updateMealPlan(mealPlan.id, { meals: updatedMeals });

      // Add selected ingredients to shopping list
      const itemsToAdd = Array.from(selectedIngredientIndices)
        .map(index => ingredients[index])
        .filter(Boolean);

      if (itemsToAdd.length > 0 && targetListId) {
        for (const ingredient of itemsToAdd) {
          await shoppingListService.addShoppingListItem(
            user.uid,
            targetListId,
            ingredient,
            false,
            'custom_meal',
            mealId
          );
        }
        showToast(`Custom meal saved and ${itemsToAdd.length} ingredient(s) added to shopping list!`, 'success');
      } else {
        showToast('Custom meal saved to meal planner successfully!', 'success');
      }

      onClose(); // Close the modal after saving
    } catch (error) {
      console.error('Error saving custom meal:', error);
      showToast('Failed to save custom meal. Please try again.', 'error');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const availableCount = ingredientStatuses.filter(item => item.status === 'available' || item.status === 'partial').length;
  const missingCount = ingredientStatuses.filter(item => item.status === 'missing').length;
  const selectedForShoppingListCount = selectedIngredientIndices.size;

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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Custom Meal Ingredients</h2>
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
          {ingredients.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>No ingredients added yet.</p>
          ) : (
            <>
              {/* Meal Name Input */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>
                  Meal Name
                </label>
                <input
                  type="text"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder={`e.g., Spaghetti and meatballs (defaults to ${mealTypeLabels[selectedMealType]})`}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Ingredients with Checkboxes */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                    Ingredients ({ingredients.length})
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
                  selectedIngredientIndices={selectedIngredientIndices}
                  onToggleIngredient={toggleIngredient}
                />
              </div>

              {/* Shopping List Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                  Add selected to:
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
                  <option value="">Do not add to list</option>
                  {userShoppingLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name} {list.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
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
                  onClick={handleSaveMeal}
                  disabled={saving || (selectedIngredientIndices.size > 0 && !targetListId)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: saving || (selectedIngredientIndices.size > 0 && !targetListId) ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving || (selectedIngredientIndices.size > 0 && !targetListId) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : `Save & Add ${selectedForShoppingListCount} to List`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
