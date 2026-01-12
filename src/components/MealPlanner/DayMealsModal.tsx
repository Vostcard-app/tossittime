/**
 * Day Meals Modal
 * Shows all meals and dishes for a specific day
 */

import React from 'react';
import type { MealType, PlannedMeal, Dish } from '../../types';
import { format } from 'date-fns';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

interface DayMealsModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  meals: PlannedMeal[];
  onDishClick: (dish: Dish, meal: PlannedMeal) => void;
  onAddDish: (mealType: MealType) => void;
  onAddMeal: () => void;
}

export const DayMealsModal: React.FC<DayMealsModalProps> = ({
  isOpen,
  onClose,
  date,
  meals,
  onDishClick,
  onAddDish,
  onAddMeal
}) => {
  if (!isOpen) return null;

  // Group meals by meal type
  const mealsByType: Record<MealType, PlannedMeal | null> = {
    breakfast: null,
    lunch: null,
    dinner: null
  };

  meals.forEach(meal => {
    mealsByType[meal.mealType] = meal;
  });

  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

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
        zIndex: 1000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              Meals for {format(date, 'EEEE, MMMM d')}
            </h2>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {format(date, 'yyyy')}
            </p>
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

        {/* Meals by Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
          {mealTypes.map((mealType) => {
            const meal = mealsByType[mealType];
            const dishes = meal?.dishes || [];

            return (
              <div
                key={mealType}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                {/* Meal Type Header */}
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderBottom: dishes.length > 0 ? '1px solid #e5e7eb' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                    {MEAL_TYPE_LABELS[mealType]}
                  </h3>
                  {dishes.length > 0 && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {dishes.length} dish{dishes.length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>

                {/* Dishes List */}
                {dishes.length > 0 ? (
                  <div style={{ padding: '0.5rem' }}>
                    {dishes.map((dish) => (
                      <div
                        key={dish.id}
                        onClick={() => meal && onDishClick(dish, meal)}
                        style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: dish.completed ? '#f0fdf4' : '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = dish.completed ? '#dcfce7' : '#f3f4f6';
                          e.currentTarget.style.borderColor = '#002B4D';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = dish.completed ? '#f0fdf4' : '#ffffff';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                              {dish.dishName}
                            </h4>
                            {dish.recipeTitle && dish.recipeTitle !== dish.dishName && (
                              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                                {dish.recipeTitle}
                              </p>
                            )}
                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                              {dish.recipeIngredients.length} ingredient{dish.recipeIngredients.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          {dish.completed && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontWeight: '600',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                marginLeft: '1rem'
                              }}
                            >
                              Completed
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                    No dishes planned
                  </div>
                )}

                {/* Add Dish Button */}
                <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
                  <button
                    onClick={() => onAddDish(mealType)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#002B4D',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Dish
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
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
            Close
          </button>
          {meals.length === 0 && (
            <button
              onClick={onAddMeal}
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
              Add Meal
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
