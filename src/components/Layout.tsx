import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [user] = useAuthState(auth);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
              TossItTime
            </h1>
          </Link>
          {user && (
            <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Link
                to="/"
                style={{
                  textDecoration: 'none',
                  color: isActive('/') ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                  fontWeight: isActive('/') ? '600' : '400',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: isActive('/') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
                }}
              >
                Dashboard
              </Link>
              <Link
                to="/add"
                style={{
                  textDecoration: 'none',
                  color: isActive('/add') ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                  fontWeight: isActive('/add') ? '600' : '400',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: isActive('/add') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
                }}
              >
                Add Item
              </Link>
              <Link
                to="/calendar"
                style={{
                  textDecoration: 'none',
                  color: isActive('/calendar') ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                  fontWeight: isActive('/calendar') ? '600' : '400',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: isActive('/calendar') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
                }}
              >
                Calendar
              </Link>
              <Link
                to="/settings"
                style={{
                  textDecoration: 'none',
                  color: isActive('/settings') ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                  fontWeight: isActive('/settings') ? '600' : '400',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: isActive('/settings') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
                }}
              >
                Settings
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main style={{ flex: 1, backgroundColor: '#f5f5f5', paddingTop: '1rem', paddingBottom: '2rem' }}>
        {children}
      </main>
    </div>
  );
};

export default Layout;

