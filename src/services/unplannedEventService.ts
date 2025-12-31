/**
 * Unplanned Event Service
 * Handles unplanned events that affect meal planning
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import type { UnplannedEvent } from '../types';
import { cleanFirestoreData, logServiceOperation, logServiceError } from './baseService';
import { toServiceError } from './errors';

/**
 * Unplanned Event Service
 */
export const unplannedEventService = {
  /**
   * Add unplanned event
   */
  async addUnplannedEvent(event: Omit<UnplannedEvent, 'id' | 'createdAt'>): Promise<string> {
    logServiceOperation('addUnplannedEvent', 'unplannedEvents', { userId: event.userId });
    
    try {
      const cleanData = cleanFirestoreData({
        ...event,
        createdAt: Timestamp.now()
      });
      
      const docRef = await addDoc(collection(db, 'unplannedEvents'), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('addUnplannedEvent', 'unplannedEvents', error, { userId: event.userId });
      throw toServiceError(error, 'unplannedEvents');
    }
  },

  /**
   * Get unplanned events for a date range
   */
  async getUnplannedEvents(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UnplannedEvent[]> {
    logServiceOperation('getUnplannedEvents', 'unplannedEvents', { userId, startDate, endDate });
    
    try {
      const q = query(
        collection(db, 'unplannedEvents'),
        where('userId', '==', userId),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate)),
        orderBy('date', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate(),
        createdAt: doc.data().createdAt.toDate()
      })) as UnplannedEvent[];
    } catch (error) {
      logServiceError('getUnplannedEvents', 'unplannedEvents', error, { userId });
      throw toServiceError(error, 'unplannedEvents');
    }
  },

  /**
   * Delete unplanned event
   */
  async deleteUnplannedEvent(eventId: string): Promise<void> {
    logServiceOperation('deleteUnplannedEvent', 'unplannedEvents', { eventId });
    
    try {
      await deleteDoc(doc(db, 'unplannedEvents', eventId));
    } catch (error) {
      logServiceError('deleteUnplannedEvent', 'unplannedEvents', error, { eventId });
      throw toServiceError(error, 'unplannedEvents');
    }
  },

  /**
   * Trigger replanning when event is added
   * This is a convenience method that calls mealPlanningService.replanMeals
   */
  async triggerReplanning(
    userId: string,
    event: UnplannedEvent,
    mealPlanId: string
  ): Promise<void> {
    // This will be implemented in mealPlanningService
    // For now, just add the event
    await this.addUnplannedEvent(event);
  }
};

