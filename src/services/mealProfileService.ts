/**
 * Meal Profile Service
 * Handles user meal preferences and schedule management
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type {
  MealProfile,
  MealSchedule,
  ScheduleAmendment,
  FirestoreUpdateData
} from '../types';
import { logServiceOperation, logServiceError, cleanFirestoreData } from './baseService';
import { toServiceError } from './errors';
import { startOfDay, addDays, isSameDay } from 'date-fns';

/**
 * Meal Profile Service
 */
export const mealProfileService = {
  /**
   * Get user meal profile
   */
  async getMealProfile(userId: string): Promise<MealProfile | null> {
    logServiceOperation('getMealProfile', 'mealProfiles', { userId });
    
    try {
      const docRef = doc(db, 'mealProfiles', userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...data,
          usualSchedule: (data.usualSchedule || []).map((day: any) => ({
            ...day,
            // Ensure dates are Date objects if they exist
          })),
          scheduleAmendments: (data.scheduleAmendments || []).map((amendment: any) => ({
            ...amendment,
            date: amendment.date?.toDate ? amendment.date.toDate() : new Date(amendment.date),
            createdAt: amendment.createdAt?.toDate ? amendment.createdAt.toDate() : new Date(amendment.createdAt),
            recurringPattern: amendment.recurringPattern ? {
              ...amendment.recurringPattern,
              endDate: amendment.recurringPattern.endDate?.toDate 
                ? amendment.recurringPattern.endDate.toDate() 
                : amendment.recurringPattern.endDate ? new Date(amendment.recurringPattern.endDate) : undefined
            } : undefined
          })),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)
        } as MealProfile;
      }
      return null;
    } catch (error) {
      logServiceError('getMealProfile', 'mealProfiles', error, { userId });
      throw toServiceError(error, 'mealProfiles');
    }
  },

  /**
   * Create or update meal profile
   */
  async updateMealProfile(profile: MealProfile): Promise<void> {
    logServiceOperation('updateMealProfile', 'mealProfiles', { userId: profile.userId });
    
    try {
      const docRef = doc(db, 'mealProfiles', profile.userId);
      const docSnap = await getDoc(docRef);
      
      const cleanData = cleanFirestoreData({
        ...profile,
        updatedAt: Timestamp.now(),
        createdAt: docSnap.exists() 
          ? (docSnap.data().createdAt || Timestamp.now())
          : Timestamp.now()
      });
      
      if (docSnap.exists()) {
        await updateDoc(docRef, cleanData as FirestoreUpdateData<MealProfile>);
      } else {
        await setDoc(docRef, cleanData);
      }
    } catch (error) {
      logServiceError('updateMealProfile', 'mealProfiles', error, { userId: profile.userId });
      throw toServiceError(error, 'mealProfiles');
    }
  },

  /**
   * Get effective schedule for a specific date
   * Combines usual schedule with amendments
   */
  async getEffectiveSchedule(userId: string, date: Date): Promise<MealSchedule> {
    logServiceOperation('getEffectiveSchedule', 'mealProfiles', { userId, date });
    
    try {
      const profile = await this.getMealProfile(userId);
      if (!profile) {
        // Return default schedule if no profile exists
        return {
          date,
          meals: []
        };
      }

      const dayOfWeek = date.getDay();
      const usualDay = profile.usualSchedule.find(d => d.dayOfWeek === dayOfWeek);
      
      // Start with usual schedule
      let meals = usualDay ? [...usualDay.meals] : [];

      // Apply amendments
      const applicableAmendments = profile.scheduleAmendments.filter(amendment => {
        const amendmentDate = startOfDay(amendment.date);
        const checkDate = startOfDay(date);

        // Check if amendment applies to this date
        if (amendment.isRecurring && amendment.recurringPattern) {
          const pattern = amendment.recurringPattern;
          
          if (pattern.frequency === 'weekly' && pattern.dayOfWeek === dayOfWeek) {
            // Weekly recurring - check if before end date
            if (!pattern.endDate || date <= pattern.endDate) {
              return true;
            }
          } else if (pattern.frequency === 'monthly' && pattern.dayOfMonth === date.getDate()) {
            // Monthly recurring - check if before end date
            if (!pattern.endDate || date <= pattern.endDate) {
              return true;
            }
          }
        } else if (isSameDay(amendmentDate, checkDate)) {
          // One-time amendment
          return true;
        }

        return false;
      });

      // Apply amendments (they override usual schedule)
      applicableAmendments.forEach(amendment => {
        // Remove meals that match the amendment's meal types
        meals = meals.filter(meal => !amendment.mealTypes.includes(meal.type));
        
        // Add amended meals
        amendment.mealTypes.forEach(mealType => {
          meals.push({
            type: mealType,
            finishBy: amendment.finishBy || (usualDay?.meals.find(m => m.type === mealType)?.finishBy || '18:00')
          });
        });
      });

      return {
        date,
        meals
      };
    } catch (error) {
      logServiceError('getEffectiveSchedule', 'mealProfiles', error, { userId, date });
      throw toServiceError(error, 'mealProfiles');
    }
  }
};

