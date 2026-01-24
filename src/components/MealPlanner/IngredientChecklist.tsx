/**
 * Reusable Ingredient Checklist Component
 * Displays ingredients with availability status and checkboxes
 */

import React from 'react';
import type { IngredientStatus } from '../../hooks/useIngredientAvailability';
import type { ParsedIngredient } from '../../types/recipeImport';
import { parseIngredientQuantity } from '../../utils/ingredientQuantityParser';

interface IngredientChecklistProps {
  ingredientStatuses: IngredientStatus[];
  parsedIngredients?: ParsedIngredient[]; // AI-parsed ingredients for premium users
  selectedIngredientIndices: Set<number>;
  onToggleIngredient: (index: number) => void;
  editingIngredientIndex?: number | null;
  editedIngredients?: Map<number, string>;
  onStartEditing?: (index: number) => void;
  onSaveEdit?: (index: number) => void;
  onUpdateEditedIngredient?: (index: number, value: string) => void;
  onEditKeyDown?: (e: React.KeyboardEvent, index: number) => void;
}

export const IngredientChecklist: React.FC<IngredientChecklistProps> = ({
  ingredientStatuses,
  parsedIngredients,
  selectedIngredientIndices,
  onToggleIngredient,
  editingIngredientIndex = null,
  editedIngredients = new Map(),
  onStartEditing,
  onSaveEdit,
  onUpdateEditedIngredient,
  onEditKeyDown
}) => {
  if (ingredientStatuses.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
        No ingredients to display.
      </div>
    );
  }

  return (
    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
      {ingredientStatuses.map(({ ingredient, index, status, count, availableQuantity, neededQuantity, isReserved }) => {
        const isAvailable = status === 'available' || status === 'partial';
        const isReservedStatus = status === 'reserved' || isReserved === true;
        
        // Determine colors: green for available, grey for reserved, red for missing
        let backgroundColor, borderColor, badgeBg, badgeText;
        if (isReservedStatus) {
          backgroundColor = selectedIngredientIndices.has(index) ? '#d1d5db' : '#f3f4f6';
          borderColor = '#9ca3af';
          badgeBg = '#9ca3af';
          badgeText = 'Reserved';
        } else if (isAvailable) {
          backgroundColor = selectedIngredientIndices.has(index) ? '#d1fae5' : '#ecfdf5';
          borderColor = '#10b981';
          badgeBg = '#10b981';
          badgeText = status === 'partial' ? 'Partial' : 'Available';
        } else {
          backgroundColor = selectedIngredientIndices.has(index) ? '#fee2e2' : '#fef2f2';
          borderColor = '#ef4444';
          badgeBg = '#ef4444';
          badgeText = 'Missing';
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
              if (isReservedStatus) {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#9ca3af' : '#e5e7eb';
              } else if (isAvailable) {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#a7f3d0' : '#d1fae5';
              } else {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#fecaca' : '#fee2e2';
              }
            }}
            onMouseLeave={(e) => {
              if (isReservedStatus) {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#d1d5db' : '#f3f4f6';
              } else if (isAvailable) {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#d1fae5' : '#ecfdf5';
              } else {
                e.currentTarget.style.backgroundColor = selectedIngredientIndices.has(index) ? '#fee2e2' : '#fef2f2';
              }
            }}
          >
            <input
              type="checkbox"
              checked={selectedIngredientIndices.has(index)}
              onChange={() => onToggleIngredient(index)}
              onClick={(e) => e.stopPropagation()}
              style={{
                marginRight: '0.75rem',
                width: '1.25rem',
                height: '1.25rem',
                cursor: 'pointer'
              }}
            />
            {editingIngredientIndex === index && onStartEditing && onUpdateEditedIngredient && onSaveEdit && onEditKeyDown ? (
              <input
                type="text"
                value={editedIngredients.get(index) || ingredient}
                onChange={(e) => onUpdateEditedIngredient(index, e.target.value)}
                onBlur={() => onSaveEdit(index)}
                onKeyDown={(e) => onEditKeyDown(e, index)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '2px solid #002B4D',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  marginRight: '0.5rem'
                }}
              />
            ) : (
              <span 
                style={{ 
                  flex: 1, 
                  fontSize: '0.875rem', 
                  color: '#1f2937',
                  cursor: onStartEditing ? 'text' : 'default',
                  padding: '0.25rem',
                  borderRadius: '4px'
                }}
                onClick={(e) => {
                  if (onStartEditing) {
                    e.stopPropagation();
                    onStartEditing(index);
                  }
                }}
                onMouseEnter={(e) => {
                  if (onStartEditing) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (onStartEditing) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title={onStartEditing ? "Click to edit" : undefined}
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
                      // Construct formattedAmount from quantity and unit if not provided
                      let formattedAmount = parsed.formattedAmount;
                      if (!formattedAmount || !formattedAmount.trim()) {
                        if (parsed.quantity !== null && parsed.quantity !== undefined && parsed.unit) {
                          // Format unit with proper capitalization
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
                          const capitalizedUnit = unitMap[parsed.unit.toLowerCase()] || parsed.unit.charAt(0).toUpperCase() + parsed.unit.slice(1).toLowerCase();
                          formattedAmount = `${parsed.quantity} ${capitalizedUnit}`;
                        }
                      }
                      // Show formatted amount if available (not empty), otherwise just the name
                      return formattedAmount && formattedAmount.trim() 
                        ? `${formattedAmount} ${capitalizedName}`
                        : capitalizedName;
                    }
                  }
                  // Fallback: Try to parse amount from original ingredient string
                  const parsed = parseIngredientQuantity(ingredient);
                  if (parsed.quantity !== null && parsed.quantity !== undefined && parsed.unit) {
                    // Format unit with proper capitalization
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
                    const capitalizedUnit = unitMap[parsed.unit.toLowerCase()] || parsed.unit.charAt(0).toUpperCase() + parsed.unit.slice(1).toLowerCase();
                    const formattedAmount = `${parsed.quantity} ${capitalizedUnit}`;
                    const itemName = parsed.itemName
                      .split(' ')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                      .join(' ');
                    return `${formattedAmount} ${itemName}`;
                  }
                  // Final fallback to original ingredient string
                  return ingredient;
                })()}
              </span>
            )}
            {count > 0 && (isAvailable || isReservedStatus) && (
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
                {isReservedStatus
                  ? `${count} reserved`
                  : neededQuantity !== null && availableQuantity !== undefined
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
              {badgeText}
            </span>
          </label>
        );
      })}
    </div>
  );
};
