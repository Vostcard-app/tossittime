import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { auth } from '../firebase/firebaseConfig';
import { userSettingsService, shoppingListsService } from '../services/firebaseService';

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
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();

  // Check for API key errors on mount
  useEffect(() => {
    // Listen for console errors related to API keys
    const originalError = console.error;
    console.error = (...args: any[]) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Verify reCAPTCHA before registration
        if (!executeRecaptcha) {
          setError('reCAPTCHA is not available. Please refresh the page and try again.');
          setLoading(false);
          return;
        }

        let recaptchaToken: string | null = null;
        try {
          recaptchaToken = await executeRecaptcha('register');
          if (!recaptchaToken) {
            setError('reCAPTCHA verification failed. Please try again.');
            setLoading(false);
            return;
          }
        } catch (recaptchaError: any) {
          console.error('reCAPTCHA error:', recaptchaError);
          setError('reCAPTCHA verification failed. Please refresh the page and try again.');
          setLoading(false);
          return;
        }

        // Proceed with registration
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // New user - initialize default settings
        if (userCredential.user && userCredential.user.uid) {
          const userId = userCredential.user.uid;
          try {
            await userSettingsService.updateUserSettings({
              userId,
              reminderDays: 7,
              notificationsEnabled: true
            });
            
            // Create default shopping list for new user
            await shoppingListsService.getDefaultShoppingList(userId);
          } catch (initError) {
            console.error('Error initializing user settings:', initError);
            // Don't block sign-up if initialization fails
          }
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/shop');
    } catch (err: any) {
      const errorMessage = getErrorMessage(err.code || '', err.message || '');
      setError(errorMessage);
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
    } catch (err: any) {
      const errorMessage = getErrorMessage(err.code || '', err.message || '');
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
        <h1 style={{ 
          margin: '0 0 1.5rem 0', 
          fontSize: '1.875rem', 
          fontWeight: '700', 
          color: '#1f2937',
          textAlign: 'center'
        }}>
          TossItTime
        </h1>
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

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
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

