/**
 * Custom Error Classes for Services
 */

/**
 * Base service error class
 */
export class ServiceError extends Error {
  public code: string;
  public details?: unknown;

  constructor(
    message: string,
    code: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Firestore-specific error
 */
export class FirestoreError extends ServiceError {
  public collection?: string;
  public operation?: string;

  constructor(
    message: string,
    code: string,
    collection?: string,
    operation?: string,
    details?: unknown
  ) {
    super(message, code, details);
    this.name = 'FirestoreError';
    this.collection = collection;
    this.operation = operation;
  }

  /**
   * Check if error is due to missing index
   */
  isIndexError(): boolean {
    return this.code === 'failed-precondition' || 
           this.message.includes('index') ||
           this.message.includes('create_composite');
  }

  /**
   * Extract index creation URL from error message
   */
  getIndexUrl(): string | null {
    const match = this.message.match(/https:\/\/[^\s]+/);
    return match ? match[0] : null;
  }
}

/**
 * Storage-specific error
 */
export class StorageError extends ServiceError {
  public path?: string;

  constructor(
    message: string,
    code: string,
    path?: string,
    details?: unknown
  ) {
    super(message, code, details);
    this.name = 'StorageError';
    this.path = path;
  }
}

/**
 * Network/connectivity error
 */
export class NetworkError extends ServiceError {
  constructor(
    message: string,
    code: string = 'network-error',
    details?: unknown
  ) {
    super(message, code, details);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  /**
   * Check if error is due to network issues
   */
  static isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes('network') ||
           message.includes('fetch') ||
           message.includes('timeout') ||
           message.includes('econnrefused') ||
           message.includes('aborted');
  }
}

/**
 * Validation error
 */
export class ValidationError extends ServiceError {
  public field?: string;

  constructor(
    message: string,
    field?: string,
    details?: unknown
  ) {
    super(message, 'validation-error', details);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Helper to convert unknown error to ServiceError
 */
export function toServiceError(error: unknown, context?: string): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for Firestore errors
    if ('code' in error && typeof error.code === 'string') {
      if (error.code.startsWith('firestore/') || error.code === 'failed-precondition') {
        return new FirestoreError(
          error.message,
          error.code,
          undefined,
          context,
          error
        );
      }
      if (error.code.startsWith('storage/')) {
        return new StorageError(
          error.message,
          error.code,
          undefined,
          error
        );
      }
    }

    // Check for network errors
    if (NetworkError.isNetworkError(error)) {
      return new NetworkError(
        error.message,
        'network-error',
        error
      );
    }

    // Generic service error
    return new ServiceError(
      error.message,
      'unknown-error',
      error
    );
  }

  // Fallback for non-Error objects
  return new ServiceError(
    String(error),
    'unknown-error',
    error
  );
}

