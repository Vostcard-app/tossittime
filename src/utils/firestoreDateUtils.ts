/**
 * Firestore Date Transformation Utilities
 * Standardized date field handling for Firestore operations
 */

import { Timestamp } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

/**
 * Collection-specific date field mappings
 * Maps collection names to their date field names
 */
export const COLLECTION_DATE_FIELDS: Record<string, string[]> = {
  foodItems: ['expirationDate', 'thawDate', 'addedDate'],
  userItems: ['createdAt', 'lastUsed'],
  shoppingLists: ['createdAt', 'updatedAt'],
  userSettings: ['createdAt', 'updatedAt'],
  mealPlans: ['createdAt', 'date', 'updatedAt'],
  mealProfiles: ['createdAt', 'updatedAt'],
  favoriteRecipes: ['createdAt']
};

/**
 * Get date fields for a collection
 */
export function getDateFieldsForCollection(collectionName: string): string[] {
  return COLLECTION_DATE_FIELDS[collectionName] || ['createdAt', 'updatedAt'];
}

/**
 * Convert Firestore Timestamp to Date
 */
export function timestampToDate(timestamp: Timestamp | Date | undefined | null): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  return undefined;
}

/**
 * Convert Date to Firestore Timestamp
 */
export function dateToTimestamp(date: Date | undefined | null): Timestamp | undefined {
  if (!date) return undefined;
  return Timestamp.fromDate(date);
}

/**
 * Transform a single date field in a document
 */
export function transformDateField(
  data: DocumentData,
  fieldName: string
): Date | undefined {
  const value = data[fieldName];
  return timestampToDate(value);
}

/**
 * Transform multiple date fields in a document
 */
export function transformDateFields(
  data: DocumentData,
  dateFields: string[]
): Record<string, Date | undefined> {
  const transformed: Record<string, Date | undefined> = {};
  
  dateFields.forEach(field => {
    transformed[field] = transformDateField(data, field);
  });

  return transformed;
}

/**
 * Prepare date fields for Firestore (convert Date to Timestamp)
 */
export function prepareDateFieldsForFirestore(
  data: Record<string, unknown>,
  dateFields: string[]
): Record<string, Timestamp | undefined> {
  const prepared: Record<string, Timestamp | undefined> = {};
  
  dateFields.forEach(field => {
    const value = data[field];
    if (value instanceof Date) {
      prepared[field] = dateToTimestamp(value);
    } else if (value !== undefined) {
      // Keep non-date values as-is, but don't include undefined
      prepared[field] = value as Timestamp;
    }
  });

  return prepared;
}

/**
 * Check if a value is a Firestore Timestamp
 */
export function isTimestamp(value: unknown): value is Timestamp {
  return (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as Timestamp).toDate === 'function'
  );
}

