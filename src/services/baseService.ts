/**
 * Base Service Class
 * Abstract base class for Firestore services with common patterns
 */

import type { QuerySnapshot, DocumentData } from 'firebase/firestore';
import { Timestamp, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { toServiceError } from './errors';

/**
 * Transform Firestore document to typed object with date conversion
 */
export function transformDocument<T>(doc: { id: string; data: () => DocumentData }, dateFields: string[] = []): T {
  const data = doc.data();
  const result: Record<string, unknown> = { id: doc.id };

  Object.keys(data).forEach(key => {
    const value = data[key];
    
    // Convert Timestamps to Dates for specified date fields
    if (dateFields.includes(key) && value && typeof value === 'object' && 'toDate' in value) {
      result[key] = (value as Timestamp).toDate();
    } else {
      result[key] = value;
    }
  });

  return result as T;
}

/**
 * Transform Firestore snapshot to typed array
 */
export function transformSnapshot<T>(snapshot: QuerySnapshot<DocumentData>, dateFields: string[] = []): T[] {
  return snapshot.docs.map(doc => transformDocument<T>(doc, dateFields));
}

/**
 * Clean Firestore data by removing undefined values
 */
export function cleanFirestoreData(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== undefined) {
      // Convert Date objects to Timestamps
      if (value instanceof Date) {
        cleaned[key] = Timestamp.fromDate(value);
      } else {
        cleaned[key] = value;
      }
    }
  });
  
  return cleaned;
}

/**
 * Log service operation
 */
export function logServiceOperation(operation: string, collectionName: string, context?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.log(`[${collectionName}] ${operation}`, context || '');
  }
}

/**
 * Log service error
 */
export function logServiceError(operation: string, collectionName: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[${collectionName}] ${operation} error:`, error, context || '');
}

/**
 * Get user-friendly error message for subscription errors
 */
export function getSubscriptionErrorMessage(error: unknown, context: string): string | null {
  if (!(error instanceof Error)) {
    return `Failed to load ${context}. Please try again.`;
  }

  const errorCode = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const errorMessage = error.message.toLowerCase();

  // Check for index error (failed-precondition with index mention)
  if (errorCode === 'failed-precondition' || errorMessage.includes('index') || errorMessage.includes('create_composite')) {
    return `Database index required for ${context}. Please contact support or check Firebase Console.`;
  }

  // Check for permission error
  if (errorCode === 'permission-denied' || errorCode === 'firestore/permission-denied') {
    return `Permission denied: Unable to load ${context}. Please check your account permissions.`;
  }

  // Check for network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
    return `Network error: Unable to load ${context}. Please check your connection and try again.`;
  }

  // Generic error
  return `Failed to load ${context}. Please try again.`;
}

/**
 * Handle subscription errors with fallback
 */
export function handleSubscriptionError(
  error: unknown,
  collectionName: string,
  userId?: string,
  fallbackQuery?: () => QuerySnapshot<DocumentData> | Promise<QuerySnapshot<DocumentData>>,
  fallbackCallback?: (snapshot: QuerySnapshot<DocumentData>) => void
): void {
  logServiceError('subscription', collectionName, error, { userId });
  
  if (fallbackQuery && fallbackCallback) {
    Promise.resolve(fallbackQuery())
      .then(snapshot => fallbackCallback(snapshot))
      .catch(fallbackError => {
        console.error(`[${collectionName}] Fallback query failed:`, fallbackError);
      });
  }
}

export interface ServiceOptions {
  dateFields?: string[];
  collectionName: string;
}

/**
 * Abstract base class for Firestore services
 */
export abstract class BaseService<T extends { id: string }> {
  protected collectionName: string;
  protected dateFields: string[];

  constructor(options: ServiceOptions) {
    this.collectionName = options.collectionName;
    this.dateFields = options.dateFields || ['createdAt', 'addedDate', 'lastUsed'];
  }

  /**
   * Transform Firestore document to typed object
   */
  protected transformDocument(doc: { id: string; data: () => DocumentData }): T {
    return transformDocument<T>(doc, this.dateFields);
  }

  /**
   * Transform Firestore snapshot to typed array
   */
  protected transformSnapshot(snapshot: QuerySnapshot<DocumentData>): T[] {
    return transformSnapshot<T>(snapshot, this.dateFields);
  }

  /**
   * Get a document by ID
   */
  async getById(id: string): Promise<T | null> {
    logServiceOperation('getById', this.collectionName, { id });

    try {
      const docRef = doc(db, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return this.transformDocument(docSnap);
    } catch (error) {
      logServiceError('getById', this.collectionName, error, { id });
      throw toServiceError(error, this.collectionName);
    }
  }

  /**
   * Get all documents for a user
   */
  async getAll(userId: string): Promise<T[]> {
    logServiceOperation('getAll', this.collectionName, { userId });

    try {
      const q = query(
        collection(db, this.collectionName),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(q);
      return this.transformSnapshot(snapshot);
    } catch (error) {
      logServiceError('getAll', this.collectionName, error, { userId });
      throw toServiceError(error, this.collectionName);
    }
  }

  /**
   * Create a new document
   */
  async create(data: Omit<T, 'id'>): Promise<string> {
    logServiceOperation('create', this.collectionName, { data });

    try {
      const cleanData = cleanFirestoreData(data as Record<string, unknown>);
      const docRef = await addDoc(collection(db, this.collectionName), cleanData);
      return docRef.id;
    } catch (error) {
      logServiceError('create', this.collectionName, error, { data });
      throw toServiceError(error, this.collectionName);
    }
  }

  /**
   * Update a document
   */
  async update(id: string, updates: Partial<T>): Promise<void> {
    logServiceOperation('update', this.collectionName, { id, updates });

    try {
      const docRef = doc(db, this.collectionName, id);
      const cleanData = cleanFirestoreData(updates as Record<string, unknown>);
      await updateDoc(docRef, cleanData);
    } catch (error) {
      logServiceError('update', this.collectionName, error, { id, updates });
      throw toServiceError(error, this.collectionName);
    }
  }

  /**
   * Delete a document
   */
  async delete(id: string): Promise<void> {
    logServiceOperation('delete', this.collectionName, { id });

    try {
      const docRef = doc(db, this.collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      logServiceError('delete', this.collectionName, error, { id });
      throw toServiceError(error, this.collectionName);
    }
  }

  /**
   * Handle subscription errors (to be used by subclasses)
   */
  protected handleSubscriptionError(
    error: unknown,
    userId?: string,
    fallbackQuery?: () => QuerySnapshot<DocumentData> | Promise<QuerySnapshot<DocumentData>>,
    fallbackCallback?: (snapshot: QuerySnapshot<DocumentData>) => void
  ): void {
    handleSubscriptionError(error, this.collectionName, userId, fallbackQuery, fallbackCallback);
  }
}
