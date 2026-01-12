/**
 * Meal Type Selection Modal
 * Shows when a day is clicked, allows user to select Breakfast/Lunch/Dinner
 */

import React from 'react';
import type { MealType } from '../../types';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

interface MealTypeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMealType: (mealType: MealType) => void;
  date: Date;
}

export const MealTypeSelectionModal: React.FC<MealTypeSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectMealType,
  date
}) => {
  if (!isOpen) return null;

  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

  const handleMealTypeClick = (mealType: MealType) => {
    onSelectMealType(mealType);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            Select Meal Type
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
            {formatDate(date)}
          </p>
        </div>

        {/* Meal Type Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {mealTypes.map((mealType) => (
            <button
              key={mealType}
              onClick={() => handleMealTypeClick(mealType)}
              style={{
                padding: '1.5rem',
                backgroundColor: '#f9fafb',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1.125rem',
                fontWeight: '500',
                color: '#1f2937',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#002B4D';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {MEAL_TYPE_LABELS[mealType]}
            </button>
          ))}
        </div>

        {/* Close Button */}
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
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
        </div>
      </div>
    </div>
  );
};
