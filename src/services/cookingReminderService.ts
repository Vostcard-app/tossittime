/**
 * Cooking Reminder Service
 * Handles scheduling cooking reminders based on meal plans
 */

import type { MealPlan, PlannedMeal } from '../types';
import { notificationService } from './notificationService';
import { logServiceOperation, logServiceError } from './baseService';

// Store active reminder IDs for cancellation
const activeReminders = new Map<string, number[]>();

/**
 * Cooking Reminder Service
 */
export const cookingReminderService = {
  /**
   * Schedule cooking reminders for a meal plan
   */
  async scheduleCookingReminders(mealPlan: MealPlan): Promise<void> {
    logServiceOperation('scheduleCookingReminders', 'cookingReminders', { mealPlanId: mealPlan.id });

    try {
      const reminderIds: number[] = [];

      for (const meal of mealPlan.meals) {
        if (!meal.confirmed || meal.skipped || !meal.startCookingAt) {
          continue;
        }

        // Calculate reminder time (15 minutes before start cooking)
        const reminderTime = this.calculateReminderTime(meal);
        
        if (reminderTime && reminderTime > Date.now()) {
          const reminderId = await this.scheduleReminder(meal, reminderTime);
          if (reminderId) {
            reminderIds.push(reminderId);
          }
        }
      }

      // Store reminder IDs for this meal plan
      activeReminders.set(mealPlan.id, reminderIds);
    } catch (error) {
      logServiceError('scheduleCookingReminders', 'cookingReminders', error, { mealPlanId: mealPlan.id });
      throw error;
    }
  },

  /**
   * Cancel cooking reminders for a meal plan
   */
  async cancelCookingReminders(mealPlanId: string): Promise<void> {
    logServiceOperation('cancelCookingReminders', 'cookingReminders', { mealPlanId });

    try {
      const reminderIds = activeReminders.get(mealPlanId);
      if (reminderIds) {
        // Note: Browser notifications don't have a cancel API
        // We track them for reference, but can't actually cancel
        // In a production system, you might use a backend service
        activeReminders.delete(mealPlanId);
      }
    } catch (error) {
      logServiceError('cancelCookingReminders', 'cookingReminders', error, { mealPlanId });
      throw error;
    }
  },

  /**
   * Calculate reminder time (15 minutes before start cooking)
   */
  calculateReminderTime(meal: PlannedMeal): number | null {
    if (!meal.startCookingAt || !meal.date) {
      return null;
    }

    try {
      const [hours, minutes] = meal.startCookingAt.split(':').map(Number);
      const reminderDate = new Date(meal.date);
      reminderDate.setHours(hours, minutes, 0, 0);
      
      // 15 minutes before
      const reminderTime = reminderDate.getTime() - 15 * 60 * 1000;
      return reminderTime;
    } catch (error) {
      console.error('Error calculating reminder time:', error);
      return null;
    }
  },

  /**
   * Schedule a single reminder
   */
  async scheduleReminder(meal: PlannedMeal, reminderTime: number): Promise<number | null> {
    try {
      // Use setTimeout for reminders (in a production system, use a proper scheduler)
      const delay = reminderTime - Date.now();
      
      if (delay <= 0) {
        return null; // Reminder time has passed
      }

      const timeoutId = window.setTimeout(() => {
        this.sendReminder(meal);
      }, delay);

      return timeoutId;
    } catch (error) {
      console.error('Error scheduling reminder:', error);
      return null;
    }
  },

  /**
   * Send reminder notification
   */
  async sendReminder(meal: PlannedMeal): Promise<void> {
    try {
      if (!notificationService.isSupported()) {
        return;
      }

      const title = `Time to start cooking: ${meal.mealName}`;
      const body = `Start cooking at ${meal.startCookingAt} to have ${meal.mealName} ready by ${meal.finishBy}`;

      await notificationService.sendNotification(title, body);
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }
};

