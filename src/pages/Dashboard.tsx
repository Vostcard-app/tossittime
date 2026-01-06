import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { foodItemService } from '../services';
import { formatDate } from '../utils/dateUtils';
import { notRecommendedToFreeze } from '../data/freezeGuidelines';
import SwipeableListItem from '../components/ui/SwipeableListItem';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import type { FoodItem } from '../types';
import { analyticsService } from '../services/analyticsService';
import { isDryCannedItem } from '../utils/storageUtils';

type FilterType = 'all' | 'fresh' | 'expiring_soon' | 'expired';
type StorageTabType = 'perishable' | 'dryCanned';

const Dashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [storageTab, setStorageTab] = useState<StorageTabType>('perishable');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showIndexWarning, setShowIndexWarning] = useState(false);
  const [showFreezeWarning, setShowFreezeWarning] = useState(false);
  const [pendingFreezeItem, setPendingFreezeItem] = useState<FoodItem | null>(null);
  const navigate = useNavigate();

  // Debug: Track state changes
  useEffect(() => {
    console.log('🔍 Modal state changed - showFreezeWarning:', showFreezeWarning, 'pendingFreezeItem:', pendingFreezeItem);
  }, [showFreezeWarning, pendingFreezeItem]);

  // Check for Firestore index warning
  useEffect(() => {
    const checkIndexWarning = () => {
      if (window.__firestoreIndexWarningShown) {
        setShowIndexWarning(true);
      }
    };
    checkIndexWarning();
    // Check periodically
    const interval = setInterval(checkIndexWarning, 1000);
    return () => clearInterval(interval);
  }, []);


  // Filter items by storage type (perishable vs dry/canned)
  const itemsByStorageType = useMemo(() => {
    const perishableItems: FoodItem[] = [];
    const dryCannedItems: FoodItem[] = [];
    
    foodItems.forEach(item => {
      if (isDryCannedItem(item)) {
        dryCannedItems.push(item);
      } else {
        perishableItems.push(item);
      }
    });
    
    return { perishableItems, dryCannedItems };
  }, [foodItems, isDryCannedItem]);

  // Combine storage tab filter with status filter
  const filteredItems = useMemo(() => {
    // First filter by storage type
    const storageFiltered = storageTab === 'perishable' 
      ? itemsByStorageType.perishableItems 
      : itemsByStorageType.dryCannedItems;
    
    // Then filter by status
    if (filter === 'all') return storageFiltered;
    return storageFiltered.filter(item => item.status === filter);
  }, [storageTab, itemsByStorageType, filter]);

  const handleDelete = useCallback(async (itemId: string) => {
    // Track engagement: core_action_used (toss)
    if (user) {
      const item = foodItems.find(i => i.id === itemId);
      await analyticsService.trackEngagement(user.uid, 'core_action_used', {
        action: 'toss',
        itemId,
        itemName: item?.name,
      });
    }
    // Note: Confirmation is now handled in SwipeableListItem component
    // This function is called only after user confirms
    try {
      await foodItemService.deleteFoodItem(itemId);
      // User remains on dashboard - no navigation needed
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
    }
  }, [user, foodItems]);

  const handleItemClick = useCallback((item: typeof foodItems[0]) => {
    navigate('/add', { state: { editingItem: item } });
  }, [navigate]);

  const handleFreezeItem = useCallback((item: typeof foodItems[0]) => {
    console.log('🔍 ===== FREEZE BUTTON CLICKED =====');
    console.log('🔍 handleFreezeItem called with item:', item);
    console.log('🔍 Item name:', item.name);
    // Track engagement: core_action_used (freeze)
    if (user) {
      analyticsService.trackEngagement(user.uid, 'core_action_used', {
        action: 'freeze',
        itemId: item.id,
        itemName: item.name,
      });
    }
    const normalizedName = item.name.trim().toLowerCase();
    console.log('🔍 Normalized name:', normalizedName);
    console.log('🔍 notRecommendedToFreeze list length:', notRecommendedToFreeze.length);
    console.log('🔍 First few items in list:', notRecommendedToFreeze.slice(0, 5));
    
    // Check for exact match OR if any list item is contained in the name
    let matchFound = false;
    let matchedItem = '';
    const isNotRecommended = notRecommendedToFreeze.some(listItem => {
      const normalizedItem = listItem.toLowerCase();
      const exactMatch = normalizedItem === normalizedName;
      const containsMatch = normalizedName.includes(normalizedItem);
      const match = exactMatch || containsMatch;
      if (match) {
        matchFound = true;
        matchedItem = listItem;
        console.log('✅ MATCH FOUND!', listItem, 'exactMatch:', exactMatch, 'containsMatch:', containsMatch);
      }
      return match;
    });
    
    console.log('⚠️ Final result - isNotRecommended:', isNotRecommended);
    if (matchFound) {
      console.log('⚠️ Matched item:', matchedItem);
    } else {
      console.log('❌ No match found for:', normalizedName);
    }
    
    if (isNotRecommended) {
      // Show warning modal
      console.log('📋 Showing freeze warning modal - NOT navigating');
      // Use functional updates to ensure both states are set together
      setPendingFreezeItem(item);
      setShowFreezeWarning(true);
      // Verify state was set
      setTimeout(() => {
        console.log('📋 State verification - showFreezeWarning should be true, pendingFreezeItem should exist');
      }, 0);
      // Explicitly prevent navigation
      return;
    } else {
      // Navigate directly
      console.log('✅ Item is safe to freeze, navigating directly');
      navigate('/add', { state: { editingItem: item, forceFreeze: true } });
    }
  }, [navigate, user]);

  const handleDismissFreezeWarning = () => {
    console.log('❌ Freeze warning dismissed - staying on dashboard');
    console.log('🔍 State before dismiss - showFreezeWarning:', showFreezeWarning, 'pendingFreezeItem:', pendingFreezeItem);
    setShowFreezeWarning(false);
    setPendingFreezeItem(null);
    console.log('🔍 State after dismiss - should be cleared');
  };

  const handleProceedWithFreeze = () => {
    if (pendingFreezeItem) {
      console.log('✅ Proceeding with freeze - navigating to add page');
      console.log('🔍 State before proceed - showFreezeWarning:', showFreezeWarning, 'pendingFreezeItem:', pendingFreezeItem);
      setShowFreezeWarning(false);
      navigate('/add', { state: { editingItem: pendingFreezeItem, forceFreeze: true } });
      setPendingFreezeItem(null);
      console.log('🔍 State after proceed - should be cleared');
    } else {
      console.warn('⚠️ handleProceedWithFreeze called but pendingFreezeItem is null!');
    }
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
      <Banner onMenuClick={() => setMenuOpen(true)} />

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

      {/* Storage Type Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setStorageTab('perishable')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: storageTab === 'perishable' ? '#002B4D' : '#f3f4f6',
            color: storageTab === 'perishable' ? 'white' : '#1f2937',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            flex: 1,
            minWidth: '150px'
          }}
        >
          Perishable ({itemsByStorageType.perishableItems.length})
        </button>
        <button
          onClick={() => setStorageTab('dryCanned')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: storageTab === 'dryCanned' ? '#002B4D' : '#f3f4f6',
            color: storageTab === 'dryCanned' ? 'white' : '#1f2937',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            flex: 1,
            minWidth: '150px'
          }}
        >
          Dry/Canned Goods ({itemsByStorageType.dryCannedItems.length})
        </button>
        <span style={{ 
          fontSize: '1.25rem', 
          color: '#6b7280', 
          marginRight: '0.75rem',
          alignSelf: 'center',
          fontWeight: '700',
          fontStyle: 'italic'
        }}>
          Tap items to edit
        </span>
        <button
          onClick={() => navigate('/add', { 
            state: { 
              storageType: storageTab === 'perishable' ? 'refrigerator' : 'pantry' 
            } 
          })}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#002B4D',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}
        >
          Add
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
            {filter === 'all' 
              ? `No ${storageTab === 'perishable' ? 'perishable' : 'dry/canned'} items yet.`
              : `No ${filter.replace('_', ' ')} ${storageTab === 'perishable' ? 'perishable' : 'dry/canned'} items.`}
          </p>
          <p style={{ marginBottom: '1.5rem' }}>
            {filter === 'all' 
              ? `Add your first ${storageTab === 'perishable' ? 'perishable' : 'dry/canned'} item to start tracking expiration dates!`
              : 'Try a different filter.'}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => navigate('/add', { 
                state: { 
                  storageType: storageTab === 'perishable' ? 'refrigerator' : 'pantry' 
                } 
              })}
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
              onFreeze={() => handleFreezeItem(item)}
            />
          ))}
        </div>
      )}
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Freeze Warning Modal */}
      {showFreezeWarning && pendingFreezeItem && (() => {
        console.log('🎨 Rendering FreezeWarningModal - showFreezeWarning:', showFreezeWarning, 'pendingFreezeItem:', pendingFreezeItem);
        return (
          <FreezeWarningModal
            itemName={pendingFreezeItem.name}
            onDismiss={handleDismissFreezeWarning}
            onProceed={handleProceedWithFreeze}
          />
        );
      })()}
    </>
  );
};

