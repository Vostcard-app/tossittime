/**
 * Reusable Ingredient Checklist Component
 * Displays ingredients with availability status and checkboxes
 */

import React from 'react';
import type { IngredientStatus } from '../../hooks/useIngredientAvailability';

interface IngredientChecklistProps {
  ingredientStatuses: IngredientStatus[];
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
                {editedIngredients.get(index) || ingredient}
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
              {status === 'available' ? 'Available' : status === 'partial' ? 'Partial' : 'Missing'}
            </span>
          </label>
        );
      })}
    </div>
  );
};
