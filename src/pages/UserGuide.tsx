import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Banner from '../components/layout/Banner';
import HamburgerMenu from '../components/layout/HamburgerMenu';

const UserGuide: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Banner showHomeIcon={false} onMenuClick={() => setMenuOpen(true)} maxWidth="1400px" />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Lists, Items, and Plan Buttons */}
      <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/shop')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px'
          }}
        >
          Lists
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px'
          }}
        >
          Items
        </button>
        <button
          onClick={() => navigate('/planned-meal-calendar')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px'
          }}
        >
          Plan
        </button>
      </div>

      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem 1rem',
        minHeight: '100vh',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: '#1f2937',
            marginBottom: '0.5rem'
          }}>
            User Guide
          </h1>

          <div style={{
          fontSize: '1rem',
          lineHeight: '1.75',
          color: '#4b5563'
        }}>
          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Getting Started
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              Welcome to TimeToUseIt! This guide will help you get the most out of the app to track your food items and reduce waste.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Shop Page
            </h2>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Adding Items to Your Shopping List
            </h3>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                Type an item name in the "Add item to list" field and tap "Add Item"
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Items are automatically capitalized for consistency
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Suggestions will appear as you type based on previously used items
              </li>
            </ul>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Active Items
            </h3>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Swipe left or right</strong> on any active item to mark it as crossed off (moved to "Previously Used")
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Tap the <strong>"+ Cal"</strong> button to add an item to your calendar with a best by date
              </li>
            </ul>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Previously Used Items
            </h3>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Swipe left or right</strong> on any previously used item to add it back to your active shopping list
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Crossed-off items can also be swiped to make them active again
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Adding Items to Calendar
            </h2>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                From the Shop page, tap <strong>"+ Cal"</strong> on any item
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Enter or adjust the best by date (dates are suggestions, not guarantees)
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Check the "Freeze" box if you're freezing the item (you'll see a warning if freezing isn't recommended)
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Optionally add a photo, barcode, quantity, category, or notes
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Tap "Save" to add the item to your calendar
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Calendar View
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              Your calendar shows items with color-coded days:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#fbbf24' }}>Yellow (2 days)</strong> - Best by soon
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#3b82f6' }}>Blue (2 days)</strong> - Freeze recommended
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#ef4444' }}>Red (1 day)</strong> - Past best by date
              </li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>
              Tap any item on the calendar to edit its details.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Dashboard
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              View all your active food items with their best by dates:
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Toss</strong> button - Remove an item from your list (swipe left on mobile)
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Freeze</strong> button - Navigate to the add page to freeze an item
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Tap any item to edit its details
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Managing Your Lists
            </h2>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Edit Lists
            </h3>
            <p style={{ marginBottom: '1rem' }}>
              Create, rename, or delete shopping lists. Your default list is "Shop list".
            </p>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Edit Items
            </h3>
            <p style={{ marginBottom: '1rem' }}>
              Edit item names, best by date lengths, and categories. This includes both active and previously used items.
            </p>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: '1.5rem',
              marginBottom: '0.75rem'
            }}>
              Edit Categories
            </h3>
            <p style={{ marginBottom: '1rem' }}>
              Manage your item categories for better organization.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Tips & Best Practices
            </h2>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                Add items to your calendar as soon as you purchase them for accurate tracking
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Use the freeze feature to extend the life of items that can be frozen
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Check your calendar regularly to see what's approaching its best by date
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Swipe items off your shopping list when you've purchased them
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Edit items to customize best by date lengths based on your experience
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '1rem',
              marginTop: '2rem'
            }}>
              Need Help?
            </h2>
            <p style={{ marginBottom: '1rem' }}>
              If you have questions or encounter any issues, please contact support through the app settings.
            </p>
          </section>
          </div>
        </div>
      </div>
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default UserGuide;