// Freeze Warning Modal Component
interface FreezeWarningModalProps {
  itemName: string;
  onDismiss: () => void;
  onProceed: () => void;
}

const FreezeWarningModal: React.FC<FreezeWarningModalProps> = ({ itemName, onDismiss, onProceed }) => {
  console.log('🎨 FreezeWarningModal rendering with itemName:', itemName);
  const [modalJustOpened, setModalJustOpened] = useState(true);
  
  // Prevent backdrop clicks immediately after modal opens
  useEffect(() => {
    const timer = setTimeout(() => {
      setModalJustOpened(false);
    }, 100); // Prevent clicks for 100ms after opening
    return () => clearTimeout(timer);
  }, []);
  
  // Use portal to render outside normal DOM hierarchy and ensure it's on top
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onClick={(e) => {
        // Prevent dismissal if modal just opened
        if (modalJustOpened) {
          console.log('🔒 Backdrop click blocked - modal just opened');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Only dismiss if clicking directly on backdrop (not child elements)
        if (e.target === e.currentTarget) {
          console.log('✅ Backdrop clicked - dismissing modal');
          onDismiss();
        }
      }}
      onMouseDown={(e) => {
        // Prevent mouse down from triggering click if modal just opened
        if (modalJustOpened && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          minWidth: '300px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Not Recommended to Freeze
        </h3>

        <p style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', color: '#374151', lineHeight: '1.5' }}>
          <strong>{itemName}</strong> is not recommended to freeze. Freezing may cause changes in texture, quality, or safety.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onProceed}
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
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Dashboard;

