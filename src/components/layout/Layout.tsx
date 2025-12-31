/**
 * Layout Component
 * Main application layout wrapper with header and content area
 * Automatically hides header on pages that have their own navigation
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  /** Child components to render inside the layout */
  children: React.ReactNode;
}

/**
 * Layout component that provides consistent page structure
 */
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  // Hide Layout header on Dashboard, Calendar, Shop, EditLists, EditItems, EditCategories, Settings, Admin, UserGuide, MealPlanner, and MealProfile since they have their own banners
  const showHeader = location.pathname !== '/dashboard' && location.pathname !== '/calendar' && location.pathname !== '/shop' && location.pathname !== '/edit-lists' && location.pathname !== '/edit-items' && location.pathname !== '/edit-categories' && location.pathname !== '/settings' && location.pathname !== '/admin' && location.pathname !== '/user-guide' && location.pathname !== '/meal-planner' && location.pathname !== '/meal-profile';

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
          <Link to="/shop" style={{ textDecoration: 'none', color: 'inherit' }}>
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

