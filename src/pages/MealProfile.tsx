/**
 * Meal Profile Page
 * User interface for managing meal preferences and schedule
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealProfileService } from '../services';
import type { MealProfile, WeeklyScheduleDay, MealType } from '../types';
import Banner from '../components/layout/Banner';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' }
];

const MealProfile: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MealProfile | null>(null);
  
  // Form state
  const [dislikedFoods, setDislikedFoods] = useState<string>('');
  const [foodPreferences, setFoodPreferences] = useState<string>('');
  const [favoriteMeals, setFavoriteMeals] = useState<string>('');
  const [servingSize, setServingSize] = useState<number>(2);
  const [breakfastDuration, setBreakfastDuration] = useState<number>(20);
  const [lunchDuration, setLunchDuration] = useState<number>(30);
  const [dinnerDuration, setDinnerDuration] = useState<number>(40);
  
  // Schedule state - one entry per day of week
  const [schedule, setSchedule] = useState<Map<number, { type: MealType; finishBy: string }[]>>(new Map());

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const userProfile = await mealProfileService.getMealProfile(user.uid);
        if (userProfile) {
          setProfile(userProfile);
          setDislikedFoods(userProfile.dislikedFoods.join(', '));
          setFoodPreferences(userProfile.foodPreferences.join(', '));
          setFavoriteMeals((userProfile.favoriteMeals || []).join(', '));
          setServingSize(userProfile.servingSize || 2);
          setBreakfastDuration(userProfile.mealDurationPreferences.breakfast);
          setLunchDuration(userProfile.mealDurationPreferences.lunch);
          setDinnerDuration(userProfile.mealDurationPreferences.dinner);
          
          // Load schedule
          const scheduleMap = new Map<number, { type: MealType; finishBy: string }[]>();
          userProfile.usualSchedule.forEach(day => {
            scheduleMap.set(day.dayOfWeek, day.meals);
          });
          setSchedule(scheduleMap);
        } else {
          // Initialize with defaults
          setProfile({
            userId: user.uid,
            dislikedFoods: [],
            foodPreferences: [],
            favoriteMeals: [],
            servingSize: 2,
            mealDurationPreferences: {
              breakfast: 20,
              lunch: 30,
              dinner: 40
            },
            usualSchedule: [],
            scheduleAmendments: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      } catch (error) {
        console.error('Error loading meal profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleAddMealToDay = (dayOfWeek: number, mealType: MealType, finishBy: string) => {
    const newSchedule = new Map(schedule);
    const dayMeals = newSchedule.get(dayOfWeek) || [];
    
    // Check if meal type already exists for this day
    const existingIndex = dayMeals.findIndex(m => m.type === mealType);
    if (existingIndex >= 0) {
      dayMeals[existingIndex] = { type: mealType, finishBy };
    } else {
      dayMeals.push({ type: mealType, finishBy });
    }
    
    newSchedule.set(dayOfWeek, dayMeals);
    setSchedule(newSchedule);
  };

  const handleRemoveMealFromDay = (dayOfWeek: number, mealType: MealType) => {
    const newSchedule = new Map(schedule);
    const dayMeals = newSchedule.get(dayOfWeek) || [];
    const filtered = dayMeals.filter(m => m.type !== mealType);
    
    if (filtered.length === 0) {
      newSchedule.delete(dayOfWeek);
    } else {
      newSchedule.set(dayOfWeek, filtered);
    }
    setSchedule(newSchedule);
  };

  const handleSave = async () => {
    if (!user || !profile) return;

    setSaving(true);
    try {
      // Convert schedule map to WeeklyScheduleDay array
      const usualSchedule: WeeklyScheduleDay[] = [];
      schedule.forEach((meals, dayOfWeek) => {
        if (meals.length > 0) {
          usualSchedule.push({
            dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
            meals
          });
        }
      });

      const updatedProfile: MealProfile = {
        ...profile,
        dislikedFoods: dislikedFoods.split(',').map(f => f.trim()).filter(f => f),
        foodPreferences: foodPreferences.split(',').map(f => f.trim()).filter(f => f),
        favoriteMeals: favoriteMeals.split(',').map(f => f.trim()).filter(f => f),
        servingSize,
        mealDurationPreferences: {
          breakfast: breakfastDuration,
          lunch: lunchDuration,
          dinner: dinnerDuration
        },
        usualSchedule,
        updatedAt: new Date()
      };

      await mealProfileService.updateMealProfile(updatedProfile);
      setProfile(updatedProfile);
      alert('Meal profile saved successfully!');
    } catch (error) {
      console.error('Error saving meal profile:', error);
      alert('Failed to save meal profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading meal profile...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to access meal profile.</p>
      </div>
    );
  }

  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginBottom: '2rem' }}>Meal Profile</h2>
        
        <div style={{ marginBottom: '2rem' }}>
          <h3>Food Preferences</h3>
          
          <Input
            label="Disliked Foods"
            value={dislikedFoods}
            onChange={setDislikedFoods}
            placeholder="e.g., mushrooms, olives, spicy food"
            helperText="Separate multiple items with commas"
          />
          
          <Input
            label="Dietary Preferences"
            value={foodPreferences}
            onChange={setFoodPreferences}
            placeholder="e.g., vegetarian, vegan, gluten-free"
            helperText="Separate multiple preferences with commas"
          />

          <Input
            label="Favorite Meals"
            value={favoriteMeals}
            onChange={setFavoriteMeals}
            placeholder="e.g., spaghetti carbonara, chicken stir-fry, salmon teriyaki"
            helperText="Separate multiple meals with commas. These will be prioritized in meal suggestions."
          />

          <Input
            label="Serving Size"
            type="number"
            value={servingSize.toString()}
            onChange={(val) => setServingSize(parseInt(val) || 2)}
            helperText="Number of people meals should typically feed"
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>Weekly Schedule</h3>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Set when meals should be ready by for each day of the week.
          </p>
          
          {DAYS_OF_WEEK.map(day => {
            const dayMeals = schedule.get(day.value) || [];
            return (
              <div key={day.value} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>{day.label}</h4>
                
                {MEAL_TYPES.map(mealType => {
                  const existingMeal = dayMeals.find(m => m.type === mealType.value);
                  const finishBy = existingMeal?.finishBy || '';
                  
                  return (
                    <div key={mealType.value} style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ minWidth: '100px', fontSize: '0.9rem' }}>{mealType.label}:</span>
                      <input
                        type="time"
                        value={finishBy}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddMealToDay(day.value, mealType.value, e.target.value);
                          }
                        }}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '1rem'
                        }}
                      />
                      {existingMeal && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => handleRemoveMealFromDay(day.value, mealType.value)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>Meal Duration Preferences</h3>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            How much time do you typically allow for each meal type?
          </p>
          
          <Input
            label="Breakfast Duration (minutes)"
            type="number"
            value={breakfastDuration.toString()}
            onChange={(val) => setBreakfastDuration(parseInt(val) || 20)}
          />
          
          <Input
            label="Lunch Duration (minutes)"
            type="number"
            value={lunchDuration.toString()}
            onChange={(val) => setLunchDuration(parseInt(val) || 30)}
          />
          
          <Input
            label="Dinner Duration (minutes)"
            type="number"
            value={dinnerDuration.toString()}
            onChange={(val) => setDinnerDuration(parseInt(val) || 40)}
          />
        </div>

        <div style={{ marginTop: '2rem' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            loading={saving}
            fullWidth
          >
            Save Meal Profile
          </Button>
        </div>
      </div>
    </>
  );
};

export default MealProfile;
