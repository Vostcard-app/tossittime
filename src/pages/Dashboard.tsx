import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { foodItemService } from '../services/firebaseService';
import { formatDate } from '../utils/dateUtils';
import SwipeableListItem from '../components/SwipeableListItem';
import HamburgerMenu from '../components/HamburgerMenu';

type FilterType = 'all' | 'fresh' | 'expiring_soon' | 'expired';

const Dashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showIndexWarning, setShowIndexWarning] = useState(false);
  const navigate = useNavigate();

  // Check for Firestore index warning
  useEffect(() => {
    const checkIndexWarning = () => {
      if ((window as any).__firestoreIndexWarningShown) {
        setShowIndexWarning(true);
      }
    };
    checkIndexWarning();
    // Check periodically
    const interval = setInterval(checkIndexWarning, 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return foodItems;
    return foodItems.filter(item => item.status === filter);
  }, [foodItems, filter]);

  const handleDelete = async (itemId: string) => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to delete this item?');
    if (!confirmed) {
      return; // User cancelled, do nothing
    }

    try {
      await foodItemService.deleteFoodItem(itemId);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleItemClick = (item: typeof foodItems[0]) => {
    navigate('/add', { state: { editingItem: item } });
  };


  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading your food items...</p>
      </div>
    );
  }

  return (
    <>
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
            TossItTime
          </h1>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px', // Touch target size for mobile
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
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
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          </button>
        </div>
      </div>

      {/* Shop, List and Calendar Buttons */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/shop')}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Lists
        </button>
        <button
          onClick={() => {
            // Already on Dashboard, just scroll to top or do nothing
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#002B4D',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Items
        </button>
        <button
          onClick={() => navigate('/calendar', { state: { defaultView: 'week' } })}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Calendar
        </button>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        {/* Firestore Index Warning */}
        {showIndexWarning && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem'
          }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#92400e' }}>
                ⚠️ Firestore Index Required
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#78350f' }}>
                Items are being saved, but they won't appear in the list until you create the Firestore index.
              </p>
              <a
                href="https://console.firebase.google.com/v1/r/project/tossittime/firestore/indexes?create_composite=Ckxwcm9qZWN0cy90b3NzaXR0aW1lL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9mb29kSXRlbXMvaW5kZXhlcy9fEAEaCgoGdXNlcklkEAEaEgoOZXhwaXJhdGlvbkRhdGUQARoMCghfX25hbWVfXxAB"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  marginTop: '0.5rem'
                }}
              >
                Create Index Now →
              </a>
            </div>
            <button
              onClick={() => setShowIndexWarning(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                color: '#92400e',
                padding: '0.25rem',
                lineHeight: 1,
                flexShrink: 0
              }}
              aria-label="Close warning"
            >
              ×
            </button>
          </div>
        )}


      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['all', 'fresh', 'expiring_soon', 'expired'] as FilterType[]).map((filterType) => (
          <button
            key={filterType}
            onClick={() => setFilter(filterType)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filter === filterType ? '#002B4D' : '#f3f4f6',
              color: filter === filterType ? 'white' : '#1f2937',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {filterType.replace('_', ' ')} ({filterType === 'all' ? foodItems.length : foodItems.filter(i => i.status === filterType).length})
          </button>
        ))}
      </div>

      {/* Today's Date */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
          {formatDate(new Date())}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
            {filter === 'all' ? 'No food items yet.' : `No ${filter.replace('_', ' ')} items.`}
          </p>
          <p style={{ marginBottom: '1.5rem' }}>
            {filter === 'all' ? 'Add your first food item to start tracking expiration dates!' : 'Try a different filter.'}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => navigate('/add')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Add Your First Item
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredItems.map((item) => (
            <SwipeableListItem
              key={item.id}
              item={item}
              onDelete={() => handleDelete(item.id)}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>
      )}
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Dashboard;

