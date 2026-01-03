/**
 * Meal Planner Page
 * Day-by-day meal planning session with checkboxes for meal types
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService, musgravesService } from '../services';
import type { MealSuggestion, MealType } from '../types';
import Banner from '../components/layout/Banner';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { startOfWeek, addDays, format } from 'date-fns';

interface DayPlan {
  date: Date;
  breakfast?: MealSuggestion;
  lunch?: MealSuggestion;
  dinner?: MealSuggestion;
  servingSize?: number; // Number of people for this day (overrides profile default)
  skipped: boolean;
  selectedMealTypes: Set<MealType>; // Which meal types are checked for suggestions
  suggestions: Map<MealType, MealSuggestion[]>; // Suggestions grouped by meal type
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' }
];

const MealPlanner: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Planning session state
  const [isPlanning, setIsPlanning] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  // Initialize day plans
  useEffect(() => {
    if (isPlanning && dayPlans.length === 0) {
      const plans: DayPlan[] = [];
      for (let i = 0; i < 7; i++) {
        plans.push({
          date: addDays(weekStart, i),
          skipped: false,
          selectedMealTypes: new Set(),
          suggestions: new Map()
        });
      }
      setDayPlans(plans);
    }
  }, [isPlanning, weekStart, dayPlans.length]);

  const handleStartPlanning = () => {
    setIsPlanning(true);
    setCurrentDayIndex(0);
  };

  const handleToggleMealType = (mealType: MealType) => {
    const newDayPlans = [...dayPlans];
    const currentDay = newDayPlans[currentDayIndex];
    const newSelected = new Set(currentDay.selectedMealTypes);
    
    if (newSelected.has(mealType)) {
      newSelected.delete(mealType);
      // Clear suggestions for this meal type
      const newSuggestions = new Map(currentDay.suggestions);
      newSuggestions.delete(mealType);
      currentDay.suggestions = newSuggestions;
    } else {
      newSelected.add(mealType);
    }
    
    currentDay.selectedMealTypes = newSelected;
    setDayPlans(newDayPlans);
  };

  const handleGenerateSuggestions = async () => {
    if (!user || dayPlans.length === 0) return;
    
    const currentDay = dayPlans[currentDayIndex];
    const selectedTypes = Array.from(currentDay.selectedMealTypes);
    
    if (selectedTypes.length === 0) {
      alert('Please select at least one meal type (Breakfast, Lunch, or Dinner) to generate suggestions.');
      return;
    }

    setGenerating(true);
    try {
      const newSuggestions = new Map<MealType, MealSuggestion[]>();
      
      // Generate suggestions for each selected meal type
      for (const mealType of selectedTypes) {
        try {
          const suggestions = await mealPlanningService.generateDailySuggestions(
            user.uid,
            currentDay.date,
            mealType,
            currentDay.servingSize
          );
          newSuggestions.set(mealType, suggestions);
        } catch (error) {
          console.error(`Error generating suggestions for ${mealType}:`, error);
          // Continue with other meal types even if one fails
        }
      }
      
      // Update day plan with suggestions
      const newDayPlans = [...dayPlans];
      newDayPlans[currentDayIndex].suggestions = newSuggestions;
      setDayPlans(newDayPlans);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to generate meal suggestions. Please make sure you have set up your meal profile and have an OpenAI API key configured.';
      alert(`Failed to generate meal suggestions.\n\n${errorMessage}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectMeal = (mealType: MealType, suggestion: MealSuggestion) => {
    const newDayPlans = [...dayPlans];
    const currentDay = newDayPlans[currentDayIndex];
    
    currentDay[mealType] = suggestion;
    currentDay.skipped = false;
    
    setDayPlans(newDayPlans);
  };

  const handleChangeMeal = (mealType: MealType) => {
    const newDayPlans = [...dayPlans];
    delete newDayPlans[currentDayIndex][mealType];
    setDayPlans(newDayPlans);
  };

  const handleSkipDay = () => {
    const newDayPlans = [...dayPlans];
    newDayPlans[currentDayIndex].skipped = true;
    setDayPlans(newDayPlans);
    
    // Move to next day
    if (currentDayIndex < 6) {
      setCurrentDayIndex(currentDayIndex + 1);
    } else {
      // All days done, finish planning
      handleFinishPlanning();
    }
  };

  const handleNextDay = () => {
    if (currentDayIndex < 6) {
      setCurrentDayIndex(currentDayIndex + 1);
    } else {
      // All days done, finish planning
      handleFinishPlanning();
    }
  };

  const handleFinishPlanning = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Convert day plans to meal suggestions
      const selectedSuggestions: MealSuggestion[] = [];
      
      dayPlans.forEach(dayPlan => {
        if (!dayPlan.skipped) {
          if (dayPlan.breakfast) selectedSuggestions.push(dayPlan.breakfast!);
          if (dayPlan.lunch) selectedSuggestions.push(dayPlan.lunch!);
          if (dayPlan.dinner) selectedSuggestions.push(dayPlan.dinner!);
        }
      });

      if (selectedSuggestions.length === 0) {
        alert('No meals selected. Please select at least one meal or skip days.');
        setLoading(false);
        return;
      }

      // Create meal plan
      const mealPlan = await mealPlanningService.createMealPlan(user.uid, weekStart, selectedSuggestions);
      
      // Generate shopping list
      const shoppingList = await musgravesService.createShoppingListFromMealPlan(mealPlan);
      
      alert(`Meal plan created and shopping list "${shoppingList.name}" generated successfully!`);
      
      // Reset planning session
      setIsPlanning(false);
      setDayPlans([]);
      setCurrentDayIndex(0);
    } catch (error) {
      console.error('Error finishing planning:', error);
      alert('Failed to create meal plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentDay = () => {
    if (dayPlans.length === 0) return null;
    return dayPlans[currentDayIndex];
  };

  const getProgress = () => {
    let planned = 0;
    let total = 0;
    
    dayPlans.forEach(day => {
      if (day.skipped) {
        planned++;
        total++;
      } else {
        total++;
        // Day is considered planned if at least one meal is selected
        if (day.breakfast || day.lunch || day.dinner) {
          planned++;
        }
      }
    });
    
    return { planned, total };
  };

  const isDayComplete = (day: DayPlan) => {
    if (day.skipped) return true;
    const selectedTypes = Array.from(day.selectedMealTypes);
    if (selectedTypes.length === 0) return false;
    
    // Check if all selected meal types have a meal chosen
    return selectedTypes.every(mealType => day[mealType] !== undefined);
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to access meal planner.</p>
      </div>
    );
  }

  const currentDay = getCurrentDay();
  const progress = getProgress();
  const dayComplete = currentDay ? isDayComplete(currentDay) : false;

  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Meal Planner</h2>
        
        {!isPlanning ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ marginBottom: '2rem', color: '#666' }}>
              Start a 7-day meal planning session. Select which meals you want suggestions for each day.
            </p>
            <Button
              onClick={handleStartPlanning}
              size="large"
            >
              Start Planning Session
            </Button>
          </div>
        ) : (
          <div>
            {/* Progress indicator */}
            <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: '600' }}>Progress: {progress.planned} of {progress.total} days</span>
                <span style={{ fontSize: '0.875rem', color: '#666' }}>
                  Day {currentDayIndex + 1} of 7
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${(progress.planned / progress.total) * 100}%`, 
                    height: '100%', 
                    backgroundColor: '#002B4D',
                    transition: 'width 0.3s'
                  }} 
                />
              </div>
            </div>

            {currentDay && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>
                    {format(currentDay.date, 'EEEE, MMMM d')}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', color: '#666' }} htmlFor={`serving-size-${currentDayIndex}`}>
                      Serving size:
                    </label>
                    <div style={{ width: '80px' }}>
                      <Input
                        id={`serving-size-${currentDayIndex}`}
                        type="number"
                        value={(currentDay.servingSize || '').toString()}
                        onChange={(val) => {
                          const newPlans = [...dayPlans];
                          newPlans[currentDayIndex].servingSize = val ? parseInt(val) : undefined;
                          setDayPlans(newPlans);
                        }}
                        placeholder="Default"
                      />
                    </div>
                    <span style={{ fontSize: '0.875rem', color: '#666' }}>people</span>
                  </div>
                </div>
                
                {currentDay.skipped ? (
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                    <p style={{ color: '#666', marginBottom: '1rem' }}>This day has been skipped.</p>
                    <Button onClick={() => {
                      const newPlans = [...dayPlans];
                      newPlans[currentDayIndex].skipped = false;
                      setDayPlans(newPlans);
                    }}>
                      Plan This Day
                    </Button>
                  </div>
                ) : (
                  <div>
                    {/* Meal type checkboxes */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>Select meals to plan:</h4>
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        {MEAL_TYPES.map(mealType => (
                          <label
                            key={mealType.value}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              cursor: 'pointer',
                              userSelect: 'none'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={currentDay.selectedMealTypes.has(mealType.value)}
                              onChange={() => handleToggleMealType(mealType.value)}
                              style={{
                                width: '1.25rem',
                                height: '1.25rem',
                                cursor: 'pointer'
                              }}
                            />
                            <span style={{ fontSize: '1rem', fontWeight: '500' }}>{mealType.label}</span>
                          </label>
                        ))}
                      </div>
                      
                      {currentDay.selectedMealTypes.size > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                          <Button
                            onClick={handleGenerateSuggestions}
                            disabled={generating}
                            loading={generating}
                            fullWidth
                          >
                            {generating ? 'Generating Suggestions...' : `Generate Suggestions for ${Array.from(currentDay.selectedMealTypes).map(mt => MEAL_TYPES.find(m => m.value === mt)?.label).join(', ')}`}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Display suggestions and selected meals */}
                    {Array.from(currentDay.selectedMealTypes).map(mealType => {
                      const mealTypeLabel = MEAL_TYPES.find(m => m.value === mealType)?.label || mealType;
                      const selectedMeal = currentDay[mealType];
                      const suggestions = currentDay.suggestions.get(mealType) || [];
                      
                      return (
                        <div key={mealType} style={{ marginBottom: '2rem' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>{mealTypeLabel}</h4>
                          
                          {selectedMeal ? (
                            <div style={{ padding: '1rem', backgroundColor: '#f0f8ff', border: '2px solid #002B4D', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <strong>{selectedMeal.mealName}</strong>
                                  {selectedMeal.reasoning && (
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#666', fontStyle: 'italic' }}>
                                      {selectedMeal.reasoning}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() => handleChangeMeal(mealType)}
                                >
                                  Change
                                </Button>
                              </div>
                            </div>
                          ) : suggestions.length > 0 ? (
                            <div>
                              <p style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
                                Select one of the suggestions:
                              </p>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                {suggestions.map((suggestion, index) => (
                                  <div
                                    key={index}
                                    onClick={() => handleSelectMeal(mealType, suggestion)}
                                    style={{
                                      border: '2px solid #002B4D',
                                      borderRadius: '8px',
                                      padding: '1rem',
                                      cursor: 'pointer',
                                      backgroundColor: '#fff',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f0f8ff';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#fff';
                                    }}
                                  >
                                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{suggestion.mealName}</h4>
                                    {suggestion.reasoning && (
                                      <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', fontStyle: 'italic', color: '#666' }}>
                                        {suggestion.reasoning}
                                      </p>
                                    )}
                                    {suggestion.usesExpiringItems.length > 0 && (
                                      <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#d97706' }}>
                                        Uses {suggestion.usesExpiringItems.length} expiring item(s)
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                      <Button
                        variant="secondary"
                        onClick={handleSkipDay}
                      >
                        Skip This Day
                      </Button>
                      {dayComplete && (
                        <Button
                          onClick={handleNextDay}
                        >
                          {currentDayIndex < 6 ? 'Next Day' : 'Finish Planning'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Finish button - show when all days are done */}
            {progress.planned === progress.total && (
              <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ marginBottom: '1rem' }}>All days planned! Ready to generate your shopping list.</p>
                <Button
                  onClick={handleFinishPlanning}
                  disabled={loading}
                  loading={loading}
                  size="large"
                >
                  Finish Planning & Generate Shopping List
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default MealPlanner;
