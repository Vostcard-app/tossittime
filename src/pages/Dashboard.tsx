import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { foodItemService, mealPlanningService, userSettingsService } from '../services';
import { formatDate } from '../utils/dateUtils';
import { notRecommendedToFreeze } from '../data/freezeGuidelines';
import SwipeableListItem from '../components/ui/SwipeableListItem';
import LabelScanner from '../components/features/LabelScanner';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import type { FoodItem, LabelScanResult } from '../types';
import { analyticsService } from '../services/analyticsService';
import { isDryCannedItem } from '../utils/storageUtils';
import { getStatusLabel, getFoodItemStatus } from '../utils/statusUtils';
import { detectCategory, type FoodCategory } from '../utils/categoryUtils';
import type { PlannedMeal } from '../types';
import { capitalizeItemName } from '../utils/formatting';

type FilterType = 'all' | 'bestBySoon' | 'pastBestBy';
type StorageTabType = 'perishable' | 'dryCanned';
type CategoryFilterType = 'all' | FoodCategory;

const Dashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [storageTab, setStorageTab] = useState<StorageTabType>('perishable');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterType>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showIndexWarning, setShowIndexWarning] = useState(false);
  const [showFreezeWarning, setShowFreezeWarning] = useState(false);
  const [pendingFreezeItem, setPendingFreezeItem] = useState<FoodItem | null>(null);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([]);
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [scanningItem, setScanningItem] = useState<FoodItem | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(false);
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

  // Load planned meals to check if items are reserved
  useEffect(() => {
    if (!user) {
      setPlannedMeals([]);
      return;
    }

    const loadPlannedMeals = async () => {
      try {
        const meals = await mealPlanningService.loadAllPlannedMealsForMonth(user.uid);
        setPlannedMeals(meals);
      } catch (error) {
        console.error('Error loading planned meals:', error);
        setPlannedMeals([]);
      }
    };

    loadPlannedMeals();
  }, [user]);

  // Check premium status
  useEffect(() => {
    const checkPremium = async () => {
      if (!user) {
        setIsPremium(false);
        return;
      }
      try {
        const premium = await userSettingsService.isPremiumUser(user.uid);
        setIsPremium(premium);
      } catch (error) {
        console.error('Error checking premium status:', error);
        setIsPremium(false);
      }
    };
    checkPremium();
  }, [user]);


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

  // Helper function to get date for sorting
  const getSortDate = (item: FoodItem): Date | null => {
    return item.bestByDate || item.thawDate || null;
  };

  // Helper function to sort items by best by date
  const sortByDate = (items: FoodItem[]): FoodItem[] => {
    return [...items].sort((a, b) => {
      const dateA = getSortDate(a);
      const dateB = getSortDate(b);
      
      // Items without dates go to the end
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      // Sort by date (earliest first)
      return dateA.getTime() - dateB.getTime();
    });
  };

  // Helper function to check if item is reserved (by usedByMeals or by meal plan)
  const isItemReserved = useCallback((item: FoodItem): boolean => {
    // Check usedByMeals field first
    if (item.usedByMeals && item.usedByMeals.length > 0) {
      return true;
    }
    
    // Fallback: Check if item is claimed by any dish in planned meals
    for (const meal of plannedMeals) {
      if (meal.dishes) {
        for (const dish of meal.dishes) {
          if (dish.claimedItemIds && dish.claimedItemIds.includes(item.id)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }, [plannedMeals]);

  // Combine storage tab filter with status filter and group by expiration status
  const groupedAndFilteredItems = useMemo(() => {
    // First filter by storage type
    const storageFiltered = storageTab === 'perishable' 
      ? itemsByStorageType.perishableItems 
      : itemsByStorageType.dryCannedItems;
    
    // Then filter by status if not 'all'
    const statusFiltered = filter === 'all' 
      ? storageFiltered 
      : storageFiltered.filter(item => item.status === filter);
    
    // Filter by category if perishable and category filter is set
    let categoryFiltered = statusFiltered;
    if (storageTab === 'perishable' && categoryFilter !== 'all') {
      categoryFiltered = statusFiltered.filter(item => {
        // Use stored category if available, otherwise auto-detect
        const itemCategory = (item.category as FoodCategory) || detectCategory(item.name);
        return itemCategory === categoryFilter;
      });
    }
    
    // Separate items used by meals from items not used by meals
    const planned: FoodItem[] = [];
    const notPlanned: FoodItem[] = [];
    
    categoryFiltered.forEach(item => {
      if (isItemReserved(item)) {
        planned.push(item);
      } else {
        notPlanned.push(item);
      }
    });
    
    // Group not-planned items into "About to Expire" and "Everything else"
    const aboutToExpire: FoodItem[] = [];
    const everythingElse: FoodItem[] = [];
    
    notPlanned.forEach(item => {
      if (item.status === 'bestBySoon') {
        aboutToExpire.push(item);
      } else {
        everythingElse.push(item);
      }
    });
    
    // Sort each group by best by date
    return {
      aboutToExpire: sortByDate(aboutToExpire),
      everythingElse: sortByDate(everythingElse),
      planned: sortByDate(planned)
    };
  }, [storageTab, itemsByStorageType, filter, categoryFilter, plannedMeals, isItemReserved]);

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

  const handleScanLabel = useCallback((item: typeof foodItems[0]) => {
    setScanningItem(item);
    setShowLabelScanner(true);
  }, []);

  const handleLabelScanResult = useCallback(async (result: LabelScanResult) => {
    if (!user || !scanningItem) return;

    try {
      // Update the existing item with scanned data
      const capitalizedName = capitalizeItemName(result.itemName);
      const updates: Partial<FoodItem> = {
        name: capitalizedName,
        ...(result.quantity !== undefined && { quantity: result.quantity }),
        ...(result.expirationDate && { bestByDate: result.expirationDate })
      };

      // Calculate status if expiration date is provided
      const status = result.expirationDate ? getFoodItemStatus(result.expirationDate) : scanningItem.status;
      
      await foodItemService.updateFoodItem(scanningItem.id, { ...updates, status });

      // Note: Category detection could be added here if needed for future updates

      // Track engagement
      await analyticsService.trackEngagement(user.uid, 'label_scanned_item_updated', {
        itemId: scanningItem.id,
        itemName: capitalizedName,
        hasQuantity: result.quantity !== undefined,
        hasExpirationDate: result.expirationDate !== null
      });

      // Close scanner
      setShowLabelScanner(false);
      setScanningItem(null);
    } catch (error) {
      console.error('Error updating scanned item:', error);
      alert('Failed to update item. Please try again.');
    }
  }, [user, scanningItem]);

  const handleLabelScannerError = useCallback((error: Error) => {
    console.error('Label scanner error:', error);
    alert(error.message || 'Failed to scan label. Please try again.');
  }, []);

  const handleLabelScannerClose = useCallback(() => {
    setShowLabelScanner(false);
    setScanningItem(null);
  }, []);

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
      {/* Fixed Header: Banner and Navigation Buttons */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
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
      </div>

      {/* Scrollable Content Container */}
      <div style={{
        marginTop: '160px', // Approximate height of fixed header (Banner ~80px + Navigation ~76px + padding)
        height: 'calc(100vh - 160px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
        // Removed touchAction: 'pan-y' - let children handle their own touch actions
      }}>
        {/* Main Content */}
        <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '5px', paddingBottom: '2rem' }}>
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


      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '5px', marginBottom: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'bestBySoon', 'pastBestBy'] as FilterType[]).map((filterType) => (
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
            {filterType === 'all' ? 'All' : getStatusLabel(filterType as any)} ({filterType === 'all' ? foodItems.length : foodItems.filter(i => i.status === filterType).length})
          </button>
        ))}
      </div>

      {/* Today's Date */}
      <div style={{ marginBottom: '5px', padding: '2px 0', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
          {formatDate(new Date())}
        </div>
      </div>

      {/* Storage Type Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
            onClick={() => {
              setStorageTab('perishable');
              setCategoryFilter('all'); // Reset category filter when switching tabs
            }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: storageTab === 'perishable' ? '#002B4D' : '#f9fafb',
            color: storageTab === 'perishable' ? 'white' : '#1f2937',
            border: storageTab === 'perishable' ? '3px solid #002B4D' : '2px solid #d1d5db',
            borderBottom: storageTab === 'perishable' ? '4px solid #002B4D' : '2px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: storageTab === 'perishable' ? '600' : '500',
            cursor: 'pointer',
            flex: 1,
            minWidth: '150px',
            boxShadow: storageTab === 'perishable' ? '0 3px 6px rgba(0, 43, 77, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s ease'
          }}
        >
          Perishable ({itemsByStorageType.perishableItems.length})
        </button>
        <button
            onClick={() => {
              setStorageTab('dryCanned');
              setCategoryFilter('all'); // Reset category filter when switching tabs
            }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: storageTab === 'dryCanned' ? '#002B4D' : '#f9fafb',
            color: storageTab === 'dryCanned' ? 'white' : '#1f2937',
            border: storageTab === 'dryCanned' ? '3px solid #002B4D' : '2px solid #d1d5db',
            borderBottom: storageTab === 'dryCanned' ? '4px solid #002B4D' : '2px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: storageTab === 'dryCanned' ? '600' : '500',
            cursor: 'pointer',
            flex: 1,
            minWidth: '150px',
            boxShadow: storageTab === 'dryCanned' ? '0 3px 6px rgba(0, 43, 77, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s ease'
          }}
        >
          Dry/Canned ({itemsByStorageType.dryCannedItems.length})
        </button>
        <span style={{ 
          fontSize: '1.25rem', 
          color: '#6b7280', 
          marginRight: '0.75rem',
          alignSelf: 'center',
          fontWeight: '700',
          fontStyle: 'italic'
        }}>
          Tap + hold to remove items
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

      {/* Category Filter - Only show for perishable items, positioned under Perishable tab */}
      {storageTab === 'perishable' && (
        <div style={{ marginBottom: '1rem', marginTop: '0.5rem' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilterType)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ffffff',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            <option value="all">All Categories</option>
            <option value="Proteins">Proteins</option>
            <option value="Vegetables">Vegetables</option>
            <option value="Fruits">Fruits</option>
            <option value="Dairy">Dairy</option>
            <option value="Leftovers">Leftovers</option>
            <option value="Other">Other</option>
          </select>
        </div>
      )}

      {groupedAndFilteredItems.aboutToExpire.length === 0 && groupedAndFilteredItems.everythingElse.length === 0 && groupedAndFilteredItems.planned.length === 0 ? (
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
          {/* About to Expire Section */}
          {groupedAndFilteredItems.aboutToExpire.length > 0 && (
            <>
              <div style={{ 
                marginTop: '1rem', 
                marginBottom: '0.75rem', 
                padding: '0.5rem 0',
                borderBottom: '2px solid #eab308'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#1f2937' 
                }}>
                  About to Expire
                </h3>
              </div>
              {groupedAndFilteredItems.aboutToExpire.map((item) => (
                <SwipeableListItem
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                  onClick={() => handleItemClick(item)}
                  onFreeze={() => handleFreezeItem(item)}
                  onScan={() => handleScanLabel(item)}
                  showScanButton={isPremium}
                  isReserved={isItemReserved(item)}
                />
              ))}
            </>
          )}

          {/* Everything Else Section */}
          {groupedAndFilteredItems.everythingElse.length > 0 && (
            <>
              {groupedAndFilteredItems.aboutToExpire.length > 0 && (
                <div style={{ 
                  marginTop: '1.5rem', 
                  marginBottom: '0.75rem', 
                  padding: '0.5rem 0',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    color: '#1f2937' 
                  }}>
                    Everything else
                  </h3>
                </div>
              )}
              {groupedAndFilteredItems.everythingElse.map((item) => (
                <SwipeableListItem
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                  onClick={() => handleItemClick(item)}
                  onFreeze={() => handleFreezeItem(item)}
                  onScan={() => handleScanLabel(item)}
                  showScanButton={isPremium}
                  isReserved={isItemReserved(item)}
                />
              ))}
            </>
          )}

          {/* Planned Section */}
          {groupedAndFilteredItems.planned.length > 0 && (
            <>
              <div style={{ 
                marginTop: groupedAndFilteredItems.aboutToExpire.length > 0 || groupedAndFilteredItems.everythingElse.length > 0 ? '1.5rem' : '1rem', 
                marginBottom: '0.75rem', 
                padding: '0.5rem 0',
                borderBottom: '2px solid #6366f1'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '1.125rem', 
                  fontWeight: '600', 
                  color: '#1f2937' 
                }}>
                  Planned
                </h3>
              </div>
              {groupedAndFilteredItems.planned.map((item) => (
                <SwipeableListItem
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                  onClick={() => handleItemClick(item)}
                  onFreeze={() => handleFreezeItem(item)}
                  onScan={() => handleScanLabel(item)}
                  showScanButton={isPremium}
                  isReserved={isItemReserved(item)}
                />
              ))}
            </>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Label Scanner Modal */}
      {showLabelScanner && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={handleLabelScannerClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <LabelScanner
              onScan={handleLabelScanResult}
              onError={handleLabelScannerError}
              onClose={handleLabelScannerClose}
            />
          </div>
        </div>
      )}

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

