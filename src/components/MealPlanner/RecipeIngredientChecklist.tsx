/**
 * Recipe Ingredient Checklist Component
 * Displays ALL recipe ingredients with pantry matching and shopping list integration
 * Shows dashboard cross-reference with counts and highlighting
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { foodItemService } from '../../services';
import { recipeImportService } from '../../services';
import { shoppingListService, shoppingListsService } from '../../services';
import type { FoodItem } from '../../types';
import type { ParsedIngredient } from '../../types/recipeImport';
import { showToast } from '../Toast';
import { parseIngredientQuantity, cleanIngredientName } from '../../utils/ingredientQuantityParser';
import { capitalizeItemName } from '../../utils/formatting';

interface RecipeIngredientChecklistProps {
  ingredients: string[];
  parsedIngredients?: ParsedIngredient[]; // AI-parsed ingredients for premium users
  mealId?: string;
  onClose: () => void;
}

interface IngredientStatus {
  ingredient: string;
  index: number;
  status: 'available' | 'missing' | 'partial' | 'reserved';
  matchingItems: FoodItem[];
  count: number;
}

export const RecipeIngredientChecklist: React.FC<RecipeIngredientChecklistProps> = ({
  ingredients,
  parsedIngredients,
  mealId,
  onClose
}) => {
  const [user] = useAuthState(auth);
  const [pantryItems, setPantryItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());
  const [addingToShoppingList, setAddingToShoppingList] = useState(false);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [userShoppingLists, setUserShoppingLists] = useState<any[]>([]);
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [editedIngredients, setEditedIngredients] = useState<Map<number, string>>(new Map());

  // Load pantry items (dashboard items)
  useEffect(() => {
    if (!user) return;

    const unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
      setPantryItems(items);
    });

    return () => unsubscribe();
  }, [user]);

  // Load shopping lists and default shop list items
  useEffect(() => {
    if (!user) return;

    const loadShoppingLists = async () => {
      try {
        const lists = await shoppingListsService.getShoppingLists(user.uid);
        setUserShoppingLists(lists);
        
        // Set default list
        const defaultList = lists.find(list => list.isDefault) || lists[0];
        if (defaultList) {
          setTargetListId(defaultList.id);
          
          // Shop list items are not needed for cross-reference (only pantry items are checked)
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading shopping lists:', error);
        setLoading(false);
      }
    };

    loadShoppingLists();
  }, [user]);

  // Check ingredient availability against pantry items (dashboard)
  // Show ALL ingredients with their status and matching counts
  const ingredientStatuses = useMemo<IngredientStatus[]>(() => {
    return ingredients.map((ingredient, index) => {
      // Check against pantry items only (dashboard items)
      const matchResult = recipeImportService.checkIngredientAvailabilityDetailed(ingredient, pantryItems);
      
      return {
        ingredient,
        index,
        status: matchResult.status,
        matchingItems: matchResult.matchingItems,
        count: matchResult.count
      };
    });
  }, [ingredients, pantryItems]);

  // No auto-selection - user must explicitly choose ingredients

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredients);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredients(newSelected);
  };

  const startEditing = (index: number) => {
    setEditingIngredientIndex(index);
    // Initialize edited value if not already set
    if (!editedIngredients.has(index)) {
      const newEdited = new Map(editedIngredients);
      newEdited.set(index, ingredients[index]);
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

  const handleAddToShoppingList = async () => {
    if (!user || !targetListId) {
      showToast('Please select a shopping list', 'error');
      return;
    }

    const selectedItems = Array.from(selectedIngredients)
      .map(index => {
        // Use edited ingredient if available, otherwise use original
        return editedIngredients.get(index) || ingredients[index];
      })
      .filter(Boolean);

    if (selectedItems.length === 0) {
      showToast('Please select at least one ingredient', 'error');
      return;
    }

    setAddingToShoppingList(true);

    try {
      // Add each selected ingredient to the shopping list
      for (const ingredient of selectedItems) {
        // Parse the ingredient to extract quantity and clean the name
        const parsed = parseIngredientQuantity(ingredient);
        
        // Clean the item name (remove descriptors and duplicates)
        const cleanedName = cleanIngredientName(parsed.itemName);
        
        // Capitalize the cleaned name
        const capitalizedName = capitalizeItemName(cleanedName);
        
        // Use the parsed quantity, defaulting to 1 if no quantity was found
        const quantity = parsed.quantity ?? 1;
        
        await shoppingListService.addShoppingListItem(
          user.uid,
          targetListId,
          capitalizedName,
          false,
          'recipe_import',
          mealId,
          quantity
        );
      }

      showToast(`Added ${selectedItems.length} ingredient(s) to shopping list`, 'success');
      onClose();
    } catch (error) {
      console.error('Error adding ingredients to shopping list:', error);
      showToast('Failed to add ingredients to shopping list', 'error');
    } finally {
      setAddingToShoppingList(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading pantry items...</p>
      </div>
    );
  }

  const availableCount = ingredientStatuses.filter(item => item.status === 'available' || item.status === 'partial').length;
  const missingCount = ingredientStatuses.filter(item => item.status === 'missing').length;
  const reservedCount = ingredientStatuses.filter(item => item.status === 'reserved').length;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.5rem', fontWeight: '600' }}>
        Add Ingredients to Shopping List
      </h2>

      {/* Summary */}
      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '0.75rem', 
        backgroundColor: '#f0f8ff', 
        borderRadius: '6px',
        fontSize: '0.875rem',
        color: '#1f2937'
      }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span>
            <strong>Total:</strong> {ingredients.length} ingredients
          </span>
          <span style={{ color: '#059669' }}>
            <strong>In Dashboard:</strong> {availableCount}
          </span>
          {reservedCount > 0 && (
            <span style={{ color: '#6b7280' }}>
              <strong>Reserved:</strong> {reservedCount}
            </span>
          )}
          <span style={{ color: '#dc2626' }}>
            <strong>Missing:</strong> {missingCount}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Select Shopping List:
        </label>
        <select
          value={targetListId || ''}
          onChange={(e) => setTargetListId(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem'
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

      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
          Select ingredients to add to your shopping list. Items in your dashboard are highlighted in green with counts.
        </p>
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
          {ingredientStatuses.map(({ ingredient, index, status, count }) => {
            // Determine styling based on status
            const isAvailable = status === 'available' || status === 'partial';
            const isReserved = status === 'reserved';
            
            let backgroundColor, borderColor, badgeBg, badgeText;
            if (isReserved) {
              backgroundColor = selectedIngredients.has(index) ? '#d1d5db' : '#f3f4f6';
              borderColor = '#9ca3af';
              badgeBg = '#9ca3af';
              badgeText = '#ffffff';
            } else if (isAvailable) {
              backgroundColor = selectedIngredients.has(index) ? '#d1fae5' : '#ecfdf5';
              borderColor = '#10b981';
              badgeBg = '#10b981';
              badgeText = '#ffffff';
            } else {
              backgroundColor = selectedIngredients.has(index) ? '#fee2e2' : '#fef2f2';
              borderColor = '#ef4444';
              badgeBg = '#ef4444';
              badgeText = '#ffffff';
            }

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
                  if (isReserved) {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#9ca3af' : '#e5e7eb';
                  } else if (isAvailable) {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#a7f3d0' : '#d1fae5';
                  } else {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#fecaca' : '#fee2e2';
                  }
                }}
                onMouseLeave={(e) => {
                  if (isReserved) {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#d1d5db' : '#f3f4f6';
                  } else if (isAvailable) {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#d1fae5' : '#ecfdf5';
                  } else {
                    e.currentTarget.style.backgroundColor = selectedIngredients.has(index) ? '#fee2e2' : '#fef2f2';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIngredients.has(index)}
                  onChange={() => toggleIngredient(index)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginRight: '0.75rem',
                    width: '1.25rem',
                    height: '1.25rem',
                    cursor: 'pointer'
                  }}
                />
                {editingIngredientIndex === index ? (
                  <input
                    type="text"
                    value={editedIngredients.get(index) || ingredient}
                    onChange={(e) => updateEditedIngredient(index, e.target.value)}
                    onBlur={() => saveEdit(index)}
                    onKeyDown={(e) => handleEditKeyDown(e, index)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '2px solid #002B4D',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      outline: 'none',
                      marginRight: '0.5rem'
                    }}
                  />
                ) : (
                  <span 
                    style={{ 
                      flex: 1, 
                      fontSize: '1rem', 
                      color: '#1f2937',
                      cursor: 'text',
                      padding: '0.25rem',
                      borderRadius: '4px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(index);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="Click to edit"
                  >
                    {(() => {
                      // If edited, use edited value
                      if (editedIngredients.has(index)) {
                        return editedIngredients.get(index);
                      }
                      // If premium user with parsed data, display formatted
                      if (parsedIngredients && parsedIngredients[index]) {
                        const parsed = parsedIngredients[index];
                        if (parsed.name) {
                          // Capitalize the ingredient name
                          const capitalizedName = parsed.name
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                          // Show formatted amount if available (not empty), otherwise just the name
                          return parsed.formattedAmount && parsed.formattedAmount.trim() 
                            ? `${parsed.formattedAmount} ${capitalizedName}`
                            : capitalizedName;
                        }
                      }
                      // Fallback to original ingredient string
                      return ingredient;
                    })()}
                  </span>
                )}
                {isAvailable && count > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      fontWeight: '600',
                      backgroundColor: badgeBg,
                      color: badgeText,
                      marginRight: '0.5rem'
                    }}
                  >
                    {count} in dashboard
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.875rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontWeight: '500',
                    backgroundColor: badgeBg,
                    color: badgeText
                  }}
                >
                  {isReserved ? 'Reserved' : isAvailable ? (status === 'partial' ? 'Partial Match' : 'Available') : 'Missing'}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          disabled={addingToShoppingList}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: addingToShoppingList ? 'not-allowed' : 'pointer',
            opacity: addingToShoppingList ? 0.5 : 1
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleAddToShoppingList}
          disabled={addingToShoppingList || !targetListId || selectedIngredients.size === 0}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: addingToShoppingList || !targetListId || selectedIngredients.size === 0 ? '#9ca3af' : '#002B4D',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: addingToShoppingList || !targetListId || selectedIngredients.size === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {addingToShoppingList ? 'Adding...' : `Add ${selectedIngredients.size} Item(s)`}
        </button>
      </div>
    </div>
  );
};
