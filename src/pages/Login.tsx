import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  RecaptchaVerifier
} from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { userSettingsService, shoppingListsService } from '../services';
import { analyticsService } from '../services/analyticsService';
import { getErrorInfo } from '../types';

// Helper function to extract username from email (part before @)
const extractUsernameFromEmail = (email: string): string => {
  if (!email || typeof email !== 'string') {
    return email || '';
  }
  
  const trimmedEmail = email.trim().toLowerCase();
  const atIndex = trimmedEmail.indexOf('@');
  
  // If no @ found, return the email as-is
  if (atIndex === -1) {
    return trimmedEmail;
  }
  
  // Return part before @
  const username = trimmedEmail.substring(0, atIndex).trim();
  return username || trimmedEmail; // Fallback to full email if username is empty
};

// Helper function to get user-friendly error messages
const getErrorMessage = (errorCode: string, errorMessage?: string): string => {
  // Check for API key errors
  if (errorMessage?.includes('API key not valid') || errorMessage?.includes('INVALID_ARGUMENT') || errorCode?.includes('api-key')) {
    return 'Firebase API key is invalid. Please check your configuration. See API_KEY_FIX_NOW.md for help.';
  }

  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No account found with this email address.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/invalid-api-key':
      return 'Firebase API key is invalid. Please check your configuration.';
    default:
      return 'An error occurred. Please try again.';
  }
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaVerified, setRecaptchaVerified] = useState(false);
  const navigate = useNavigate();
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Check for API key errors on mount
  useEffect(() => {
    // Listen for console errors related to API keys
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const errorStr = args.join(' ');
      if (errorStr.includes('API key not valid') || errorStr.includes('INVALID_ARGUMENT')) {
        setError('Firebase API key is invalid. Please check your configuration. See API_KEY_FIX_NOW.md for help.');
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Initialize reCAPTCHA verifier
  useEffect(() => {
    if (isSignUp && recaptchaContainerRef.current) {
      // Reset states when switching to sign up
      setRecaptchaReady(false);
      setRecaptchaVerified(false);
      
      // Clear any existing verifier
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (e) {
          console.warn('Error clearing existing reCAPTCHA:', e);
        }
        recaptchaVerifierRef.current = null;
      }

      // Small delay to ensure container is rendered
      const initTimeout = setTimeout(() => {
        if (recaptchaContainerRef.current && !recaptchaVerifierRef.current) {
          try {
            // Clear any existing content in the container
            if (recaptchaContainerRef.current) {
              recaptchaContainerRef.current.innerHTML = '';
            }
            
            recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
              size: 'normal',
              theme: 'light',
              callback: () => {
                console.log('✅ reCAPTCHA verified');
                setRecaptchaVerified(true);
                setError(null); // Clear any previous errors
              },
              'expired-callback': () => {
                console.warn('⚠️ reCAPTCHA expired');
                setRecaptchaVerified(false);
                setError('Security verification expired. Please complete the verification again.');
              },
              'error-callback': () => {
                console.error('⚠️ reCAPTCHA error');
                setRecaptchaVerified(false);
                setError('Security verification error. Please refresh the page and try again.');
              }
            });
            
            // Render the widget
            recaptchaVerifierRef.current.render().then(() => {
              console.log('✅ reCAPTCHA widget rendered');
              setRecaptchaReady(true);
            }).catch((renderError) => {
              console.error('Failed to render reCAPTCHA widget:', renderError);
              setRecaptchaReady(false);
              const errorMessage = renderError instanceof Error ? renderError.message : String(renderError);
              if (errorMessage.includes('blocked') || errorMessage.includes('unauthorized-domain')) {
                const currentDomain = window.location.hostname;
                setError(`Domain authorization error: ${currentDomain} is not authorized in Firebase. Please add it to Firebase Console → Authentication → Settings → Authorized domains.`);
              } else {
                setError('Failed to render security verification. Please refresh the page and try again. If the problem persists, check if an ad blocker is interfering.');
              }
            });
          } catch (error) {
            console.error('Failed to initialize reCAPTCHA:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('blocked') || errorMessage.includes('unauthorized-domain')) {
              const currentDomain = window.location.hostname;
              setError(`Domain authorization error: ${currentDomain} is not authorized in Firebase. Please add it to Firebase Console → Authentication → Settings → Authorized domains.`);
            } else {
              setError('Failed to load security verification. Please refresh the page and try again. If the checkbox does not appear, check if an ad blocker is blocking reCAPTCHA.');
            }
            setRecaptchaReady(false);
          }
        }
      }, 200);

      return () => {
        clearTimeout(initTimeout);
        if (recaptchaVerifierRef.current) {
          try {
            recaptchaVerifierRef.current.clear();
          } catch (e) {
            console.warn('Error clearing reCAPTCHA:', e);
          }
          recaptchaVerifierRef.current = null;
        }
        setRecaptchaReady(false);
        setRecaptchaVerified(false);
      };
    } else if (!isSignUp) {
      // Clean up when switching away from sign up
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (e) {
          console.warn('Error clearing reCAPTCHA:', e);
        }
        recaptchaVerifierRef.current = null;
      }
      setRecaptchaReady(false);
      setRecaptchaVerified(false);
    }
  }, [isSignUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Validate password confirmation
        if (password !== confirmPassword) {
          setError('Passwords do not match. Please try again.');
          setLoading(false);
          return;
        }

        // Validate terms acceptance
        if (!acceptedTerms) {
          setError('You must agree to the Terms and Conditions and Privacy Policy.');
          setLoading(false);
          return;
        }

        // Verify reCAPTCHA
        if (!recaptchaReady) {
          setError('Security verification is still loading. Please wait a moment and try again. If the checkbox does not appear, try refreshing the page.');
          setLoading(false);
          return;
        }

        if (!recaptchaVerifierRef.current) {
          console.warn('⚠️ reCAPTCHA verifier not initialized');
          setError('Security verification failed to load. Please refresh the page and try again. If the problem persists, check if an ad blocker is blocking reCAPTCHA.');
          setLoading(false);
          return;
        }

        // Check if reCAPTCHA widget is actually rendered
        const container = recaptchaContainerRef.current;
        if (container && container.children.length === 0) {
          setError('Security verification checkbox did not load. Please refresh the page. If the problem persists, check if an ad blocker is blocking reCAPTCHA.');
          setLoading(false);
          return;
        }

        // If already verified via callback, we can proceed
        if (!recaptchaVerified) {
          try {
            // Force verification check
            await recaptchaVerifierRef.current.verify();
            setRecaptchaVerified(true);
            console.log('✅ reCAPTCHA verified');
          } catch (recaptchaError: unknown) {
            console.error('reCAPTCHA verification failed:', recaptchaError);
            const errorMessage = recaptchaError instanceof Error ? recaptchaError.message : String(recaptchaError);
            if (errorMessage.includes('blocked') || errorMessage.includes('unauthorized-domain')) {
              const currentDomain = window.location.hostname;
              setError(`Domain authorization error: ${currentDomain} is not authorized in Firebase. Please add it to Firebase Console → Authentication → Settings → Authorized domains.`);
            } else if (errorMessage.includes('expired') || errorMessage.includes('timeout')) {
              setError('Security verification expired. Please complete the verification checkbox again.');
            } else if (errorMessage.includes('not verified') || errorMessage.includes('verification')) {
              setError('Please complete the security verification by checking the reCAPTCHA box above.');
            } else {
              setError(`Security verification error: ${errorMessage}. Please refresh the page and try again.`);
            }
            setLoading(false);
            return;
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // New user - initialize default settings
        if (userCredential.user && userCredential.user.uid) {
          const userId = userCredential.user.uid;
          
          // Track new user creation
          const acquisitionSource = analyticsService.detectAcquisitionSource();
          await analyticsService.trackAcquisition(userId, 'new_user_created', {
            source: acquisitionSource,
          });
          
          // Track funnel: signup
          await analyticsService.trackFunnel(userId, 'funnel_signup', {
            funnelStep: 'signup',
          });
          
          try {
            const userEmail = userCredential.user.email || email;
            const username = extractUsernameFromEmail(userEmail);
            
            await userSettingsService.updateUserSettings({
              userId,
              email: userEmail,
              username: username,
              reminderDays: 7,
              notificationsEnabled: true
            });
            
            // Create default shopping list for new user
            await shoppingListsService.getDefaultShoppingList(userId);
          } catch (initError) {
            console.error('Error initializing user settings:', initError);
            // Track error
            await analyticsService.trackQuality(userId, 'error_occurred', {
              errorType: 'initialization_error',
              errorMessage: initError instanceof Error ? initError.message : 'Unknown error',
              action: 'user_initialization',
            });
            // Don't block sign-up if initialization fails
          }
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        // Track session started
        if (userCredential.user && userCredential.user.uid) {
          await analyticsService.trackAcquisition(userCredential.user.uid, 'session_started', {
            source: analyticsService.detectAcquisitionSource(),
          });
        }
      }
      navigate('/shop');
    } catch (err: unknown) {
      const errorInfo = getErrorInfo(err);
      const errorMessage = getErrorMessage(errorInfo.code || '', errorInfo.message);
      setError(errorMessage);
      
      // Track error (use anonymous tracking if user not available)
      const userId = 'anonymous'; // User not authenticated yet in error case
      analyticsService.trackQuality(userId, 'error_occurred', {
        errorType: isSignUp ? 'signup_error' : 'login_error',
        errorMessage: errorInfo.message || errorMessage,
        action: isSignUp ? 'signup' : 'login',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }

    setError(null);
    setResetLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch (err: unknown) {
      const errorInfo = getErrorInfo(err);
      const errorMessage = getErrorMessage(errorInfo.code || '', errorInfo.message);
      setError(errorMessage);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.5rem'
        }}>
          <img
            src="/timetouseit logo.jpg"
            alt="TimeToUseIt Logo"
            style={{
              maxWidth: '200px',
              width: '100%',
              height: 'auto',
              display: 'block'
            }}
          />
        </div>
        <p style={{ 
          margin: '0 0 1.5rem 0', 
          color: '#6b7280',
          textAlign: 'center'
        }}>
          {isSignUp ? 'Create an account to start tracking your food' : 'Sign in to your account'}
        </p>

        {error && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#ef4444',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {resetEmailSent && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#d1fae5',
            color: '#065f46',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            Password reset email sent! Check your inbox.
          </div>
        )}

        {showResetPassword ? (
          <form onSubmit={handlePasswordReset}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="reset-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Email
              </label>
              <input
                type="email"
                id="reset-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: resetLoading ? 'not-allowed' : 'pointer',
                opacity: resetLoading ? 0.6 : 1,
                marginBottom: '1rem'
              }}
            >
              {resetLoading ? 'Sending...' : 'Send Reset Email'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false);
                  setResetEmailSent(false);
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#002B4D',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  textDecoration: 'underline'
                }}
              >
                Back to {isSignUp ? 'sign up' : 'sign in'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  paddingRight: '2.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#6b7280',
                  fontSize: '0.875rem'
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {!isSignUp && (
              <button
                type="button"
                onClick={() => setShowResetPassword(true)}
                style={{
                  marginTop: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#002B4D',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                Forgot password?
              </button>
            )}
          </div>

          {isSignUp && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    paddingRight: '2.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    color: '#6b7280',
                    fontSize: '0.875rem'
                  }}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {isSignUp && (
            <>
              <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                <a 
                  href="/terms" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ 
                    color: '#002B4D', 
                    fontWeight: '600',
                    textDecoration: 'underline',
                    marginRight: '0.5rem'
                  }}
                >
                  Terms and Conditions
                </a>
                <span style={{ color: '#6b7280' }}>and</span>
                <a 
                  href="/privacy" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ 
                    color: '#002B4D', 
                    fontWeight: '600',
                    textDecoration: 'underline',
                    marginLeft: '0.5rem'
                  }}
                >
                  Privacy Policy
                </a>
              </div>
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '0.5rem', 
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: '0.25rem', cursor: 'pointer' }}
                />
                <span>
                  I agree to the Terms and Conditions and Privacy Policy
                </span>
              </label>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem', 
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  color: '#374151'
                }}>
                  Security Verification {recaptchaVerified && '✓'}
                </label>
                <div 
                  ref={recaptchaContainerRef}
                  id="recaptcha-container"
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '78px',
                    padding: '0.5rem',
                    border: recaptchaVerified ? '1px solid #10b981' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: recaptchaVerified ? '#f0fdf4' : '#ffffff',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                {!recaptchaReady && (
                  <div style={{ 
                    margin: '0.5rem 0 0 0', 
                    fontSize: '0.75rem', 
                    color: '#6b7280',
                    textAlign: 'center',
                    padding: '0.5rem',
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fbbf24',
                    borderRadius: '4px'
                  }}>
                    ⚠️ Loading security verification... If the checkbox does not appear, please refresh the page.
                  </div>
                )}
                {recaptchaReady && !recaptchaVerified && (
                  <div style={{ 
                    margin: '0.5rem 0 0 0', 
                    fontSize: '0.75rem', 
                    color: '#dc2626',
                    textAlign: 'center',
                    padding: '0.5rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '4px'
                  }}>
                    ⚠️ Please check the reCAPTCHA checkbox above to verify you are not a robot. If you do not see a checkbox, try refreshing the page or check if an ad blocker is blocking it.
                  </div>
                )}
              </div>
            </>
          )}

            <button
              type="submit"
              disabled={loading || (isSignUp && (!acceptedTerms || !recaptchaVerified))}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: (isSignUp && (!acceptedTerms || !recaptchaVerified)) ? '#9ca3af' : '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: (loading || (isSignUp && (!acceptedTerms || !recaptchaVerified))) ? 'not-allowed' : 'pointer',
                opacity: (loading || (isSignUp && (!acceptedTerms || !recaptchaVerified))) ? 0.6 : 1,
                marginBottom: '1rem'
              }}
            >
              {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setResetEmailSent(false);
                  setConfirmPassword('');
                  setAcceptedTerms(false);
                  setRecaptchaVerified(false);
                  setRecaptchaReady(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#002B4D',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  textDecoration: 'underline'
                }}
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;

