/**
 * Planned Meal Calendar Page
 * Displays calendar with planned meals and allows day taps to open ingredient picker
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService } from '../services';
import type { MealPlan, PlannedMeal, MealType, Dish } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { IngredientPickerModal } from '../components/MealPlanner/IngredientPickerModal';
import { MealDetailModal } from '../components/MealPlanner/MealDetailModal';
import { MealTypeSelectionModal } from '../components/MealPlanner/MealTypeSelectionModal';
import { DayMealsModal } from '../components/MealPlanner/DayMealsModal';
import { DishListModal } from '../components/MealPlanner/DishListModal';
import { addDays, startOfWeek, endOfWeek, format, isSameDay, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../components/Toast';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const MEAL_TYPE_ABBREVIATIONS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D'
};

const PlannedMealCalendar: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showMealTypeSelection, setShowMealTypeSelection] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(null);
  const [showDishList, setShowDishList] = useState(false);
  const [showDayMealsModal, setShowDayMealsModal] = useState(false);
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);
  const [selectedDish, setSelectedDish] = useState<{ dish: any; meal: PlannedMeal } | null>(null);
  const [showMealDetailModal, setShowMealDetailModal] = useState(false);
  const unsubscribeRef = useRef<Map<string, () => void>>(new Map());
  const loadedWeeksRef = useRef<Set<string>>(new Set());
  const cleanupDoneRef = useRef<boolean>(false);
  
  // Drag and drop state
  const [draggedMeal, setDraggedMeal] = useState<{ meal: PlannedMeal; sourceDate: Date } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [dragOverMealType, setDragOverMealType] = useState<MealType | null>(null);
  const [isDragging, setIsDragging] = useState(false);


  // Subscribe to meal plans for current month (real-time updates)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Reset loaded weeks tracking for new month
    loadedWeeksRef.current.clear();
    
    // Calculate month boundaries based on currentDate (the month being viewed)
    const viewDate = startOfDay(currentDate);
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    
    // Get all week starts in the month
    const weekStarts: Date[] = [];
    let weekStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    while (weekStart <= monthEnd) {
      weekStarts.push(new Date(weekStart));
      weekStart = addDays(weekStart, 7);
    }

    // Set up subscriptions for each week
    const unsubscribes = new Map<string, () => void>();
    const totalWeeks = weekStarts.length;

    weekStarts.forEach(weekStartDate => {
      const weekKey = weekStartDate.getTime().toString();
      
      const unsubscribe = mealPlanningService.subscribeToMealPlan(
        user.uid,
        weekStartDate,
        (plan: MealPlan | null) => {
          setMealPlans(prevPlans => {
            // Remove old plan for this week if it exists
            const filtered = prevPlans.filter(p => {
              const planWeekStart = startOfWeek(p.weekStartDate, { weekStartsOn: 0 });
              return planWeekStart.getTime() !== weekStartDate.getTime();
            });
            
            // Add new plan if it exists
            if (plan) {
              return [...filtered, plan];
            }
            
            return filtered;
          });
          
          // Track initial load for this week (only count once per week)
          if (!loadedWeeksRef.current.has(weekKey)) {
            loadedWeeksRef.current.add(weekKey);
            if (loadedWeeksRef.current.size === totalWeeks) {
              setLoading(false);
            }
          }
        }
      );
      
      unsubscribes.set(weekKey, unsubscribe);
    });

    // Store unsubscribe functions
    unsubscribeRef.current = unsubscribes;

    // Cleanup function
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
      unsubscribes.clear();
      loadedWeeksRef.current.clear();
    };
  }, [user, currentDate]);

  // Refresh meal plans (kept as fallback, but subscriptions handle updates automatically)
  const refreshMealPlans = async () => {
    // Subscriptions handle real-time updates, but we can keep this as a fallback
    // if needed for manual refresh scenarios
    if (!user) return;
    
    // Force re-subscription by updating currentDate slightly
    // This will trigger the useEffect to re-subscribe
    setCurrentDate(new Date());
  };

  // Migrate legacy meal to new dishes structure
  const migrateLegacyMeal = (meal: PlannedMeal): PlannedMeal => {
    // If meal already has dishes, return as-is
    if (meal.dishes && meal.dishes.length > 0) {
      return {
        ...meal,
        date: startOfDay(meal.date)
      };
    }

    // Check if this is a legacy meal (has old structure)
    const hasLegacyData = meal.mealName || meal.recipeTitle || (meal.recipeIngredients && meal.recipeIngredients.length > 0) || (meal.suggestedIngredients && meal.suggestedIngredients.length > 0);

    if (hasLegacyData) {
      // Create a dish from legacy meal data
      const dish: Dish = {
        id: meal.id + '-dish-0', // Generate a unique ID for the migrated dish
        dishName: meal.mealName || meal.recipeTitle || 'Unnamed Dish',
        recipeTitle: meal.recipeTitle || null,
        recipeIngredients: meal.recipeIngredients || meal.suggestedIngredients || [],
        recipeSourceUrl: meal.recipeSourceUrl || null,
        recipeSourceDomain: meal.recipeSourceDomain || null,
        recipeImageUrl: meal.recipeImageUrl || null,
        reservedQuantities: meal.reservedQuantities || {},
        claimedItemIds: meal.claimedItemIds || meal.usesBestBySoonItems || [],
        claimedShoppingListItemIds: meal.claimedShoppingListItemIds || [],
        completed: meal.completed || false
      };

      return {
        ...meal,
        date: startOfDay(meal.date),
        dishes: [dish]
      };
    }

    // No legacy data, just ensure dishes array exists
    return {
      ...meal,
      date: startOfDay(meal.date),
      dishes: []
    };
  };

  // Get all planned meals from all meal plans
  const allPlannedMeals = useMemo(() => {
    const meals: PlannedMeal[] = [];
    mealPlans.forEach(plan => {
      plan.meals.forEach(meal => {
        // Migrate legacy meals and normalize dates
        meals.push(migrateLegacyMeal(meal));
      });
    });
    return meals;
  }, [mealPlans]);

  // Get meals for a specific day
  const getMealsForDay = (date: Date): PlannedMeal[] => {
    const normalizedDate = startOfDay(date);
    return allPlannedMeals.filter(meal => {
      // Only include meals for this date that have at least one dish
      const isSameDate = isSameDay(meal.date, normalizedDate);
      const hasDishes = meal.dishes && meal.dishes.length > 0;
      return isSameDate && hasDishes;
    });
  };

  // Get meal for a specific day and meal type
  const getMealForDayAndType = (date: Date, mealType: MealType): PlannedMeal | null => {
    const normalizedDate = startOfDay(date);
    const meal = allPlannedMeals.find(meal => isSameDay(meal.date, normalizedDate) && meal.mealType === mealType);
    
    if (!meal) {
      console.log('Meal not found for:', { date: normalizedDate, mealType, allMeals: allPlannedMeals.map(m => ({ date: m.date, mealType: m.mealType, dishes: m.dishes?.length || 0 })) });
      return null;
    }
    
    // Meal is already migrated in allPlannedMeals, just return it
    return meal;
  };

  // One-time cleanup: Remove legacy dinner meals from January 12th and 14th, 2026
  useEffect(() => {
    if (!user || cleanupDoneRef.current) return;
    if (allPlannedMeals.length === 0) return; // Wait for meals to be computed

    const cleanupLegacyMeals = async () => {
      try {
        // January 12th, 2026
        const jan12 = startOfDay(new Date(2026, 0, 12)); // Month is 0-indexed
        
        // January 14th, 2026
        const jan14 = startOfDay(new Date(2026, 0, 14));

        // Find meals for these dates (inline logic to avoid dependency issues)
        const jan12Meal = allPlannedMeals.find(meal => 
          isSameDay(meal.date, jan12) && meal.mealType === 'dinner'
        );
        const jan14Meal = allPlannedMeals.find(meal => 
          isSameDay(meal.date, jan14) && meal.mealType === 'dinner'
        );

        if (jan12Meal) {
          console.log('[cleanupLegacyMeals] Deleting legacy dinner from January 12th');
          await mealPlanningService.deleteMeal(user.uid, jan12Meal.id);
        }

        if (jan14Meal) {
          console.log('[cleanupLegacyMeals] Deleting legacy dinner from January 14th');
          await mealPlanningService.deleteMeal(user.uid, jan14Meal.id);
        }

        cleanupDoneRef.current = true; // Mark as done
      } catch (error) {
        console.error('[cleanupLegacyMeals] Error cleaning up legacy meals:', error);
      }
    };

    // Run cleanup once after meals are loaded
    cleanupLegacyMeals();
  }, [user, allPlannedMeals]); // Only run when allPlannedMeals are computed

  // Handle meal indicator click (specific meal type)
  const handleMealIndicatorClick = (date: Date, mealType: MealType, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent day click handler from firing
    const normalizedDate = startOfDay(date);
    setSelectedDay(normalizedDate);
    setSelectedMealType(mealType);
    setShowDishList(true);
  };

  // Handle day click (only when not clicking on a meal indicator)
  const handleDayClick = (date: Date) => {
    const normalizedDate = startOfDay(date);
    setSelectedDay(normalizedDate);
    const dayMeals = getMealsForDay(normalizedDate);
    
    // If there are meals for this day, show the day meals modal
    // Otherwise, show the meal type selection modal
    if (dayMeals.length > 0) {
      setShowDayMealsModal(true);
    } else {
      setShowMealTypeSelection(true);
    }
  };

  // Handle meal type selection
  const handleMealTypeSelect = (mealType: MealType) => {
    setSelectedMealType(mealType);
    setShowMealTypeSelection(false);
    setShowIngredientPicker(true);
  };

  // Handle add dish
  const handleAddDish = (mealType?: MealType) => {
    if (mealType) {
      setSelectedMealType(mealType);
    }
    setShowDishList(false);
    setShowMealTypeSelection(false);
    setShowIngredientPicker(true);
  };

  // Handle add meal (when no meals exist for the day)
  const handleAddMeal = () => {
    setShowDishList(false);
    setShowMealTypeSelection(true);
  };

  // Drag and drop handlers
  const handleDragStart = (meal: PlannedMeal, date: Date, e: React.DragEvent) => {
    e.stopPropagation(); // Prevent day click handler
    setDraggedMeal({ meal, sourceDate: date });
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragEnd = () => {
    setDraggedMeal(null);
    setDragOverDate(null);
    setDragOverMealType(null);
    setIsDragging(false);
  };

  const canDropMeal = (date: Date, mealType: MealType): boolean => {
    if (!draggedMeal) return false;
    
    // Can't drop on the same day and meal type
    if (isSameDay(date, draggedMeal.sourceDate) && mealType === draggedMeal.meal.mealType) {
      return false;
    }
    
    // Check if target day already has a meal of this type
    const targetDayMeals = getMealsForDay(date);
    const hasMealOfType = targetDayMeals.some(m => m.mealType === mealType);
    
    return !hasMealOfType;
  };

  const handleDragOver = (date: Date, mealType: MealType, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (canDropMeal(date, mealType)) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverDate(date);
      setDragOverMealType(mealType);
    } else {
      e.dataTransfer.dropEffect = 'none';
      setDragOverDate(null);
      setDragOverMealType(null);
    }
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
    setDragOverMealType(null);
  };

  const moveMealToDate = async (sourceDate: Date, sourceMealType: MealType, targetDate: Date, targetMealType: MealType) => {
    if (!user) return;

    try {
      // Get source meal
      const sourceMeal = getMealForDayAndType(sourceDate, sourceMealType);
      if (!sourceMeal || !sourceMeal.dishes || sourceMeal.dishes.length === 0) {
        console.error('[moveMealToDate] Source meal not found or has no dishes');
        return;
      }

      // Get source meal plan
      const sourceWeekStart = startOfWeek(sourceDate, { weekStartsOn: 0 });
      sourceWeekStart.setHours(0, 0, 0, 0);
      let sourceMealPlan = await mealPlanningService.getMealPlan(user.uid, sourceWeekStart);
      
      if (!sourceMealPlan) {
        console.error('[moveMealToDate] Source meal plan not found');
        return;
      }

      // Get target meal plan
      const targetWeekStart = startOfWeek(targetDate, { weekStartsOn: 0 });
      targetWeekStart.setHours(0, 0, 0, 0);
      let targetMealPlan = await mealPlanningService.getMealPlan(user.uid, targetWeekStart);
      
      if (!targetMealPlan) {
        targetMealPlan = await mealPlanningService.createMealPlan(user.uid, targetWeekStart, []);
      }

      // Get or create target meal
      let targetMeal = targetMealPlan.meals.find(
        m => isSameDay(m.date, targetDate) && m.mealType === targetMealType
      );

      if (!targetMeal) {
        const targetMealId = `meal-${Date.now()}`;
        targetMeal = {
          id: targetMealId,
          date: targetDate,
          mealType: targetMealType,
          finishBy: sourceMeal.finishBy || '18:00',
          confirmed: false,
          skipped: false,
          isLeftover: false,
          dishes: []
        };
        targetMealPlan.meals.push(targetMeal);
      }

      // Move all dishes from source to target
      const dishesToMove = [...(sourceMeal.dishes || [])];
      targetMeal.dishes = [...(targetMeal.dishes || []), ...dishesToMove];

      // Remove source meal entirely (since all dishes are moved)
      const sourceMealIndex = sourceMealPlan.meals.findIndex(m => m.id === sourceMeal.id);
      if (sourceMealIndex >= 0) {
        sourceMealPlan.meals.splice(sourceMealIndex, 1);
      }

      // Update both meal plans
      await mealPlanningService.updateMealPlan(sourceMealPlan.id, { meals: sourceMealPlan.meals });
      await mealPlanningService.updateMealPlan(targetMealPlan.id, { meals: targetMealPlan.meals });

      console.log('[moveMealToDate] Successfully moved meal', {
        from: { date: sourceDate, type: sourceMealType },
        to: { date: targetDate, type: targetMealType },
        dishesMoved: dishesToMove.length
      });
    } catch (error) {
      console.error('[moveMealToDate] Error moving meal:', error);
      throw error;
    }
  };

  const handleDrop = async (date: Date, mealType: MealType, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedMeal || !canDropMeal(date, mealType)) {
      return;
    }

    try {
      await moveMealToDate(
        draggedMeal.sourceDate,
        draggedMeal.meal.mealType,
        date,
        mealType
      );
      
      showToast('Meal moved successfully', 'success');
      
      // Clean up drag state
      handleDragEnd();
    } catch (error) {
      console.error('[handleDrop] Error dropping meal:', error);
      showToast('Failed to move meal. Please try again.', 'error');
      handleDragEnd();
    }
  };

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = startOfWeek(firstDay, { weekStartsOn: 0 });
    const endDate = endOfWeek(lastDay, { weekStartsOn: 0 });
    
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
      <Banner showHomeIcon={true} showLogo={false} onMenuClick={() => setMenuOpen(true)} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
              {format(currentDate, 'MMMM yyyy')}
            </h3>
            <button
              onClick={() => navigate(`/print-meal-list?date=${format(currentDate, 'yyyy-MM-dd')}`)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              List View
            </button>
          </div>
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
            const normalizedDay = startOfDay(day);
            const dayMeals = getMealsForDay(normalizedDay);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(normalizedDay, startOfDay(new Date()));
            
            // Check if this day is a valid drop target for each meal type
            const canDropBreakfast = isDragging && draggedMeal && canDropMeal(normalizedDay, 'breakfast');
            const canDropLunch = isDragging && draggedMeal && canDropMeal(normalizedDay, 'lunch');
            const canDropDinner = isDragging && draggedMeal && canDropMeal(normalizedDay, 'dinner');
            const isDropTarget = canDropBreakfast || canDropLunch || canDropDinner;
            const isInvalidDrop = isDragging && draggedMeal && !isDropTarget && 
              (dragOverDate && isSameDay(dragOverDate, normalizedDay));
            
            return (
              <div
                key={index}
                onClick={() => {
                  if (!isDragging) {
                    handleDayClick(normalizedDay);
                  }
                }}
                onDragOver={(e) => {
                  // Handle drag over for each meal type
                  if (isDragging && draggedMeal) {
                    const mealType = draggedMeal.meal.mealType;
                    handleDragOver(normalizedDay, mealType, e);
                  }
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  if (isDragging && draggedMeal) {
                    const mealType = draggedMeal.meal.mealType;
                    handleDrop(normalizedDay, mealType, e);
                  }
                }}
                style={{
                  minHeight: '100px',
                  padding: '0.5rem',
                  border: isDropTarget ? '2px solid #10b981' : (isInvalidDrop ? '2px solid #ef4444' : '1px solid #e5e7eb'),
                  borderRadius: '4px',
                  backgroundColor: isDropTarget ? '#f0fdf4' : (isInvalidDrop ? '#fef2f2' : (isToday ? '#f0f8ff' : (isCurrentMonth ? '#ffffff' : '#f9fafb'))),
                  cursor: isDragging ? (isDropTarget ? 'copy' : (isInvalidDrop ? 'not-allowed' : 'pointer')) : 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isDragging) {
                    e.currentTarget.style.backgroundColor = isToday ? '#e0f2fe' : '#f3f4f6';
                    e.currentTarget.style.borderColor = '#002B4D';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDragging) {
                    e.currentTarget.style.backgroundColor = isToday ? '#f0f8ff' : (isCurrentMonth ? '#ffffff' : '#f9fafb');
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }
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
                    {dayMeals
                      .filter(meal => meal.dishes && meal.dishes.length > 0) // Safety check: only show meals with dishes
                      .slice(0, 3)
                      .map((meal, mealIndex) => {
                        const dishCount = meal.dishes?.length || 0;
                        const hasCompletedDishes = meal.dishes?.some(d => d.completed) || false;
                        const isBeingDragged = isDragging && draggedMeal?.meal.id === meal.id && isSameDay(draggedMeal.sourceDate, normalizedDay);
                        return (
                        <div
                          key={mealIndex}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(meal, normalizedDay, e)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => {
                            if (!isDragging) {
                              handleMealIndicatorClick(normalizedDay, meal.mealType, e);
                            }
                          }}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: hasCompletedDishes ? '#9ca3af' : '#002B4D',
                            color: '#ffffff',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            opacity: isBeingDragged ? 0.3 : (hasCompletedDishes ? 0.6 : 1),
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none'
                          }}
                          title={`${MEAL_TYPE_ABBREVIATIONS[meal.mealType]}: ${dishCount} dish${dishCount !== 1 ? 'es' : ''} - Drag to move`}
                        >
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                            {MEAL_TYPE_ABBREVIATIONS[meal.mealType]} {dishCount > 0 && `(${dishCount})`}
                          </span>
                        </div>
                      );
                    })}
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
                
                {/* Drop zone indicators for empty meal types */}
                {isDragging && draggedMeal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                    {(['breakfast', 'lunch', 'dinner'] as MealType[]).map(mealType => {
                      const hasMealOfType = dayMeals.some(m => m.mealType === mealType);
                      // Only show drop zone if this meal type is empty and matches the dragged meal type
                      if (hasMealOfType || mealType !== draggedMeal.meal.mealType) return null;
                      
                      const isTarget = dragOverDate && isSameDay(dragOverDate, normalizedDay) && dragOverMealType === mealType;
                      
                      return (
                        <div
                          key={mealType}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: isTarget ? '#10b981' : '#e5e7eb',
                            color: isTarget ? '#ffffff' : '#9ca3af',
                            borderRadius: '4px',
                            border: isTarget ? '2px dashed #10b981' : '1px dashed #d1d5db',
                            textAlign: 'center',
                            opacity: isTarget ? 1 : 0.5
                          }}
                        >
                          Drop {MEAL_TYPE_ABBREVIATIONS[mealType]} here
                        </div>
                      );
                    })}
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

      {/* Meal Type Selection Modal */}
      {showMealTypeSelection && selectedDay && (
        <MealTypeSelectionModal
          isOpen={showMealTypeSelection}
          onClose={() => {
            setShowMealTypeSelection(false);
            setSelectedDay(null);
          }}
          onSelectMealType={handleMealTypeSelect}
          date={selectedDay}
        />
      )}

      {/* Dish List Modal - Shows dishes for a specific meal type */}
      {showDishList && selectedDay && selectedMealType && (
        <DishListModal
          isOpen={showDishList}
          onClose={() => {
            setShowDishList(false);
            setSelectedMealType(null);
            setSelectedDay(null);
          }}
          date={selectedDay}
          mealType={selectedMealType}
          meal={getMealForDayAndType(selectedDay, selectedMealType)}
          onDishClick={(dish) => {
            const meal = getMealForDayAndType(selectedDay, selectedMealType);
            if (meal) {
              setSelectedDish({ dish, meal });
              setShowDishList(false);
              setShowMealDetailModal(true);
            }
          }}
          onAddDish={() => {
            setShowDishList(false);
            setShowIngredientPicker(true);
          }}
        />
      )}

      {/* Day Meals Modal - Shows all meals for a day (only when clicking day, not meal indicator) */}
      {showDayMealsModal && selectedDay && (
        <DayMealsModal
          isOpen={showDayMealsModal}
          onClose={() => {
            setShowDayMealsModal(false);
            setSelectedDay(null);
          }}
          date={selectedDay}
          meals={getMealsForDay(selectedDay)}
          onDishClick={(dish, meal) => {
            setSelectedDish({ dish, meal });
            setShowDayMealsModal(false);
            setShowMealDetailModal(true);
          }}
          onAddDish={handleAddDish}
          onAddMeal={handleAddMeal}
        />
      )}

      {/* Ingredient Picker Modal */}
      {showIngredientPicker && selectedDay && selectedMealType && (
        <IngredientPickerModal
          isOpen={showIngredientPicker}
          onClose={() => {
            setShowIngredientPicker(false);
            setSelectedMealType(null);
            setSelectedDay(null);
            refreshMealPlans();
          }}
          selectedDate={selectedDay}
          initialMealType={selectedMealType}
        />
      )}

      {/* Meal Detail Modal */}
      {showMealDetailModal && selectedDish && (
        <MealDetailModal
          isOpen={showMealDetailModal}
          onClose={() => {
            setShowMealDetailModal(false);
            setSelectedDish(null);
            refreshMealPlans();
          }}
          dish={selectedDish.dish}
          meal={selectedDish.meal}
          onDishDeleted={refreshMealPlans}
        />
      )}
    </>
  );
};

export default PlannedMealCalendar;
