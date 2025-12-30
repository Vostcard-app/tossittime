import type { FoodItem } from '../types';
import { calculateDaysUntilExpiration } from '../utils/dateUtils';

export const notificationService = {
  // Request notification permission
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },

  // Check if notifications are supported
  isSupported(): boolean {
    // Check if Notification API exists
    // Note: Even on HTTP, the API exists but won't work - we'll handle that in the UI
    return 'Notification' in window;
  },

  // Send notification for expiring items
  async sendExpirationReminder(item: FoodItem, reminderDays: number = 3): Promise<void> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      return;
    }

    // Skip frozen items (they use thawDate, not expirationDate)
    if (item.isFrozen) {
      return;
    }

    if (!item.expirationDate) {
      return;
    }

    const daysUntilExpiration = calculateDaysUntilExpiration(item.expirationDate);
    
    if (daysUntilExpiration >= 0 && daysUntilExpiration <= reminderDays) {
      const message = daysUntilExpiration === 0
        ? `${item.name} expires today!`
        : `${item.name} expires in ${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'}`;

      new Notification('TossItTime Reminder', {
        body: message,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `food-item-${item.id}`,
        requireInteraction: false
      });
    }
  },

  // Check and send reminders for multiple items
  async checkAndSendReminders(items: FoodItem[], reminderDays: number = 3): Promise<void> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      return;
    }

    const itemsToRemind = items.filter(item => {
      if (item.reminderSent) return false;
      // Skip frozen items (they use thawDate, not expirationDate)
      if (item.isFrozen || !item.expirationDate) return false;
      const days = calculateDaysUntilExpiration(item.expirationDate);
      return days >= 0 && days <= reminderDays;
    });

    for (const item of itemsToRemind) {
      await this.sendExpirationReminder(item, reminderDays);
    }
  }
};

