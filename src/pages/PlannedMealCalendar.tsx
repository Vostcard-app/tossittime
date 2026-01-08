/**
 * Planned Meal Calendar Page
 * Displays calendar with planned meals and allows day taps to open ingredient picker
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService } from '../services';
import type { MealPlan, PlannedMeal, MealType } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { IngredientPickerModal } from '../components/MealPlanner/IngredientPickerModal';
import { addDays, startOfWeek, format, isSameDay, startOfDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

const PlannedMealCalendar: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);

  // Load meal plans for current month
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadMealPlans = async () => {
      try {
        setLoading(true);
        // Load meal plans for the current month (4 weeks)
        const today = startOfDay(new Date());
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const plans: MealPlan[] = [];
        
        // Get meal plans for each week in the month
        let weekStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        while (weekStart <= monthEnd) {
          const plan = await mealPlanningService.getMealPlan(user.uid, weekStart);
          if (plan) {
            plans.push(plan);
          }
          weekStart = addDays(weekStart, 7);
        }
        
        setMealPlans(plans);
      } catch (error) {
        console.error('Error loading meal plans:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMealPlans();
  }, [user, currentDate]);

  // Get all planned meals from all meal plans
  const allPlannedMeals = useMemo(() => {
    const meals: PlannedMeal[] = [];
    mealPlans.forEach(plan => {
      plan.meals.forEach(meal => {
        meals.push(meal);
      });
    });
    return meals;
  }, [mealPlans]);

  // Get meals for a specific day
  const getMealsForDay = (date: Date): PlannedMeal[] => {
    return allPlannedMeals.filter(meal => isSameDay(meal.date, date));
  };

  // Handle day click
  const handleDayClick = (date: Date) => {
    setSelectedDay(date);
    setShowIngredientPicker(true);
  };

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = startOfWeek(firstDay, { weekStartsOn: 0 });
    const endDate = startOfWeek(lastDay, { weekStartsOn: 0 });
    
    const days: Date[] = [];
    let current = startDate;
    while (current <= endDate) {
      days.push(new Date(current));
      current = addDays(current, 1);
    }
    return days;
  }, [currentDate]);

  // Navigate months
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view planned meals.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading planned meals...</p>
      </div>
    );
  }

  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Planned Meal Calendar</h2>
        
        {/* Month Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button
            onClick={() => navigateMonth('prev')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            ← Previous
          </button>
          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
            {format(currentDate, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => navigateMonth('next')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Next →
          </button>
        </div>

        {/* Calendar Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: '0.5rem',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '0.5rem',
          backgroundColor: '#ffffff'
        }}>
          {/* Day Headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              style={{
                padding: '0.75rem',
                textAlign: 'center',
                fontWeight: '600',
                fontSize: '0.875rem',
                color: '#6b7280',
                borderBottom: '1px solid #e5e7eb'
              }}
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((day, index) => {
            const dayMeals = getMealsForDay(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={index}
                onClick={() => handleDayClick(day)}
                style={{
                  minHeight: '100px',
                  padding: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  backgroundColor: isToday ? '#f0f8ff' : (isCurrentMonth ? '#ffffff' : '#f9fafb'),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isToday ? '#e0f2fe' : '#f3f4f6';
                  e.currentTarget.style.borderColor = '#002B4D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isToday ? '#f0f8ff' : (isCurrentMonth ? '#ffffff' : '#f9fafb');
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: isToday ? '700' : '500',
                  color: isCurrentMonth ? '#1f2937' : '#9ca3af',
                  marginBottom: '0.25rem'
                }}>
                  {format(day, 'd')}
                </div>
                
                {/* Meal Indicators */}
                {dayMeals.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {dayMeals.slice(0, 3).map((meal, mealIndex) => (
                      <div
                        key={mealIndex}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#002B4D',
                          color: '#ffffff',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        title={meal.mealName}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                          <a
                            href={meal.recipeSourceUrl || '#'}
                            target={meal.recipeSourceUrl ? "_blank" : undefined}
                            rel={meal.recipeSourceUrl ? "noopener noreferrer" : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!meal.recipeSourceUrl) {
                                e.preventDefault();
                              }
                            }}
                            style={{
                              color: '#ffffff',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              fontWeight: '600',
                              display: 'block',
                              width: '100%'
                            }}
                            title={meal.recipeSourceUrl ? `${meal.mealName} - View recipe` : meal.mealName}
                          >
                            {MEAL_TYPE_LABELS[meal.mealType]}
                          </a>
                        </span>
                      </div>
                    ))}
                    {dayMeals.length > 3 && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        fontStyle: 'italic'
                      }}>
                        +{dayMeals.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            Tap on any day to add or edit meals for that day.
          </p>
        </div>
      </div>

      {/* Ingredient Picker Modal */}
      {showIngredientPicker && selectedDay && (
        <IngredientPickerModal
          isOpen={showIngredientPicker}
          onClose={() => {
            setShowIngredientPicker(false);
            setSelectedDay(null);
          }}
          selectedDate={selectedDay}
        />
      )}
    </>
  );
};

export default PlannedMealCalendar;
