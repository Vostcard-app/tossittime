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
  const reminderDaysRef = useRef(7);

  useEffect(() => {
    if (!user) {
      setFoodItems([]);
      setLoading(false);
      subscriptionFiredRef.current = false;
      return;
    }

    // Reset subscription fired flag and reminder days ref
    subscriptionFiredRef.current = false;
    reminderDaysRef.current = 7;
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

    const applyStatus = (items: FoodItem[]) => {
      const currentReminderDays = reminderDaysRef.current;
      return items.map(item => {
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
    };

    const setupSubscription = () => {
      try {
        // Start settings and subscription in parallel (don't block subscription on settings)
        userSettingsService.getUserSettings(user.uid)
          .then(settings => {
            if (settings) {
              reminderDaysRef.current = settings.reminderDays;
              setReminderDays(settings.reminderDays);
            }
          })
          .catch(error => {
            console.error('Error loading user settings:', error);
          });

        unsubscribe = foodItemService.subscribeToFoodItems(user.uid, (items) => {
          subscriptionFiredRef.current = true;
          if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
          }
          setFoodItems(applyStatus(items));
          setLoading(false);
        });
      } catch (setupError) {
        console.error('Error in setupSubscription:', setupError);
        subscriptionFiredRef.current = true;
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

