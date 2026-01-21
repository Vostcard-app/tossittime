import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Validate required environment variables
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check for missing environment variables
const envVarMap: Record<string, string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID'
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value || (typeof value === 'string' && value.includes('your_')))
  .map(([key]) => envVarMap[key]);

if (missingVars.length > 0) {
  console.error('❌ Missing Firebase configuration!');
  console.error('Please create a .env file in the root directory with the following variables:');
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('\nGet these values from: Firebase Console → Project Settings → General → Your apps → Web app → Config');
  throw new Error(`Missing Firebase environment variables: ${missingVars.join(', ')}`);
}

const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey,
  authDomain: requiredEnvVars.authDomain,
  projectId: requiredEnvVars.projectId,
  storageBucket: requiredEnvVars.storageBucket,
  messagingSenderId: requiredEnvVars.messagingSenderId,
  appId: requiredEnvVars.appId
};

// Debug: Log configuration (mask API key for security but show enough to verify)
const maskedApiKey = requiredEnvVars.apiKey 
  ? `${requiredEnvVars.apiKey.substring(0, 20)}...${requiredEnvVars.apiKey.substring(requiredEnvVars.apiKey.length - 6)}`
  : 'MISSING';
const apiKeyEnd = requiredEnvVars.apiKey?.substring(requiredEnvVars.apiKey.length - 6) || 'MISSING';

// CRITICAL: Verify we're using the correct API key
if (apiKeyEnd === 'K01A0') {
  console.error('❌❌❌ WRONG API KEY DETECTED! ❌❌❌');
  console.error('The old incorrect API key is being used. This is a CACHE issue.');
  console.error('SOLUTION: Clear browser cache and restart dev server.');
  console.error('Expected: ...KO1A0');
  console.error('Got: ...K01A0');
}

console.log('🔥 Firebase Configuration:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKey: maskedApiKey,
  apiKeyLength: requiredEnvVars.apiKey?.length || 0,
  hasApiKey: !!requiredEnvVars.apiKey,
  apiKeyEnd: apiKeyEnd,
  timestamp: new Date().toISOString() // Cache busting
});

// Validate API key format
if (requiredEnvVars.apiKey && !requiredEnvVars.apiKey.startsWith('AIzaSy')) {
  console.warn('⚠️ Warning: API key format looks incorrect. Firebase API keys typically start with "AIzaSy"');
}

// Suppress harmless MutationObserver warning from Firebase Auth
// This is a known issue in Firebase Auth's internal code and doesn't affect functionality
// We intercept console.error and window.onerror to filter out this specific harmless warning
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args: unknown[]) => {
  // Convert all arguments to string and check for MutationObserver error
  const errorMessage = args
    .map(arg => {
      if (arg instanceof Error) {
        return arg.message + ' ' + arg.stack;
      }
      return String(arg);
    })
    .join(' ');
  
  // Ignore MutationObserver errors from Firebase Auth (harmless internal warning)
  if (errorMessage.includes("MutationObserver") && 
      (errorMessage.includes("parameter 1 is not of type 'Node'") ||
       errorMessage.includes("Failed to execute 'observe'"))) {
    // Silently ignore - this is a harmless Firebase Auth internal warning
    return;
  }
  originalError.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  // Also filter MutationObserver warnings
  const warningMessage = args
    .map(arg => {
      if (arg instanceof Error) {
        return arg.message + ' ' + arg.stack;
      }
      return String(arg);
    })
    .join(' ');
  
  if (warningMessage.includes("MutationObserver") && 
      (warningMessage.includes("parameter 1 is not of type 'Node'") ||
       warningMessage.includes("Failed to execute 'observe'"))) {
    return;
  }
  originalWarn.apply(console, args);
};

// Also catch unhandled errors and rejections
const originalOnError = window.onerror;
window.onerror = (message, source, lineno, colno, error) => {
  const errorMessage = String(message) + (error ? ' ' + error.stack : '');
  
  // Suppress MutationObserver errors from Firebase Auth
  if (errorMessage.includes("MutationObserver") && 
      (errorMessage.includes("parameter 1 is not of type 'Node'") ||
       errorMessage.includes("Failed to execute 'observe'"))) {
    return true; // Suppress the error
  }
  
  // Suppress Chrome extension errors (harmless browser extension communication issues)
  if (errorMessage.includes("A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received") ||
      errorMessage.includes("runtime.lastError") ||
      errorMessage.includes("Unchecked runtime.lastError")) {
    return true; // Suppress the error
  }
  
  if (originalOnError) {
    return originalOnError(message, source, lineno, colno, error);
  }
  return false;
};

// Use addEventListener for unhandledrejection to avoid TypeScript type issues
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const errorMessage = String(event.reason) + (event.reason instanceof Error ? ' ' + event.reason.stack : '');
  
  // Suppress MutationObserver errors from Firebase Auth
  if (errorMessage.includes("MutationObserver") && 
      (errorMessage.includes("parameter 1 is not of type 'Node'") ||
       errorMessage.includes("Failed to execute 'observe'"))) {
    event.preventDefault(); // Suppress the error
    return;
  }
  
  // Suppress Chrome extension errors (harmless browser extension communication issues)
  if (errorMessage.includes("A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received") ||
      errorMessage.includes("runtime.lastError")) {
    event.preventDefault(); // Suppress the error
    return;
  }
});

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error);
  console.error('\n🔧 Troubleshooting steps:');
  console.error('1. Verify your API key in Firebase Console: https://console.firebase.google.com/');
  console.error('2. Check API key restrictions in Google Cloud Console: https://console.cloud.google.com/apis/credentials');
  console.error('3. Ensure these APIs are enabled:');
  console.error('   - Identity Toolkit API');
  console.error('   - Cloud Firestore API');
  console.error('   - Firebase Storage API');
  console.error('   - Firebase Installations API');
  console.error('4. For local development, add http://localhost:* to API key restrictions');
  console.error('5. For production, add your domain to API key restrictions');
  throw error;
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;

