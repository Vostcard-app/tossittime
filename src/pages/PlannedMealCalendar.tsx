/**
 * Planned Meal Calendar Page
 * Displays calendar with planned meals and allows day taps to open ingredient picker
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService, userSettingsService } from '../services';
import type { MealPlan, PlannedMeal, MealType, Dish } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { IngredientPickerModal } from '../components/MealPlanner/IngredientPickerModal';
import { MealDetailModal } from '../components/MealPlanner/MealDetailModal';
import { MealTypeSelectionModal } from '../components/MealPlanner/MealTypeSelectionModal';
import { DayMealsModal } from '../components/MealPlanner/DayMealsModal';
import { DishListModal } from '../components/MealPlanner/DishListModal';
import { MealSelectionModal } from '../components/MealPlanner/MealSelectionModal';
import { addDays, startOfWeek, endOfWeek, format, isSameDay, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
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
  const [showMealSelectionModal, setShowMealSelectionModal] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const unsubscribeRef = useRef<Map<string, () => void>>(new Map());
  const loadedWeeksRef = useRef<Set<string>>(new Set());
  const cleanupDoneRef = useRef<boolean>(false);
  
  // Drag and drop state
  const [draggedMeal, setDraggedMeal] = useState<{ meal: PlannedMeal; sourceDate: Date } | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [dragOverMealType, setDragOverMealType] = useState<MealType | null>(null);
  const [isDragging, setIsDragging] = useState(false);


  // Check premium status
  useEffect(() => {
    const checkPremium = async () => {
      if (!user) {
        setIsPremium(false);
        return;
      }
      try {
        const premium = await userSettingsService.isPremiumUser(user.uid);
        setIsPremium(premium);
      } catch (error) {
        console.error('Error checking premium status:', error);
        setIsPremium(false);
      }
    };
    checkPremium();
  }, [user]);

  // Subscribe to meal plans for current month (real-time updates)
  useEffect(() => {
    if (!user || !isPremium) {
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

  // Handle meal type letter click (new compact view)
  const handleMealTypeLetterClick = (date: Date, mealType: MealType, event: React.MouseEvent) => {
    event.stopPropagation();
    const normalizedDate = startOfDay(date);
    const mealsOfType = getMealsForDay(normalizedDate).filter(m => m.mealType === mealType);
    
    if (mealsOfType.length === 0) return;
    
    if (mealsOfType.length === 1) {
      // Single meal: show details directly
      const meal = mealsOfType[0];
      if (meal.dishes && meal.dishes.length === 1) {
        // Single dish: show meal detail modal
        setSelectedDish({ dish: meal.dishes[0], meal });
        setShowMealDetailModal(true);
      } else if (meal.dishes && meal.dishes.length > 1) {
        // Multiple dishes: show dish list modal
        setSelectedDay(normalizedDate);
        setSelectedMealType(mealType);
        setShowDishList(true);
      }
    } else {
      // Multiple meals: show meal selection modal
      setSelectedDay(normalizedDate);
      setSelectedMealType(mealType);
      setShowMealSelectionModal(true);
    }
  };

  // Handle meal click from meal selection modal
  const handleMealSelectionClick = (meal: PlannedMeal) => {
    setShowMealSelectionModal(false);
    if (meal.dishes && meal.dishes.length === 1) {
      // Single dish: show meal detail modal
      setSelectedDish({ dish: meal.dishes[0], meal });
      setShowMealDetailModal(true);
    } else if (meal.dishes && meal.dishes.length > 1) {
      // Multiple dishes: show dish list modal
      setSelectedMealType(meal.mealType);
      setShowDishList(true);
    }
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
  const monthCalendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Navigate periods (months)
  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    // Navigate by month
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

  // Show upgrade modal if not premium
  if (isPremium === false) {
    return (
      <>
        <Banner showHomeIcon={true} showLogo={false} onMenuClick={() => setMenuOpen(true)} />
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <div style={{ 
          padding: '3rem 2rem', 
          textAlign: 'center',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              Meal Planner - Premium Feature
            </h2>
            <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '1rem' }}>
              Unlock AI-powered meal planning with automatic ingredient extraction from recipe URLs. 
              Get smart ingredient lists with quantities, and automatically add items to your shopping list.
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                Premium Features:
              </h3>
              <ul style={{ textAlign: 'left', margin: 0, paddingLeft: '1.5rem', color: '#6b7280' }}>
                <li>AI-powered recipe ingredient extraction</li>
                <li>Automatic quantity and amount parsing</li>
                <li>Smart shopping list integration</li>
                <li>Meal planning calendar</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/settings')}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Upgrade to Premium
            </button>
          </div>
        </div>
      </>
    );
  }

  if (loading || isPremium === null) {
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
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem', width: '100%', boxSizing: 'border-box' }}>
        <h2 style={{ marginBottom: '1rem' }}>Planned Meal Calendar</h2>
        
        {/* Navigation and View Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button
            onClick={() => navigatePeriod('prev')}
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
            ← Previous Month
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
              {format(currentDate, 'MMMM yyyy')}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
          </div>
          <button
            onClick={() => navigatePeriod('next')}
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
            Next Month →
          </button>
        </div>

        {/* Calendar Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', 
          gap: '0.25rem',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '0.25rem',
          backgroundColor: '#ffffff',
          width: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto'
        }}>
          {/* Day Headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              style={{
                padding: '0.5rem 0.25rem',
                textAlign: 'center',
                fontWeight: '600',
                fontSize: '0.75rem',
                color: '#6b7280',
                borderBottom: '1px solid #e5e7eb',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {monthCalendarDays.map((day, index) => {
            const normalizedDay = startOfDay(day);
            const dayMeals = getMealsForDay(normalizedDay);
            const isToday = isSameDay(normalizedDay, startOfDay(new Date()));
            const isCurrentMonth = (
              normalizedDay.getMonth() === currentDate.getMonth() && 
              normalizedDay.getFullYear() === currentDate.getFullYear()
            );
            
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
                  minHeight: '80px',
                  padding: '0.25rem',
                  border: isDropTarget ? '2px solid #10b981' : (isInvalidDrop ? '2px solid #ef4444' : '1px solid #e5e7eb'),
                  borderRadius: '4px',
                  backgroundColor: isDropTarget ? '#f0fdf4' : (isInvalidDrop ? '#fef2f2' : (isToday ? '#f0f8ff' : (isCurrentMonth ? '#ffffff' : '#f9fafb'))),
                  cursor: isDragging ? (isDropTarget ? 'copy' : (isInvalidDrop ? 'not-allowed' : 'pointer')) : 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  opacity: isCurrentMonth ? 1 : 0.5,
                  minWidth: 0,
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  if (!isDragging) {
                    e.currentTarget.style.backgroundColor = isToday ? '#e0f2fe' : (isCurrentMonth ? '#f3f4f6' : '#f9fafb');
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
                  fontSize: '0.75rem',
                  fontWeight: isToday ? '700' : (isCurrentMonth ? '500' : '400'),
                  color: isCurrentMonth ? '#1f2937' : '#9ca3af',
                  marginBottom: '0.25rem'
                }}>
                  {format(day, 'd')}
                </div>
                
                {/* Meal Indicators - Tappable Letters */}
                {dayMeals.length > 0 && (() => {
                  // Group meals by meal type
                  const mealsByType: Record<MealType, PlannedMeal[]> = {
                    breakfast: [],
                    lunch: [],
                    dinner: []
                  };
                  
                  dayMeals.forEach(meal => {
                    if (meal.dishes && meal.dishes.length > 0) {
                      mealsByType[meal.mealType].push(meal);
                    }
                  });
                  
                  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {mealTypes.map(mealType => {
                        const mealsOfType = mealsByType[mealType];
                        if (mealsOfType.length === 0) return null;
                        
                        const mealCount = mealsOfType.length;
                        const hasMultipleMeals = mealCount > 1;
                        
                        return (
                          <div
                            key={mealType}
                            onClick={(e) => {
                              if (!isDragging) {
                                handleMealTypeLetterClick(normalizedDay, mealType, e);
                              }
                            }}
                            style={{
                              position: 'relative',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: '#002B4D',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              cursor: isDragging ? 'default' : 'pointer',
                              userSelect: 'none',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (!isDragging) {
                                e.currentTarget.style.backgroundColor = '#003d6b';
                                e.currentTarget.style.transform = 'scale(1.1)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isDragging) {
                                e.currentTarget.style.backgroundColor = '#002B4D';
                                e.currentTarget.style.transform = 'scale(1)';
                              }
                            }}
                            title={hasMultipleMeals 
                              ? `${MEAL_TYPE_ABBREVIATIONS[mealType]}: ${mealCount} meals - Tap to select`
                              : `${MEAL_TYPE_ABBREVIATIONS[mealType]}: ${mealsOfType[0].dishes?.[0]?.dishName || 'Tap to view'}`
                            }
                          >
                            {MEAL_TYPE_ABBREVIATIONS[mealType]}
                            {hasMultipleMeals && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '-4px',
                                  right: '-4px',
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ef4444',
                                  color: '#ffffff',
                                  fontSize: '0.6rem',
                                  fontWeight: '700',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid #ffffff'
                                }}
                              >
                                {mealCount}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                
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

      {/* Meal Selection Modal - Shows list when multiple meals of same type */}
      {showMealSelectionModal && selectedDay && selectedMealType && (
        <MealSelectionModal
          isOpen={showMealSelectionModal}
          onClose={() => {
            setShowMealSelectionModal(false);
            setSelectedMealType(null);
            setSelectedDay(null);
          }}
          date={selectedDay}
          mealType={selectedMealType}
          meals={getMealsForDay(selectedDay).filter(m => m.mealType === selectedMealType)}
          onMealClick={handleMealSelectionClick}
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
