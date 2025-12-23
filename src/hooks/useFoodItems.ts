import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { FoodItem } from '../types';
import { foodItemService, userSettingsService } from '../services/firebaseService';
import { getFoodItemStatus } from '../utils/statusUtils';

export const useFoodItems = (user: User | null) => {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderDays, setReminderDays] = useState(7);

  useEffect(() => {
    if (!user) {
      setFoodItems([]);
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    // Load user settings for reminder days
    userSettingsService.getUserSettings(user.uid)
      .then(settings => {
      if (settings) {
        setReminderDays(settings.reminderDays);
      }
      
      // Subscribe to food items after settings are loaded
      unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
        // Update status for each item based on current date
        // Frozen items don't have expiration status, use 'fresh' as default
        const currentReminderDays = settings?.reminderDays || 7;
        const updatedItems = items.map(item => ({
          ...item,
          status: item.isFrozen ? 'fresh' : (item.expirationDate ? getFoodItemStatus(item.expirationDate, currentReminderDays) : 'fresh')
        }));
        setFoodItems(updatedItems);
        setLoading(false);
      });
      })
      .catch(error => {
        console.error('Error loading user settings:', error);
        // Still try to subscribe to food items even if settings fail
        unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
          // Frozen items don't have expiration status, use 'fresh' as default
          const updatedItems = items.map(item => ({
            ...item,
            status: item.isFrozen ? 'fresh' : (item.expirationDate ? getFoodItemStatus(item.expirationDate, 7) : 'fresh') // Use default
          }));
          setFoodItems(updatedItems);
          setLoading(false);
        });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  return { foodItems, loading, reminderDays };
};

