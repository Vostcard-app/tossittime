import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  // Hide Layout header on Dashboard, Calendar, and Shop since they have their own banners
  const showHeader = location.pathname !== '/' && location.pathname !== '/calendar' && location.pathname !== '/shop';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showHeader && (
        <header style={{
          backgroundColor: '#002B4D',
          color: '#ffffff',
          padding: '1rem',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
                TossItTime
              </h1>
            </Link>
          </div>
        </header>
      )}
      <main style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        {children}
      </main>
    </div>
  );
};

export default Layout;

