/**
 * Meal Planner Page
 * Main meal planning interface
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService, musgravesService } from '../services';
import type { MealPlan, MealSuggestion } from '../types';
import Banner from '../components/layout/Banner';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Button from '../components/ui/Button';
import { startOfWeek, addDays, format } from 'date-fns';

const MealPlanner: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<Set<string>>(new Set());
  
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  useEffect(() => {
    if (!user) return;

    const loadMealPlan = async () => {
      try {
        const plan = await mealPlanningService.getMealPlan(user.uid, weekStart);
        if (plan) {
          setMealPlan(plan);
        }
      } catch (error) {
        console.error('Error loading meal plan:', error);
      }
    };

    loadMealPlan();
  }, [user, weekStart]);

  const handleGenerateSuggestions = async () => {
    if (!user) return;

    setGenerating(true);
    try {
      const newSuggestions = await mealPlanningService.generateMealSuggestions(user.uid, weekStart);
      setSuggestions(newSuggestions);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      alert('Failed to generate meal suggestions. Please make sure you have set up your meal profile and have an OpenAI API key configured.');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleMeal = (mealName: string) => {
    const newSelected = new Set(selectedMeals);
    if (newSelected.has(mealName)) {
      newSelected.delete(mealName);
    } else {
      newSelected.add(mealName);
    }
    setSelectedMeals(newSelected);
  };

  const handleCreateMealPlan = async () => {
    if (!user || selectedMeals.size === 0) return;

    setLoading(true);
    try {
      const selectedSuggestions = suggestions.filter(s => selectedMeals.has(s.mealName));
      const plan = await mealPlanningService.createMealPlan(user.uid, weekStart, selectedSuggestions);
      setMealPlan(plan);
      setSuggestions([]);
      setSelectedMeals(new Set());
      alert('Meal plan created successfully!');
    } catch (error) {
      console.error('Error creating meal plan:', error);
      alert('Failed to create meal plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShoppingList = async () => {
    if (!user || !mealPlan) return;

    setLoading(true);
    try {
      const shoppingList = await musgravesService.createShoppingListFromMealPlan(mealPlan);
      alert(`Shopping list "${shoppingList.name}" created successfully!`);
    } catch (error) {
      console.error('Error creating shopping list:', error);
      alert('Failed to create shopping list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to access meal planner.</p>
      </div>
    );
  }

  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Meal Planner</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Week of {format(weekStart, 'MMMM d, yyyy')}
        </p>

        {!mealPlan && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ marginBottom: '2rem', color: '#666' }}>
              Generate AI-powered meal suggestions based on your expiring food items and preferences.
            </p>
            <Button
              onClick={handleGenerateSuggestions}
              disabled={generating}
              loading={generating}
              size="large"
            >
              {generating ? 'Generating Suggestions...' : 'Generate Meal Suggestions'}
            </Button>
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3>Meal Suggestions</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              Select the meals you'd like to include in your meal plan:
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  onClick={() => handleToggleMeal(suggestion.mealName)}
                  style={{
                    border: selectedMeals.has(suggestion.mealName) ? '2px solid #002B4D' : '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    backgroundColor: selectedMeals.has(suggestion.mealName) ? '#f0f8ff' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0 }}>{suggestion.mealName}</h4>
                    <input
                      type="checkbox"
                      checked={selectedMeals.has(suggestion.mealName)}
                      onChange={() => handleToggleMeal(suggestion.mealName)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#666' }}>
                    {suggestion.mealType} • {format(new Date(suggestion.date), 'MMM d')}
                  </p>
                  {suggestion.reasoning && (
                    <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', fontStyle: 'italic', color: '#888' }}>
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

            <Button
              onClick={handleCreateMealPlan}
              disabled={selectedMeals.size === 0 || loading}
              loading={loading}
              size="large"
              fullWidth
            >
              Create Meal Plan ({selectedMeals.size} selected)
            </Button>
          </div>
        )}

        {mealPlan && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Your Meal Plan</h3>
              <Button
                onClick={handleCreateShoppingList}
                disabled={loading}
                loading={loading}
              >
                Create Shopping List
              </Button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {Array.from({ length: 7 }).map((_, dayIndex) => {
                const date = addDays(weekStart, dayIndex);
                const dayMeals = mealPlan.meals.filter(meal => {
                  const mealDate = new Date(meal.date);
                  return mealDate.toDateString() === date.toDateString();
                });

                return (
                  <div
                    key={dayIndex}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '1rem'
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{format(date, 'EEEE, MMM d')}</h4>
                    {dayMeals.length === 0 ? (
                      <p style={{ color: '#999', fontStyle: 'italic' }}>No meals planned</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {dayMeals.map((meal) => (
                          <div
                            key={meal.id}
                            style={{
                              padding: '0.75rem',
                              backgroundColor: '#f9fafb',
                              borderRadius: '4px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <strong>{meal.mealName}</strong>
                                <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.875rem' }}>
                                  ({meal.mealType})
                                </span>
                              </div>
                              {meal.startCookingAt && (
                                <span style={{ fontSize: '0.875rem', color: '#666' }}>
                                  Start: {meal.startCookingAt}
                                </span>
                              )}
                            </div>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#666' }}>
                              Ready by: {meal.finishBy}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default MealPlanner;

