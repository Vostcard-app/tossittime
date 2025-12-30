import React from 'react';
import { Link } from 'react-router-dom';

interface BannerProps {
  /** Whether to show the home icon. Defaults to true. Set to false for Shop page. */
  showHomeIcon?: boolean;
  /** Handler for hamburger menu button click */
  onMenuClick: () => void;
  /** Maximum width of the banner content. Defaults to '1200px'. */
  maxWidth?: string;
}

/**
 * Banner Component
 * Standardized banner header used across all pages.
 * Includes home icon (conditionally), TossItTime text, and hamburger menu button.
 * 
 * @example
 * ```tsx
 * <Banner 
 *   showHomeIcon={true}
 *   onMenuClick={() => setMenuOpen(true)}
 * />
 * ```
 */
const Banner: React.FC<BannerProps> = ({ 
  showHomeIcon = true, 
  onMenuClick,
  maxWidth = '1200px'
}) => {
  return (
    <div style={{
      backgroundColor: '#002B4D',
      color: '#ffffff',
      padding: '1rem',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ maxWidth, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {showHomeIcon && (
            <Link 
              to="/shop" 
              style={{ 
                color: '#ffffff', 
                textDecoration: 'none', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#002B4D',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 43, 77, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#002B4D';
              }}
              aria-label="Go to shop"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* House base */}
                <rect x="6" y="12" width="12" height="8" fill="white" />
                {/* House roof */}
                <path d="M12 4L4 10H20L12 4Z" fill="white" />
                {/* Door */}
                <rect x="10" y="16" width="4" height="4" fill="#002B4D" />
              </svg>
            </Link>
          )}
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#ffffff' }}>
            TossItTime
          </h1>
        </div>
        <button
          onClick={onMenuClick}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'center',
            width: '88px',
            height: '88px',
            minWidth: '88px',
            minHeight: '88px',
            borderRadius: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Open menu"
        >
          <span style={{ width: '48px', height: '4px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          <span style={{ width: '48px', height: '4px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          <span style={{ width: '48px', height: '4px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
        </button>
      </div>
    </div>
  );
};

export default Banner;

