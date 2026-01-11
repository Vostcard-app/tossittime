import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    notificationsEnabled: false
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
            notificationsEnabled: false
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
      <Banner onMenuClick={() => setMenuOpen(true)} />

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Account
          </h2>
          <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>
            Signed in as: {user.email}
          </p>
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

