/**
 * Print Meal List Page
 * Displays 21 meals chronologically starting from selected date
 * Shows date headers with tappable meal names (B/L/D prefix) and toggleable ingredients
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/firebaseConfig';
import { mealPlanningService } from '../services';
import type { PlannedMeal, MealType } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { format, parseISO, startOfDay } from 'date-fns';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D'
};


const PrintMealList: React.FC = () => {
  const [user] = useAuthState(auth);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      try {
        return startOfDay(parseISO(dateParam));
      } catch {
        return startOfDay(new Date());
      }
    }
    return startOfDay(new Date());
  });
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Load 21 meals starting from the selected date
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadMeals = async () => {
      try {
        setLoading(true);
        const loadedMeals = await mealPlanningService.loadMealsFromDate(user.uid, selectedDate, 21);
        
        // Normalize meal dates to start of day for consistent comparison
        const normalizedMeals = loadedMeals.map(meal => ({
          ...meal,
          date: startOfDay(meal.date)
        }));
        
        setMeals(normalizedMeals);
      } catch (error) {
        console.error('Error loading meals:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMeals();
  }, [user, selectedDate]);

  // Toggle ingredients visibility
  const toggleIngredients = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Group meals by date for display
  const mealsByDate = useMemo(() => {
    const grouped: Record<string, PlannedMeal[]> = {};
    
    meals.forEach(meal => {
      const dateKey = format(meal.date, 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(meal);
    });
    
    // Sort meals within each date by meal type
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const mealTypeOrder: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };
        return mealTypeOrder[a.mealType] - mealTypeOrder[b.mealType];
      });
    });
    
    return grouped;
  }, [meals]);
  
  // Get sorted dates
  const sortedDates = useMemo(() => {
    return Object.keys(mealsByDate).sort();
  }, [mealsByDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = startOfDay(new Date(e.target.value));
    setSelectedDate(newDate);
    setSearchParams({ date: format(newDate, 'yyyy-MM-dd') });
  };

  const handlePrint = () => {
    window.print();
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view meal lists.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading meals...</p>
      </div>
    );
  }


  return (
    <>
      <Banner showLogo={false} onMenuClick={() => setMenuOpen(true)} />
      <div className="no-print">
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Controls - Hidden when printing */}
        <div className="no-print" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                Start Date:
              </label>
              <input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={handleDateChange}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              />
            </div>
            
            <button
              onClick={handlePrint}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              Print
            </button>
          </div>
        </div>

        {/* Printable Content */}
        <div className="printable-content">
          {/* Header */}
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                Meal List
              </h1>
              <button
                onClick={() => navigate('/planned-meal-calendar')}
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
                Calendar
              </button>
            </div>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.25rem', color: '#6b7280' }}>
              {meals.length} meal{meals.length !== 1 ? 's' : ''} starting from {format(selectedDate, 'MMMM d, yyyy')}
            </p>
          </div>

          {/* Meals List - Chronological by Date */}
          {sortedDates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280' }}>
              <p style={{ fontSize: '1.25rem', margin: 0 }}>
                No meals planned starting from {format(selectedDate, 'MMMM d, yyyy')}
              </p>
            </div>
          ) : (
            sortedDates.map(dateKey => {
              const dateMeals = mealsByDate[dateKey];
              const date = parseISO(dateKey);
              
              return (
                <div key={dateKey} style={{ marginBottom: '2rem', pageBreakInside: 'avoid' }}>
                  {/* Date Header */}
                  <h2 style={{ 
                    margin: '0 0 1rem 0', 
                    fontSize: '1.5rem', 
                    fontWeight: '600', 
                    color: '#1f2937',
                    borderBottom: '2px solid #002B4D',
                    paddingBottom: '0.5rem'
                  }}>
                    {format(date, 'EEEE, MMMM d, yyyy')}
                  </h2>
                  
                  {/* Meals for this date */}
                  {dateMeals.map(meal => (
                    <div key={meal.id} style={{ marginBottom: '1rem', marginLeft: '1rem' }}>
                      {meal.dishes && meal.dishes.length > 0 ? (
                        meal.dishes.map(dish => {
                          const itemId = `${meal.id}-${dish.id}`;
                          const isExpanded = expandedItems.has(itemId);
                          const hasIngredients = dish.recipeIngredients && dish.recipeIngredients.length > 0;
                          
                          return (
                            <div key={dish.id} style={{ marginBottom: '0.75rem' }}>
                              <div
                                onClick={() => hasIngredients && toggleIngredients(itemId)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  cursor: hasIngredients ? 'pointer' : 'default',
                                  padding: '0.25rem 0',
                                  transition: 'background-color 0.2s',
                                  borderRadius: '4px'
                                }}
                                onMouseEnter={(e) => {
                                  if (hasIngredients) {
                                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (hasIngredients) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }
                                }}
                              >
                                {hasIngredients && (
                                  <span style={{
                                    fontSize: '0.875rem',
                                    color: '#6b7280',
                                    transition: 'transform 0.2s',
                                    display: 'inline-block',
                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                                  }}>
                                    ▶
                                  </span>
                                )}
                                <p style={{ 
                                  margin: 0,
                                  fontSize: '1.125rem', 
                                  fontWeight: '600', 
                                  color: '#1f2937',
                                  flex: 1
                                }}>
                                  {MEAL_TYPE_LABELS[meal.mealType]}: {dish.dishName}
                                </p>
                              </div>
                              {isExpanded && hasIngredients && (
                                <div style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                                  {/* Recipe Link - Show at top if URL exists */}
                                  {dish.recipeSourceUrl && (
                                    <a
                                      href={dish.recipeSourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'block',
                                        marginBottom: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        backgroundColor: '#f0f8ff',
                                        color: '#002B4D',
                                        textDecoration: 'none',
                                        borderRadius: '4px',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        border: '1px solid #002B4D',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#e0f2fe';
                                        e.currentTarget.style.textDecoration = 'underline';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f0f8ff';
                                        e.currentTarget.style.textDecoration = 'none';
                                      }}
                                    >
                                      📖 View Recipe
                                    </a>
                                  )}
                                  
                                  {/* Ingredients List */}
                                  <ul style={{ 
                                    margin: 0,
                                    paddingLeft: '1rem',
                                    listStyle: 'disc',
                                    fontSize: '0.875rem',
                                    color: '#6b7280'
                                  }}>
                                    {dish.recipeIngredients.map((ingredient, idx) => (
                                      <li key={idx} style={{ marginBottom: '0.25rem' }}>
                                        {ingredient}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          No dishes planned
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 1in;
          }
          
          .no-print {
            display: none !important;
          }
          
          body {
            background: white !important;
          }
          
          .printable-content {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          h1, h2, p {
            color: #000 !important;
          }
          
          /* Prevent page breaks inside meal sections */
          div[style*="pageBreakInside"] {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
};

export default PrintMealList;
