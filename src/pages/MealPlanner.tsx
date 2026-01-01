/**
 * Meal Planner Page
 * Day-by-day meal planning session
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
  const [currentMealTypeIndex, setCurrentMealTypeIndex] = useState(0);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  const [currentSuggestions, setCurrentSuggestions] = useState<MealSuggestion[]>([]);
  
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  // Initialize day plans
  useEffect(() => {
    if (isPlanning && dayPlans.length === 0) {
      const plans: DayPlan[] = [];
      for (let i = 0; i < 7; i++) {
        plans.push({
          date: addDays(weekStart, i),
          skipped: false
        });
      }
      setDayPlans(plans);
    }
  }, [isPlanning, weekStart, dayPlans.length]);

  // Load suggestions when day/meal changes
  useEffect(() => {
    if (!isPlanning || !user || dayPlans.length === 0) return;

    const loadSuggestions = async () => {
      const currentDay = dayPlans[currentDayIndex];
      const currentMealType = MEAL_TYPES[currentMealTypeIndex].value;
      
      // Check if already planned
      if (currentDay[currentMealType] || currentDay.skipped) {
        setCurrentSuggestions([]);
        return;
      }

      setGenerating(true);
      try {
        const suggestions = await mealPlanningService.generateDailySuggestions(
          user.uid,
          currentDay.date,
          currentMealType,
          currentDay.servingSize // Pass day-specific serving size
        );
        setCurrentSuggestions(suggestions);
      } catch (error) {
        console.error('Error generating suggestions:', error);
        alert('Failed to generate meal suggestions. Please make sure you have set up your meal profile and have an OpenAI API key configured.');
        setCurrentSuggestions([]);
      } finally {
        setGenerating(false);
      }
    };

    loadSuggestions();
  }, [isPlanning, currentDayIndex, currentMealTypeIndex, user, dayPlans]);

  const handleStartPlanning = () => {
    setIsPlanning(true);
    setCurrentDayIndex(0);
    setCurrentMealTypeIndex(0);
  };

  const handleSelectMeal = (suggestion: MealSuggestion) => {
    const newDayPlans = [...dayPlans];
    const currentDay = newDayPlans[currentDayIndex];
    const currentMealType = MEAL_TYPES[currentMealTypeIndex].value;
    
    currentDay[currentMealType] = suggestion;
    currentDay.skipped = false;
    
    setDayPlans(newDayPlans);
    setCurrentSuggestions([]);
    
    // Move to next meal type or next day
    moveToNext();
  };

  const handleSkipDay = () => {
    const newDayPlans = [...dayPlans];
    newDayPlans[currentDayIndex].skipped = true;
    setDayPlans(newDayPlans);
    setCurrentSuggestions([]);
    
    // Move to next day
    if (currentDayIndex < 6) {
      setCurrentDayIndex(currentDayIndex + 1);
      setCurrentMealTypeIndex(0);
    } else {
      // All days done, finish planning
      handleFinishPlanning();
    }
  };

  const moveToNext = () => {
    // Move to next meal type
    if (currentMealTypeIndex < MEAL_TYPES.length - 1) {
      setCurrentMealTypeIndex(currentMealTypeIndex + 1);
    } else {
      // Move to next day
      if (currentDayIndex < 6) {
        setCurrentDayIndex(currentDayIndex + 1);
        setCurrentMealTypeIndex(0);
      } else {
        // All days done, finish planning
        handleFinishPlanning();
      }
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
      setCurrentMealTypeIndex(0);
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
        if (day.breakfast || day.lunch || day.dinner) {
          planned++;
        }
      }
    });
    
    return { planned, total };
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

  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Meal Planner</h2>
        
        {!isPlanning ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ marginBottom: '2rem', color: '#666' }}>
              Start a 7-day meal planning session. We'll guide you through each day, 
              suggesting meals based on your expiring food items and preferences.
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
                      setCurrentMealTypeIndex(0);
                    }}>
                      Plan This Day
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ marginBottom: '0.5rem' }}>
                        {MEAL_TYPES[currentMealTypeIndex].label}
                      </h4>
                      
                      {currentDay[MEAL_TYPES[currentMealTypeIndex].value] ? (
                        <div style={{ padding: '1rem', backgroundColor: '#f0f8ff', border: '2px solid #002B4D', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong>{currentDay[MEAL_TYPES[currentMealTypeIndex].value]!.mealName}</strong>
                              {currentDay[MEAL_TYPES[currentMealTypeIndex].value]!.reasoning && (
                                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#666', fontStyle: 'italic' }}>
                                  {currentDay[MEAL_TYPES[currentMealTypeIndex].value]!.reasoning}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => {
                                const newPlans = [...dayPlans];
                                delete newPlans[currentDayIndex][MEAL_TYPES[currentMealTypeIndex].value];
                                setDayPlans(newPlans);
                                setCurrentSuggestions([]);
                              }}
                            >
                              Change
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {generating ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                              <p>Generating suggestions...</p>
                            </div>
                          ) : currentSuggestions.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                              {currentSuggestions.map((suggestion, index) => (
                                <div
                                  key={index}
                                  onClick={() => handleSelectMeal(suggestion)}
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
                          ) : (
                            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                              <p style={{ color: '#666' }}>No suggestions available. You can skip this meal.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                      {!currentDay[MEAL_TYPES[currentMealTypeIndex].value] && (
                        <Button
                          variant="text"
                          onClick={moveToNext}
                        >
                          Skip This Meal
                        </Button>
                      )}
                      {currentMealTypeIndex === MEAL_TYPES.length - 1 && (
                        <Button
                          variant="secondary"
                          onClick={handleSkipDay}
                        >
                          Skip Entire Day
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
