import { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { FoodItem } from '../types';
import { foodItemService, userSettingsService } from '../services';
import { getFoodItemStatus } from '../utils/statusUtils';
import { timestampToDate } from '../utils/firestoreDateUtils';

interface UseFoodItemsOptions {
  defer?: number; // Delay in milliseconds before subscribing
}

const MAX_LOADING_TIMEOUT = 10000; // 10 seconds

export const useFoodItems = (user: User | null, options?: UseFoodItemsOptions) => {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderDays, setReminderDays] = useState(7);
  const subscriptionFiredRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      setFoodItems([]);
      setLoading(false);
      subscriptionFiredRef.current = false;
      return;
    }

    // Reset subscription fired flag
    subscriptionFiredRef.current = false;
    let unsubscribe: (() => void) | null = null;
    const deferMs = options?.defer || 0;

    // Force loading to false after timeout if subscription hasn't fired
    const forceLoadingTimeout = setTimeout(() => {
      if (!subscriptionFiredRef.current) {
        console.warn('Food items subscription timeout - forcing loading to false');
        setLoading(false);
        setFoodItems([]); // Show empty state instead of infinite loading
      }
    }, MAX_LOADING_TIMEOUT);
    timeoutIdRef.current = forceLoadingTimeout;

    const setupSubscription = () => {
      try {
        // Load user settings for reminder days
        userSettingsService.getUserSettings(user.uid)
          .then(settings => {
            if (settings) {
              setReminderDays(settings.reminderDays);
            }
            
            // Subscribe to food items after settings are loaded
            try {
              unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
                subscriptionFiredRef.current = true;
                // Clear the timeout since subscription fired
                if (timeoutIdRef.current) {
                  clearTimeout(timeoutIdRef.current);
                  timeoutIdRef.current = null;
                }
                
                // Update status for each item based on current date
                // Frozen items don't have expiration status, use 'fresh' as default
                const currentReminderDays = settings?.reminderDays || 7;
                const updatedItems = items.map(item => {
                  // Ensure bestByDate is a Date before calling getFoodItemStatus
                  let bestByDate: Date | null = null;
                  if (item.bestByDate) {
                    if (item.bestByDate instanceof Date) {
                      bestByDate = item.bestByDate;
                    } else {
                      bestByDate = timestampToDate(item.bestByDate) || null;
                    }
                  }
                  
                  return {
                    ...item,
                    status: item.isFrozen 
                      ? 'fresh' 
                      : (bestByDate instanceof Date 
                          ? getFoodItemStatus(bestByDate, currentReminderDays) 
                          : 'fresh')
                  };
                });
                setFoodItems(updatedItems);
                setLoading(false);
              });
            } catch (subscriptionError) {
              console.error('Error setting up food items subscription:', subscriptionError);
              subscriptionFiredRef.current = true;
              // Clear the timeout since we're handling the error
              if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
              }
              setFoodItems([]);
              setLoading(false);
            }
          })
          .catch(error => {
            console.error('Error loading user settings:', error);
            // Still try to subscribe to food items even if settings fail
            try {
              unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
                subscriptionFiredRef.current = true;
                // Clear the timeout since subscription fired
                if (timeoutIdRef.current) {
                  clearTimeout(timeoutIdRef.current);
                  timeoutIdRef.current = null;
                }
                
                // Frozen items don't have expiration status, use 'fresh' as default
                const updatedItems = items.map(item => {
                  // Ensure bestByDate is a Date before calling getFoodItemStatus
                  let bestByDate: Date | null = null;
                  if (item.bestByDate) {
                    if (item.bestByDate instanceof Date) {
                      bestByDate = item.bestByDate;
                    } else {
                      bestByDate = timestampToDate(item.bestByDate) || null;
                    }
                  }
                  
                  return {
                    ...item,
                    status: item.isFrozen 
                      ? 'fresh' 
                      : (bestByDate instanceof Date 
                          ? getFoodItemStatus(bestByDate, 7) 
                          : 'fresh') // Use default
                  };
                });
                setFoodItems(updatedItems);
                setLoading(false);
              });
            } catch (subscriptionError) {
              console.error('Error setting up food items subscription (fallback):', subscriptionError);
              subscriptionFiredRef.current = true;
              // Clear the timeout since we're handling the error
              if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
              }
              setFoodItems([]);
              setLoading(false);
            }
          });
      } catch (setupError) {
        console.error('Error in setupSubscription:', setupError);
        subscriptionFiredRef.current = true;
        // Clear the timeout since we're handling the error
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
        setFoodItems([]);
        setLoading(false);
      }
    };

    let deferTimeoutId: ReturnType<typeof setTimeout> | null = null;
    if (deferMs > 0) {
      deferTimeoutId = setTimeout(setupSubscription, deferMs);
    } else {
      setupSubscription();
    }

    return () => {
      // Clean up defer timeout
      if (deferTimeoutId) {
        clearTimeout(deferTimeoutId);
      }
      // Clean up loading timeout
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      // Clean up subscription
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, options?.defer]);

  return { foodItems, loading, reminderDays };
};

