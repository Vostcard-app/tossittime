/**
 * Meal Profile Page
 * User interface for managing meal preferences and schedule
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { mealProfileService } from '../services';
import type { MealProfile, WeeklyScheduleDay, ScheduleAmendment } from '../types';
import Banner from '../components/layout/Banner';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const MealProfile: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MealProfile | null>(null);
  
  // Form state
  const [dislikedFoods, setDislikedFoods] = useState<string>('');
  const [foodPreferences, setFoodPreferences] = useState<string>('');
  const [breakfastDuration, setBreakfastDuration] = useState<number>(20);
  const [lunchDuration, setLunchDuration] = useState<number>(30);
  const [dinnerDuration, setDinnerDuration] = useState<number>(40);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const userProfile = await mealProfileService.getMealProfile(user.uid);
        if (userProfile) {
          setProfile(userProfile);
          setDislikedFoods(userProfile.dislikedFoods.join(', '));
          setFoodPreferences(userProfile.foodPreferences.join(', '));
          setBreakfastDuration(userProfile.mealDurationPreferences.breakfast);
          setLunchDuration(userProfile.mealDurationPreferences.lunch);
          setDinnerDuration(userProfile.mealDurationPreferences.dinner);
        } else {
          // Initialize with defaults
          setProfile({
            userId: user.uid,
            dislikedFoods: [],
            foodPreferences: [],
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

  const handleSave = async () => {
    if (!user || !profile) return;

    setSaving(true);
    try {
      const updatedProfile: MealProfile = {
        ...profile,
        dislikedFoods: dislikedFoods.split(',').map(f => f.trim()).filter(f => f),
        foodPreferences: foodPreferences.split(',').map(f => f.trim()).filter(f => f),
        mealDurationPreferences: {
          breakfast: breakfastDuration,
          lunch: lunchDuration,
          dinner: dinnerDuration
        },
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
            style={{ width: '100%' }}
          >
            {saving ? 'Saving...' : 'Save Meal Profile'}
          </Button>
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#666' }}>
            <strong>Note:</strong> Schedule management and amendments will be available in a future update.
            For now, you can set your basic preferences above.
          </p>
        </div>
      </div>
    </>
  );
};

export default MealProfile;

