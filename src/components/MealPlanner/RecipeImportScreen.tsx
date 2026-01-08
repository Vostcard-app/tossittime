/**
 * Recipe Import Screen
 * Allows users to paste recipe URL and import it
 */

import React, { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { recipeImportService, mealPlanningService } from '../../services';
import type { RecipeImportResult } from '../../types/recipeImport';
import type { MealType, PlannedMeal } from '../../types';
import { RecipeIngredientChecklist } from './RecipeIngredientChecklist';
import { showToast } from '../Toast';

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
  const [showIngredientChecklist, setShowIngredientChecklist] = useState(false);

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
      showToast('Recipe imported successfully', 'success');
    } catch (error: any) {
      console.error('Error importing recipe:', error);
      showToast(error.message || 'Failed to import recipe', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveRecipe = async () => {
    if (!user || !importedRecipe) {
      showToast('Please import a recipe first', 'error');
      return;
    }

    setSaving(true);
    try {
      // Create a planned meal from the recipe
      const plannedMeal: PlannedMeal = {
        id: `recipe-${Date.now()}`,
        date: selectedDate,
        mealType: selectedMealType,
        mealName: importedRecipe.title,
        finishBy: '18:00', // Default, can be updated later
        suggestedIngredients: selectedIngredients.length > 0 ? selectedIngredients : importedRecipe.ingredients, // Use originally selected ingredients, fallback to recipe ingredients
        usesExpiringItems: [],
        confirmed: false,
        shoppingListItems: [],
        skipped: false,
        isLeftover: false,
        recipeTitle: importedRecipe.title,
        recipeIngredients: importedRecipe.ingredients,
        recipeSourceUrl: importedRecipe.sourceUrl,
        recipeSourceDomain: importedRecipe.sourceDomain,
        recipeImageUrl: importedRecipe.imageUrl
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

      showToast('Recipe saved to meal planner successfully!', 'success');
      
      // Show ingredient checklist
      setShowIngredientChecklist(true);
    } catch (error) {
      console.error('Error saving recipe:', error);
      showToast('Failed to save recipe to meal planner. Please try again.', 'error');
      setSaving(false);
    }
  };

  const handleIngredientChecklistClose = () => {
    setShowIngredientChecklist(false);
    setSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  // If showing ingredient checklist, render that instead
  if (showIngredientChecklist && importedRecipe) {
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
            handleIngredientChecklistClose();
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
          <RecipeIngredientChecklist
            ingredients={importedRecipe.ingredients}
            onClose={handleIngredientChecklistClose}
          />
        </div>
      </div>
    );
  }

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

                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>
                    Ingredients ({importedRecipe.ingredients.length})
                  </h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                    {importedRecipe.ingredients.map((ingredient, index) => (
                      <div key={index} style={{ padding: '0.5rem', fontSize: '0.875rem' }}>
                        {ingredient}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setImportedRecipe(null);
                    setUrlInput('');
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
                  {saving ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
