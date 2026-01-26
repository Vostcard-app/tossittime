/**
 * HamburgerMenu Component
 * Side navigation menu that slides in from the right
 * Includes app navigation, settings, and admin links
 * 
 * @example
 * ```tsx
 * <HamburgerMenu 
 *   isOpen={isMenuOpen}
 *   onClose={() => setIsMenuOpen(false)}
 * />
 * ```
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { adminService } from '../../services/adminService';

interface HamburgerMenuProps {
  /** Whether the menu is currently open */
  isOpen: boolean;
  /** Callback to close the menu */
  onClose: () => void;
}

/**
 * HamburgerMenu component with slide-in navigation
 */
const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOtherApps, setShowOtherApps] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        const adminStatus = await adminService.isAdmin(user.uid, user.email || null);
        setIsAdmin(adminStatus);
      }
    };
    checkAdmin();
  }, [user]);


  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLinkClick = (path: string) => {
    navigate(path);
    onClose();
  };


  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease-in-out'
        }}
        onClick={onClose}
      />
      
      {/* Menu Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '373px',
          maxWidth: '85vw',
          backgroundColor: '#ffffff',
          zIndex: 1000,
          boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out',
          overflowY: 'auto'
        }}
      >
        {/* Menu Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#1f2937' }}>
            Menu
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '4px'
            }}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* Menu Items */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          <Link
            to="/settings"
            onClick={() => handleLinkClick('/settings')}
            style={{
              display: 'flex',
              padding: '1rem 1.5rem',
              color: '#1f2937',
              textDecoration: 'none',
              fontSize: '22px',
              fontWeight: '500',
              transition: 'background-color 0.2s',
              borderLeft: '3px solid transparent',
              minHeight: '44px', // Touch target size for mobile
              alignItems: 'center'
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
            Settings
          </Link>
          <Link
            to="/calendar"
            onClick={() => handleLinkClick('/calendar')}
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
              alignItems: 'center'
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
            Calendar
          </Link>
          <Link
            to="/favorite-recipes"
            onClick={() => handleLinkClick('/favorite-recipes')}
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
              alignItems: 'center'
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
            Favorite Recipes
          </Link>
          <Link
            to="/favorite-websites"
            onClick={() => handleLinkClick('/favorite-websites')}
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
              alignItems: 'center'
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
            Favorite Websites
          </Link>
          <Link
            to="/edit-lists"
            onClick={() => handleLinkClick('/edit-lists')}
            style={{
              display: 'flex',
              padding: '1rem 1.5rem',
              color: '#1f2937',
              textDecoration: 'none',
              fontSize: '22px',
              fontWeight: '500',
              transition: 'background-color 0.2s',
              borderLeft: '3px solid transparent',
              minHeight: '44px', // Touch target size for mobile
              alignItems: 'center'
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
            Edit list
          </Link>
          <Link
            to="/edit-items"
            onClick={() => handleLinkClick('/edit-items')}
            style={{
              display: 'flex',
              padding: '1rem 1.5rem',
              color: '#1f2937',
              textDecoration: 'none',
              fontSize: '22px',
              fontWeight: '500',
              transition: 'background-color 0.2s',
              borderLeft: '3px solid transparent',
              minHeight: '44px', // Touch target size for mobile
              alignItems: 'center'
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
            Edit items
          </Link>
          <Link
            to="/user-guide"
            onClick={() => handleLinkClick('/user-guide')}
            style={{
              display: 'flex',
              padding: '1rem 1.5rem',
              color: '#1f2937',
              textDecoration: 'none',
              fontSize: '22px',
              fontWeight: '500',
              transition: 'background-color 0.2s',
              borderLeft: '3px solid transparent',
              minHeight: '44px', // Touch target size for mobile
              alignItems: 'center'
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
            User Guide
          </Link>
          <div>
            <button
              onClick={() => setShowOtherApps(!showOtherApps)}
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
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                justifyContent: 'space-between'
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
              <span>Our other apps</span>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {showOtherApps ? '▼' : '▶'}
              </span>
            </button>
            {showOtherApps && (
              <div style={{ backgroundColor: '#f9fafb' }}>
                <a
                  href="https://vostcard.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    padding: '0.75rem 1.5rem 0.75rem 3rem',
                    color: '#1f2937',
                    textDecoration: 'none',
                    fontSize: '22px',
                    fontWeight: '400',
                    transition: 'background-color 0.2s',
                    borderLeft: '3px solid transparent',
                    minHeight: '44px',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderLeftColor = '#002B4D';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderLeftColor = 'transparent';
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderLeftColor = '#002B4D';
                  }}
                  onTouchEnd={(e) => {
                    setTimeout(() => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                      e.currentTarget.style.borderLeftColor = 'transparent';
                    }, 200);
                  }}
                >
                  Vostcard
                </a>
                <a
                  href="https://whatspacked.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    padding: '0.75rem 1.5rem 0.75rem 3rem',
                    color: '#1f2937',
                    textDecoration: 'none',
                    fontSize: '22px',
                    fontWeight: '400',
                    transition: 'background-color 0.2s',
                    borderLeft: '3px solid transparent',
                    minHeight: '44px',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderLeftColor = '#002B4D';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderLeftColor = 'transparent';
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderLeftColor = '#002B4D';
                  }}
                  onTouchEnd={(e) => {
                    setTimeout(() => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                      e.currentTarget.style.borderLeftColor = 'transparent';
                    }, 200);
                  }}
                >
                  What's Packed
                </a>
              </div>
            )}
          </div>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => handleLinkClick('/admin')}
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
                alignItems: 'center'
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
              Admin
            </Link>
          )}
        </nav>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
};

export default HamburgerMenu;

