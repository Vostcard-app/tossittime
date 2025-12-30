import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UserSettings, FirestoreUpdateData } from '../types';
import { logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * User Settings Service
 * Handles user settings operations
 */
export const userSettingsService = {
  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    logServiceOperation('getUserSettings', 'userSettings', { userId });
    
    try {
      const docRef = doc(db, 'userSettings', userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return docSnap.data() as UserSettings;
      }
      return null;
    } catch (error) {
      logServiceError('getUserSettings', 'userSettings', error, { userId });
      throw toServiceError(error, 'userSettings');
    }
  },

  /**
   * Create or update user settings
   */
  async updateUserSettings(settings: UserSettings): Promise<void> {
    logServiceOperation('updateUserSettings', 'userSettings', { userId: settings.userId });
    
    try {
      const docRef = doc(db, 'userSettings', settings.userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        await updateDoc(docRef, settings as FirestoreUpdateData<UserSettings>);
      } else {
        // Use setDoc to create with userId as document ID
        await setDoc(docRef, settings);
      }
    } catch (error) {
      logServiceError('updateUserSettings', 'userSettings', error, { userId: settings.userId });
      throw toServiceError(error, 'userSettings');
    }
  },

  /**
   * Set last used shopping list
   */
  async setLastUsedShoppingList(userId: string, listId: string): Promise<void> {
    const settings = await this.getUserSettings(userId);
    if (settings) {
      await this.updateUserSettings({ ...settings, lastUsedShoppingListId: listId });
    } else {
      await this.updateUserSettings({
        userId,
        reminderDays: 7,
        notificationsEnabled: true,
        lastUsedShoppingListId: listId
      });
    }
  }
};

