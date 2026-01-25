/**
 * Save Dish Modal
 * Modal for saving a dish with dish name, ingredient selection, shopping list, and reservation options
 */

import React, { useState, useEffect } from 'react';
import type { MealType } from '../../types';
import type { ParsedIngredient } from '../../types/recipeImport';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { parseIngredientQuantity } from '../../utils/ingredientQuantityParser';
import { showToast } from '../Toast';

interface SaveDishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    dishName: string;
    ingredients: string[];
    ingredientsToReserve: string[];
    ingredientsForShoppingList: string[];
    additionalIngredients: string[];
    targetListId: string;
    isFavorite: boolean;
  }) => Promise<void>;
  ingredients: string[];
  parsedIngredients?: ParsedIngredient[]; // AI-parsed structured ingredient data
  selectedDate: Date;
  mealType: MealType;
  recipeUrl?: string | null;
  importedRecipeTitle?: string | null;
}

export const SaveDishModal: React.FC<SaveDishModalProps> = ({
  isOpen,
  onClose,
  onSave,
  ingredients,
  parsedIngredients,
  selectedDate: _selectedDate,
  mealType: _mealType,
  recipeUrl: _recipeUrl,
  importedRecipeTitle
}) => {
  const [dishName, setDishName] = useState('');
  const [selectedForShoppingList, setSelectedForShoppingList] = useState<Set<number>>(new Set());
  const [selectedToReserve, setSelectedToReserve] = useState<Set<number>>(new Set());
  const [additionalIngredients, setAdditionalIngredients] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [saving, setSaving] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  // Combine original ingredients with additional ones
  const allIngredients = [...ingredients, ...additionalIngredients];

  // Use ingredient availability hook
  const {
    ingredientStatuses,
    loading: loadingIngredients,
    userShoppingLists,
    targetListId,
    setTargetListId
  } = useIngredientAvailability(
    allIngredients,
    { isOpen: isOpen && allIngredients.length > 0 }
  );

  // Reset state when modal closes or initialize dish name from imported recipe
  useEffect(() => {
    if (!isOpen) {
      setDishName('');
      setSelectedForShoppingList(new Set());
      setSelectedToReserve(new Set());
      setAdditionalIngredients([]);
      setNewIngredient('');
      setSaving(false);
      setIsFavorite(false);
    } else if (importedRecipeTitle && !dishName.trim()) {
      // Initialize dish name from imported recipe if available, limit to 60 characters
      const truncatedTitle = importedRecipeTitle.length > 60 
        ? importedRecipeTitle.substring(0, 60).trim()
        : importedRecipeTitle;
      setDishName(truncatedTitle);
    }
  }, [isOpen, importedRecipeTitle]);

  // No auto-selection - user must explicitly choose ingredients

  const toggleShoppingList = (index: number) => {
    const newSelected = new Set(selectedForShoppingList);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedForShoppingList(newSelected);
  };

  const toggleReserve = (index: number) => {
    const newSelected = new Set(selectedToReserve);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedToReserve(newSelected);
  };

  const handleAddIngredient = () => {
    if (!newIngredient.trim()) {
      showToast('Please enter an ingredient name', 'warning');
      return;
    }

    const trimmed = newIngredient.trim();
    if (allIngredients.includes(trimmed)) {
      showToast('This ingredient is already in the list', 'warning');
      return;
    }

    setAdditionalIngredients([...additionalIngredients, trimmed]);
    setNewIngredient('');
  };

  const handleSave = async () => {
    if (!dishName.trim()) {
      showToast('Please enter a dish name', 'error');
      return;
    }

    if (selectedForShoppingList.size > 0 && !targetListId) {
      showToast('Please select a shopping list to add ingredients', 'error');
      return;
    }

    setSaving(true);
    try {
      const ingredientsToReserve = Array.from(selectedToReserve)
        .map(index => allIngredients[index])
        .filter(Boolean);

      const ingredientsForShoppingList = Array.from(selectedForShoppingList)
        .map(index => {
          const ingredient = allIngredients[index];
          // If we have parsedIngredients, use the structured data
          if (parsedIngredients && index < parsedIngredients.length) {
            const parsed = parsedIngredients[index];
            // Reconstruct ingredient string with quantity for consistency
            let ingredientStr = '';
            if (parsed.quantity !== null && parsed.quantity !== undefined) {
              ingredientStr += parsed.quantity;
              if (parsed.unit) {
                ingredientStr += ` ${parsed.unit}`;
              }
              ingredientStr += ' ';
            }
            ingredientStr += parsed.name;
            return ingredientStr;
          }
          return ingredient;
        })
        .filter(Boolean);

      await onSave({
        dishName: dishName.trim(),
        ingredients: allIngredients,
        ingredientsToReserve,
        ingredientsForShoppingList,
        additionalIngredients,
        targetListId: targetListId || '',
        isFavorite
      });
    } catch (error) {
      console.error('Error saving dish:', error);
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1005,
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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Save Dish</h2>
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
          {/* Dish Name */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="dishName" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Dish Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              id="dishName"
              type="text"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="e.g., Homemade Tortilla Soup"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                color: '#1f2937',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Favorites Checkbox */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  cursor: 'pointer'
                }}
              />
              <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                Add to Favorites
              </span>
            </label>
          </div>

          {/* Cancel and Save Buttons */}
          <div style={{ 
            marginBottom: '1.5rem', 
            display: 'flex', 
            gap: '0.75rem', 
            justifyContent: 'flex-end' 
          }}>
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
              onClick={handleSave}
              disabled={!dishName.trim() || saving || (selectedForShoppingList.size > 0 && !targetListId)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: (!dishName.trim() || saving || (selectedForShoppingList.size > 0 && !targetListId)) ? '#9ca3af' : '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: (!dishName.trim() || saving || (selectedForShoppingList.size > 0 && !targetListId)) ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Saving...' : 'Save Dish'}
            </button>
          </div>

          {/* Ingredients List */}
          {allIngredients.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                Ingredients ({allIngredients.length})
              </h3>
              <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Select ingredients to add to list or reserve for this dish
              </p>
              
              {loadingIngredients ? (
                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>Checking ingredient availability...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {ingredientStatuses.map((item) => {
                    const ingredient = allIngredients[item.index];
                    // Use AI-parsed ingredient if available, otherwise parse manually
                    const parsedIngredient = parsedIngredients && item.index < parsedIngredients.length
                      ? parsedIngredients[item.index]
                      : null;
                    const parsed = parsedIngredient 
                      ? { itemName: parsedIngredient.name, quantity: parsedIngredient.quantity }
                      : parseIngredientQuantity(ingredient);
                    // Use parsed ingredient name as fallback display name
                    const displayName = parsed.itemName;
                    const isAvailable = item.status === 'available' || item.status === 'partial';
                    const isReserved = item.status === 'reserved' || item.isReserved === true;
                    const isMissing = item.status === 'missing';
                    const isChecked = selectedForShoppingList.has(item.index) || selectedToReserve.has(item.index);
                    
                    // Get quantity info for available items
                    const quantityText = isAvailable && item.availableQuantity > 0 && item.neededQuantity
                      ? `${item.availableQuantity} available (need ${item.neededQuantity})`
                      : isAvailable && item.availableQuantity > 0
                      ? `${item.availableQuantity} available`
                      : null;
                    
                    return (
                      <div
                        key={item.index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.75rem 1rem',
                          border: isMissing ? '2px solid #dc2626' : isReserved ? '2px solid #9ca3af' : isAvailable ? '2px solid #10b981' : '2px solid #e5e7eb',
                          borderRadius: '6px',
                          backgroundColor: isReserved ? '#f3f4f6' : '#ffffff',
                          gap: '1rem'
                        }}
                      >
                        {/* Checkbox on the left */}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            // All ingredients are checkable - user can add any to shopping list
                            if (isMissing || isReserved) {
                              toggleShoppingList(item.index);
                            } else if (isAvailable) {
                              toggleReserve(item.index);
                            }
                          }}
                          style={{
                            width: '1.25rem',
                            height: '1.25rem',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        />
                        
                        {/* Ingredient name in the center */}
                        <span style={{ 
                          flex: 1, 
                          fontSize: '1rem', 
                          fontWeight: '500', 
                          color: '#1f2937' 
                        }}>
                          {(() => {
                            // If we have parsedIngredients with formattedAmount, display it
                            if (parsedIngredient && parsedIngredient.formattedAmount && parsedIngredient.formattedAmount.trim()) {
                              const capitalizedName = parsedIngredient.name
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                .join(' ');
                              return `${parsedIngredient.formattedAmount} ${capitalizedName}`;
                            }
                            // If we have parsedIngredients but no formattedAmount, construct it from quantity/unit
                            if (parsedIngredient && parsedIngredient.name) {
                              let formattedAmount = parsedIngredient.formattedAmount;
                              if (!formattedAmount || !formattedAmount.trim()) {
                                if (parsedIngredient.quantity !== null && parsedIngredient.quantity !== undefined && parsedIngredient.unit) {
                                  const unitMap: Record<string, string> = {
                                    'cup': 'Cups', 'cups': 'Cups', 'tbsp': 'Tbsp', 'tablespoon': 'Tbsp', 'tablespoons': 'Tbsp',
                                    'tsp': 'Tsp', 'teaspoon': 'Tsp', 'teaspoons': 'Tsp',
                                    'oz': 'Oz', 'ounce': 'Oz', 'ounces': 'Oz',
                                    'lb': 'Lbs', 'lbs': 'Lbs', 'pound': 'Lbs', 'pounds': 'Lbs',
                                    'g': 'G', 'gram': 'G', 'grams': 'G',
                                    'kg': 'Kg', 'kilogram': 'Kg', 'kilograms': 'Kg',
                                    'ml': 'Ml', 'milliliter': 'Ml', 'milliliters': 'Ml',
                                    'l': 'L', 'liter': 'L', 'liters': 'L'
                                  };
                                  const capitalizedUnit = unitMap[parsedIngredient.unit.toLowerCase()] || parsedIngredient.unit.charAt(0).toUpperCase() + parsedIngredient.unit.slice(1).toLowerCase();
                                  formattedAmount = `${parsedIngredient.quantity} ${capitalizedUnit}`;
                                }
                              }
                              const capitalizedName = parsedIngredient.name
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                .join(' ');
                              return formattedAmount && formattedAmount.trim() 
                                ? `${formattedAmount} ${capitalizedName}`
                                : capitalizedName;
                            }
                            // Fallback to parsed itemName or original ingredient
                            return displayName;
                          })()}
                        </span>
                        
                        {/* Status button(s) on the right */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                          {isReserved && (
                            <button
                              disabled
                              style={{
                                padding: '0.375rem 0.75rem',
                                backgroundColor: '#f3f4f6',
                                color: '#6b7280',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'default'
                              }}
                            >
                              Reserved
                            </button>
                          )}
                          {isMissing && (
                            <button
                              disabled
                              style={{
                                padding: '0.375rem 0.75rem',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'default'
                              }}
                            >
                              Missing
                            </button>
                          )}
                          {isAvailable && (
                            <>
                              {quantityText && (
                                <button
                                  disabled
                                  style={{
                                    padding: '0.375rem 0.75rem',
                                    backgroundColor: '#d1fae5',
                                    color: '#065f46',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    cursor: 'default',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {quantityText}
                                </button>
                              )}
                              <button
                                disabled
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  backgroundColor: '#d1fae5',
                                  color: '#065f46',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  cursor: 'default'
                                }}
                              >
                                Available
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Shopping List Selection */}
          {selectedForShoppingList.size > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                Add selected to shopping list:
              </label>
              <select
                value={targetListId || ''}
                onChange={(e) => setTargetListId(e.target.value)}
                disabled={loadingIngredients}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  backgroundColor: loadingIngredients ? '#f3f4f6' : '#ffffff'
                }}
              >
                <option value="">Select a shopping list...</option>
                {userShoppingLists.map(list => (
                  <option key={list.id} value={list.id}>
                    {list.name} {list.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Add Ingredient */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Add Ingredient
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={newIngredient}
                onChange={(e) => setNewIngredient(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddIngredient();
                  }
                }}
                placeholder="Enter ingredient name"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  color: '#1f2937'
                }}
              />
              <button
                onClick={handleAddIngredient}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
