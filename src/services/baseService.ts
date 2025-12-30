/**
 * Base Service Utilities
 * Common patterns and utilities for all services
 */

import type { QuerySnapshot, DocumentData } from 'firebase/firestore';
import { FirestoreError, toServiceError } from './errors';
import { analyticsService } from './analyticsService';

/**
 * Service result wrapper for consistent error handling
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: FirestoreError;
}

/**
 * Handle Firestore subscription errors with consistent logging and fallback
 */
export function handleSubscriptionError(
  error: unknown,
  collectionName: string,
  userId?: string,
  fallbackQuery?: () => QuerySnapshot<DocumentData>,
  fallbackCallback?: (snapshot: QuerySnapshot<DocumentData>) => void
): void {
  const serviceError = toServiceError(error, collectionName) as FirestoreError;
  
  // Log error
  console.error(`❌ Error in ${collectionName} subscription:`, serviceError);
  console.error('❌ Error code:', serviceError.code);
  console.error('❌ Error message:', serviceError.message);

  // Track sync failure
  if (userId) {
    analyticsService.trackQuality(userId, 'sync_failed', {
      errorType: serviceError.code || 'unknown',
      errorMessage: serviceError.message || 'Unknown Firestore error',
      action: `subscribe_${collectionName}`,
    });
  }

  // Handle index errors
  if (serviceError.isIndexError()) {
    handleIndexError(serviceError, collectionName);
    
    // Try fallback query if provided
    if (fallbackQuery && fallbackCallback) {
      console.warn(`💡 Falling back to query without orderBy for ${collectionName}...`);
      try {
        const fallbackSnapshot = fallbackQuery();
        fallbackCallback(fallbackSnapshot);
      } catch (fallbackErr) {
        console.error(`❌ Fallback query for ${collectionName} also failed:`, fallbackErr);
      }
    }
  }
}

/**
 * Handle Firestore index errors with user-friendly warnings
 */
function handleIndexError(error: FirestoreError, collectionName: string): void {
  const warningKey = `__${collectionName}IndexWarningShown`;
  
  if (!(window as any)[warningKey]) {
    const indexUrl = error.getIndexUrl();
    console.warn(`⚠️ Firestore index required for ${collectionName} query.`);
    
    if (indexUrl) {
      console.warn('📋 Create the index here:', indexUrl);
    } else {
      console.warn('📋 Go to Firebase Console → Firestore → Indexes to create the index.');
    }
    
    console.warn(`💡 The app will work, but ${collectionName} won't load until the index is created and enabled.`);
    console.warn('💡 If you just created the index, wait 2-5 minutes for it to build, then refresh.');
    
    (window as any)[warningKey] = true;
  }
}

/**
 * Transform Firestore document to typed object with date conversion
 */
export function transformDocument<T>(
  doc: { id: string; data: () => DocumentData },
  dateFields: string[] = ['createdAt', 'addedDate', 'lastUsed']
): T {
  const data = doc.data();
  const transformed: Record<string, unknown> = {
    id: doc.id,
    ...data,
  };

  // Convert Timestamp fields to Date
  dateFields.forEach(field => {
    if (data[field] && typeof data[field].toDate === 'function') {
      transformed[field] = data[field].toDate();
    }
  });

  return transformed as T;
}

/**
 * Transform Firestore query snapshot to typed array
 */
export function transformSnapshot<T>(
  snapshot: QuerySnapshot<DocumentData>,
  dateFields: string[] = ['createdAt', 'addedDate', 'lastUsed']
): T[] {
  return snapshot.docs.map(doc => transformDocument<T>(doc, dateFields));
}

/**
 * Clean data object by removing undefined values (Firestore doesn't allow undefined)
 */
export function cleanFirestoreData<T extends Record<string, unknown>>(
  data: T
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  
  return cleaned;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`⚠️ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Log service operation
 */
export function logServiceOperation(
  operation: string,
  collection: string,
  details?: Record<string, unknown>
): void {
  console.log(`🔧 [${collection}] ${operation}`, details || '');
}

/**
 * Log service error
 */
export function logServiceError(
  operation: string,
  collection: string,
  error: unknown,
  details?: Record<string, unknown>
): void {
  const serviceError = toServiceError(error, collection);
  console.error(`❌ [${collection}] ${operation} failed:`, {
    error: serviceError.message,
    code: serviceError.code,
    ...details,
  });
}

