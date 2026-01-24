import { Timestamp } from 'firebase/firestore';

// Event Categories
export type EventCategory = 
  | 'acquisition' 
  | 'activation' 
  | 'retention' 
  | 'referral' 
  | 'engagement' 
  | 'funnel' 
  | 'quality';

// Platform Types
export type Platform = 'web' | 'ios' | 'android';

// Acquisition Events
export type AcquisitionEventType = 
  | 'new_user_created'
  | 'session_started'
  | 'acquisition_source';

export type AcquisitionSource = 'organic' | 'referral' | 'paid' | 'direct';

// Activation Events
export type ActivationEventType = 
  | 'activation_completed'
  | 'time_to_activation';

// Retention Events
export type RetentionEventType = 
  | 'daily_active_user'
  | 'weekly_active_user'
  | 'monthly_active_user'
  | 'return_session';

// Referral Events
export type ReferralEventType = 
  | 'invite_sent'
  | 'invite_accepted'
  | 'referral_signup_completed';

// Engagement Events
export type EngagementEventType = 
  | 'core_action_used'
  | 'item_added'
  | 'item_updated'
  | 'feature_used'
  | 'shopping_list_item_added'
  | 'shopping_list_item_crossed_off'
  | 'calendar_viewed'
  | 'barcode_scanned'
  | 'label_scanned'
  | 'label_scanned_item_added'
  | 'label_scanned_item_updated';

// Funnel Events
export type FunnelEventType = 
  | 'funnel_visit'
  | 'funnel_signup'
  | 'funnel_activation'
  | 'funnel_return_usage';

// Quality Events
export type QualityEventType = 
  | 'error_occurred'
  | 'action_failed'
  | 'sync_failed'
  | 'app_crash'
  | 'slow_load_detected';

// All Event Types
export type AnalyticsEventType = 
  | AcquisitionEventType
  | ActivationEventType
  | RetentionEventType
  | ReferralEventType
  | EngagementEventType
  | FunnelEventType
  | QualityEventType;

// Base Analytics Event
export interface AnalyticsEvent {
  id?: string;
  userId: string;
  anonymousId?: string; // For pre-auth tracking
  eventType: AnalyticsEventType;
  eventCategory: EventCategory;
  timestamp: Timestamp;
  platform: Platform;
  appVersion: string;
  sessionId: string;
  metadata: Record<string, any>; // Event-specific data
}

// Acquisition Event Metadata
export interface AcquisitionEventMetadata {
  source?: AcquisitionSource;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

// Activation Event Metadata
export interface ActivationEventMetadata {
  timeToActivation?: number; // seconds from signup
  itemName?: string;
  itemId?: string;
}

// Retention Event Metadata
export interface RetentionEventMetadata {
  daysSinceSignup?: number;
  daysSinceLastSession?: number;
  isReturning?: boolean;
}

// Referral Event Metadata
export interface ReferralEventMetadata {
  referralCode?: string;
  referrerId?: string;
  referredUserId?: string;
}

// Engagement Event Metadata
export interface EngagementEventMetadata {
  feature?: string;
  action?: string;
  itemId?: string;
  itemName?: string;
  category?: string;
  hasQuantity?: boolean;
  hasExpirationDate?: boolean;
}

// Funnel Event Metadata
export interface FunnelEventMetadata {
  funnelStep?: string;
  previousStep?: string;
  timeAtStep?: number; // seconds
}

// Quality Event Metadata
export interface QualityEventMetadata {
  errorType?: string;
  errorMessage?: string;
  errorStack?: string;
  action?: string;
  duration?: number; // milliseconds
  loadTime?: number; // milliseconds
}

// User Metrics
export interface UserMetrics {
  userId: string;
  signupDate: Date;
  activationDate?: Date;
  timeToActivation?: number; // seconds
  totalSessions: number;
  totalActions: number;
  lastActiveDate: Date;
  isActivated: boolean;
}

// Cohort Metrics
export interface CohortMetrics {
  cohortDate: string; // YYYY-MM-DD
  cohortSize: number;
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
  activationRate: number;
}

// Funnel Metrics
export interface FunnelMetrics {
  visitCount: number;
  signupCount: number;
  activationCount: number;
  returnUsageCount: number;
  visitToSignupRate: number;
  signupToActivationRate: number;
  activationToReturnRate: number;
  overallConversionRate: number;
}

// Engagement Metrics
export interface EngagementMetrics {
  averageActionsPerSession: number;
  averageSessionsPerUser: number;
  featureAdoption: Record<string, number>; // feature -> % of users
  mostUsedFeatures: Array<{ feature: string; usageCount: number }>;
}

// Retention Metrics
export interface RetentionMetrics {
  dau: number; // Daily Active Users
  wau: number; // Weekly Active Users
  mau: number; // Monthly Active Users
  wauMauRatio: number;
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
}

// Quality Metrics
export interface QualityMetrics {
  errorRate: number; // errors per session
  crashFreeSessions: number; // % of sessions without crashes
  failedActionRate: number; // % of actions that failed
  averageLoadTime: number; // milliseconds
  slowLoadCount: number; // loads > 3 seconds
}

// Analytics Aggregate
export interface AnalyticsAggregate {
  id?: string;
  date: string; // YYYY-MM-DD
  metricType: string;
  value: number;
  metadata?: Record<string, any>;
}

// Dashboard Overview Metrics
export interface DashboardOverview {
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activationRate: number;
  day7Retention: number;
  day30Retention: number;
  wauMauRatio: number;
  averageActionsPerSession: number;
  errorRate: number;
}

