import { collection, addDoc, Timestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { logServiceError } from './baseService';
import type {
  AnalyticsEvent,
  EventCategory,
  Platform,
  AcquisitionSource,
  AcquisitionEventMetadata,
  ActivationEventMetadata,
  RetentionEventMetadata,
  ReferralEventMetadata,
  EngagementEventMetadata,
  FunnelEventMetadata,
  QualityEventMetadata,
} from '../types/analytics';

// Get app version from package.json or environment
const getAppVersion = (): string => {
  // In a real app, this would come from package.json or build config
  // For now, use a simple version string
  return '1.0.0';
};

// Get platform
const getPlatform = (): Platform => {
  if (typeof window === 'undefined') return 'web';
  // Could detect iOS/Android if needed
  return 'web';
};

// Generate or retrieve session ID
const getSessionId = (): string => {
  if (typeof window === 'undefined') return '';
  
  const storageKey = 'timetouseit_session_id';
  const sessionTimestampKey = 'timetouseit_session_timestamp';
  const sessionTimeout = 30 * 60 * 1000; // 30 minutes
  
  const existingSessionId = sessionStorage.getItem(storageKey);
  const existingTimestamp = sessionStorage.getItem(sessionTimestampKey);
  
  if (existingSessionId && existingTimestamp) {
    const timestamp = parseInt(existingTimestamp, 10);
    const now = Date.now();
    
    // If session is still valid (within timeout), reuse it
    if (now - timestamp < sessionTimeout) {
      return existingSessionId;
    }
  }
  
  // Generate new session ID
  const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sessionStorage.setItem(storageKey, newSessionId);
  sessionStorage.setItem(sessionTimestampKey, Date.now().toString());
  
  return newSessionId;
};

// Core event tracking function
export const trackEvent = async (
  userId: string,
  eventType: AnalyticsEvent['eventType'],
  eventCategory: EventCategory,
  metadata: Record<string, any> = {}
): Promise<void> => {
  try {
    const event: Omit<AnalyticsEvent, 'id'> = {
      userId,
      eventType,
      eventCategory,
      timestamp: Timestamp.now(),
      platform: getPlatform(),
      appVersion: getAppVersion(),
      sessionId: getSessionId(),
      metadata,
    };

    await addDoc(collection(db, 'analyticsEvents'), event);
  } catch (error) {
    // Don't throw errors - analytics should never break the app
    logServiceError('trackEvent', 'analyticsEvents', error, { userId, eventType, eventCategory });
  }
};

// Acquisition tracking
export const trackAcquisition = async (
  userId: string,
  eventType: 'new_user_created' | 'session_started' | 'acquisition_source',
  metadata?: AcquisitionEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'acquisition', metadata || {});
};

// Activation tracking
export const trackActivation = async (
  userId: string,
  metadata: ActivationEventMetadata
): Promise<void> => {
  await trackEvent(userId, 'activation_completed', 'activation', metadata);
};

// Retention tracking
export const trackRetention = async (
  userId: string,
  eventType: 'daily_active_user' | 'weekly_active_user' | 'monthly_active_user' | 'return_session',
  metadata?: RetentionEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'retention', metadata || {});
};

// Referral tracking
export const trackReferral = async (
  userId: string,
  eventType: 'invite_sent' | 'invite_accepted' | 'referral_signup_completed',
  metadata?: ReferralEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'referral', metadata || {});
};

// Engagement tracking
export const trackEngagement = async (
  userId: string,
  eventType: 'core_action_used' | 'item_added' | 'item_updated' | 'feature_used' | 'shopping_list_item_added' | 'shopping_list_item_crossed_off' | 'calendar_viewed' | 'barcode_scanned' | 'label_scanned' | 'label_scanned_item_added' | 'label_scanned_item_updated',
  metadata?: EngagementEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'engagement', metadata || {});
};

// Funnel tracking
export const trackFunnel = async (
  userId: string,
  eventType: 'funnel_visit' | 'funnel_signup' | 'funnel_activation' | 'funnel_return_usage',
  metadata?: FunnelEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'funnel', metadata || {});
};

// Quality tracking
export const trackQuality = async (
  userId: string,
  eventType: 'error_occurred' | 'action_failed' | 'sync_failed' | 'app_crash' | 'slow_load_detected',
  metadata?: QualityEventMetadata
): Promise<void> => {
  await trackEvent(userId, eventType, 'quality', metadata || {});
};

// Helper: Check if user has activated (first item with expiration/thaw date)
export const checkUserActivation = async (userId: string): Promise<boolean> => {
  try {
    // Check if user has any food items with expiration or thaw dates
    const foodItemsQuery = query(
      collection(db, 'foodItems'),
      where('userId', '==', userId),
      limit(1)
    );
    
    const snapshot = await getDocs(foodItemsQuery);
    return !snapshot.empty;
  } catch (error) {
    logServiceError('checkUserActivation', 'analyticsEvents', error, { userId });
    return false;
  }
};

// Helper: Get user signup timestamp from userSettings
export const getUserSignupTime = async (userId: string): Promise<Date | null> => {
  try {
    // Try to get from userSettings first (we store email there, could store signup time)
    // For now, we'll check the first analytics event for this user
    const eventsQuery = query(
      collection(db, 'analyticsEvents'),
      where('userId', '==', userId),
      where('eventType', '==', 'new_user_created'),
      orderBy('timestamp', 'asc'),
      limit(1)
    );
    
    const snapshot = await getDocs(eventsQuery);
    if (!snapshot.empty) {
      const event = snapshot.docs[0].data();
      return event.timestamp.toDate();
    }
    
    return null;
  } catch (error) {
    logServiceError('getUserSignupTime', 'analyticsEvents', error, { userId });
    return null;
  }
};

// Helper: Calculate time to activation
export const calculateTimeToActivation = async (userId: string): Promise<number | null> => {
  try {
    const signupTime = await getUserSignupTime(userId);
    if (!signupTime) return null;
    
    // Get activation event
    const activationQuery = query(
      collection(db, 'analyticsEvents'),
      where('userId', '==', userId),
      where('eventType', '==', 'activation_completed'),
      orderBy('timestamp', 'asc'),
      limit(1)
    );
    
    const snapshot = await getDocs(activationQuery);
    if (!snapshot.empty) {
      const event = snapshot.docs[0].data();
      const activationTime = event.timestamp.toDate();
      return Math.floor((activationTime.getTime() - signupTime.getTime()) / 1000); // seconds
    }
    
    return null;
  } catch (error) {
    logServiceError('calculateTimeToActivation', 'analyticsEvents', error, { userId });
    return null;
  }
};

// Helper: Detect acquisition source from URL or referrer
export const detectAcquisitionSource = (): AcquisitionSource => {
  if (typeof window === 'undefined') return 'direct';
  
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get('utm_source');
  const ref = urlParams.get('ref');
  const referrer = document.referrer;
  
  if (ref || utmSource === 'referral') {
    return 'referral';
  }
  
  if (utmSource === 'paid' || urlParams.get('utm_medium') === 'paid') {
    return 'paid';
  }
  
  if (referrer && !referrer.includes(window.location.hostname)) {
    return 'organic';
  }
  
  return 'direct';
};

export const analyticsService = {
  trackEvent,
  trackAcquisition,
  trackActivation,
  trackRetention,
  trackReferral,
  trackEngagement,
  trackFunnel,
  trackQuality,
  checkUserActivation,
  getUserSignupTime,
  calculateTimeToActivation,
  detectAcquisitionSource,
  getSessionId,
  getPlatform,
  getAppVersion,
};

