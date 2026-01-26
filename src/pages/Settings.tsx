import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { userSettingsService } from '../services';
import { notificationService } from '../services/notificationService';
import type { UserSettings } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';

const Settings: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>({
    userId: user?.uid || '',
    reminderDays: 7,
    notificationsEnabled: false,
    isPremium: false,
    dateFormat: 'MM/DD/YYYY',
    weightUnit: 'pounds',
    hasSeenScanWarning: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;

      try {
        const userSettings = await userSettingsService.getUserSettings(user.uid);
        if (userSettings) {
          setSettings(userSettings);
        } else {
          setSettings({
            userId: user.uid,
            reminderDays: 7,
            notificationsEnabled: false,
            isPremium: false,
            dateFormat: 'MM/DD/YYYY',
            weightUnit: 'pounds',
            hasSeenScanWarning: false
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await userSettingsService.updateUserSettings({
        ...settings,
        userId: user.uid
      });
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestNotifications = async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      setSettings(prev => ({ ...prev, notificationsEnabled: true }));
      alert('Notifications enabled!');
    } else {
      alert('Notification permission denied. Please enable it in your browser settings.');
    }
  };

  const handleSignOut = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      try {
        await signOut(auth);
        navigate('/login');
      } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to access settings.</p>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#002B4D',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Fixed Header: Banner */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#002B4D',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <Banner showHomeIcon={false} onMenuClick={() => setMenuOpen(true)} maxWidth="1400px" />
      </div>

      {/* Navigation Buttons */}
      <div style={{ 
        padding: '1rem', 
        maxWidth: '1400px', 
        margin: '0 auto', 
        marginTop: '80px',
        display: 'flex', 
        gap: '0.5rem', 
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        <Link
          to="/shop"
          style={{
            display: 'flex',
            padding: '1rem 1.5rem',
            color: '#1f2937',
            textDecoration: 'none',
            fontSize: '22px',
            fontWeight: '500',
            transition: 'background-color 0.2s',
            borderLeft: '3px solid transparent',
            minHeight: '44px',
            alignItems: 'center',
            backgroundColor: 'transparent',
            borderRadius: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderLeftColor = 'transparent';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onTouchEnd={(e) => {
            setTimeout(() => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderLeftColor = 'transparent';
            }, 200);
          }}
        >
          Lists
        </Link>
        <Link
          to="/dashboard"
          style={{
            display: 'flex',
            padding: '1rem 1.5rem',
            color: '#1f2937',
            textDecoration: 'none',
            fontSize: '22px',
            fontWeight: '500',
            transition: 'background-color 0.2s',
            borderLeft: '3px solid transparent',
            minHeight: '44px',
            alignItems: 'center',
            backgroundColor: 'transparent',
            borderRadius: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderLeftColor = 'transparent';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onTouchEnd={(e) => {
            setTimeout(() => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderLeftColor = 'transparent';
            }, 200);
          }}
        >
          Items
        </Link>
        <Link
          to="/planned-meal-calendar"
          style={{
            display: 'flex',
            padding: '1rem 1.5rem',
            color: '#1f2937',
            textDecoration: 'none',
            fontSize: '22px',
            fontWeight: '500',
            transition: 'background-color 0.2s',
            borderLeft: '3px solid transparent',
            minHeight: '44px',
            alignItems: 'center',
            backgroundColor: 'transparent',
            borderRadius: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderLeftColor = 'transparent';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.borderLeftColor = '#002B4D';
          }}
          onTouchEnd={(e) => {
            setTimeout(() => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderLeftColor = 'transparent';
            }, 200);
          }}
        >
          Plan
        </Link>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem', marginTop: '1rem' }}>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Account
          </h2>
          <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>
            Signed in as: {user.email}
          </p>
          
          {/* Premium Status */}
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: settings.isPremium ? '#ecfdf5' : '#fef3c7', borderRadius: '8px', border: `1px solid ${settings.isPremium ? '#10b981' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ margin: 0, fontWeight: '600', color: '#1f2937' }}>
                  {settings.isPremium ? '✓ Premium Member' : 'Free Plan'}
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  {settings.isPremium 
                    ? 'You have access to all premium features including AI-powered meal planning'
                    : 'Upgrade to unlock AI-powered meal planning and ingredient extraction'}
                </p>
              </div>
              {settings.isPremium && (
                <span style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  PREMIUM
                </span>
              )}
            </div>
            {!settings.isPremium && (
              <button
                onClick={async () => {
                  if (!user) return;
                  try {
                    await userSettingsService.updateUserSettings({
                      ...settings,
                      isPremium: true
                    });
                    setSettings(prev => ({ ...prev, isPremium: true }));
                    alert('Upgraded to Premium! You now have access to all premium features.');
                  } catch (error) {
                    console.error('Error upgrading:', error);
                    alert('Failed to upgrade. Please try again.');
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Upgrade to Premium
              </button>
            )}
          </div>

          <button
            onClick={handleSignOut}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>

        <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Notifications
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => setSettings(prev => ({ ...prev, notificationsEnabled: e.target.checked }))}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <span>Enable best by date reminders</span>
            </label>
          </div>
          {!notificationService.isSupported() && (
            <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>
              Your browser does not support notifications. Please use a modern browser like Chrome, Firefox, Safari, or Edge.
            </p>
          )}
          {notificationService.isSupported() && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
            <p style={{ color: '#f59e0b', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>
              Notifications require a secure connection (HTTPS). Please access this site over HTTPS to enable notifications.
            </p>
          )}
          {notificationService.isSupported() && Notification.permission !== 'granted' && (
            <button
              onClick={handleRequestNotifications}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Request Notification Permission
            </button>
          )}
        </div>

        <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Regional Settings
          </h2>
          <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
            Configure these settings to help AI accurately parse dates and weights from labels
          </p>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="dateFormat" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Date Format
            </label>
            <select
              id="dateFormat"
              value={settings.dateFormat || 'MM/DD/YYYY'}
              onChange={(e) => setSettings(prev => ({ ...prev, dateFormat: e.target.value as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' }))}
              style={{
                width: '100%',
                maxWidth: '300px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                backgroundColor: '#ffffff'
              }}
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (EU/UK)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
            </select>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              This format will be used when AI parses ambiguous dates from labels
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="weightUnit" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Weight Unit
            </label>
            <select
              id="weightUnit"
              value={settings.weightUnit || 'pounds'}
              onChange={(e) => setSettings(prev => ({ ...prev, weightUnit: e.target.value as 'pounds' | 'kilograms' }))}
              style={{
                width: '100%',
                maxWidth: '300px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                backgroundColor: '#ffffff'
              }}
            >
              <option value="pounds">Pounds (lb)</option>
              <option value="kilograms">Kilograms (kg)</option>
            </select>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Preferred weight unit for AI to consider when parsing labels
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Reminder Settings
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="reminderDays" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Remind me (days before best by date)
            </label>
            <input
              type="number"
              id="reminderDays"
              min="1"
              max="30"
              value={settings.reminderDays}
              onChange={(e) => setSettings(prev => ({ ...prev, reminderDays: parseInt(e.target.value) || 7 }))}
              style={{
                width: '100%',
                maxWidth: '200px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              You'll receive reminders when items are approaching their best by date within this many days.
            </p>
          </div>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '0.75rem 1.5rem',
              backgroundColor: '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
    <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Settings;

