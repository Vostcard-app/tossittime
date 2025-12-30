import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { shoppingListService, shoppingListsService, userSettingsService, userItemsService, foodItemService } from '../services/firebaseService';
import { findFoodItems } from '../services/foodkeeperService';
import type { ShoppingListItem, ShoppingList } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';
import { useFoodItems } from '../hooks/useFoodItems';
import { analyticsService } from '../services/analyticsService';

const LAST_LIST_STORAGE_KEY = 'tossittime:lastShoppingListId';

const Shop: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const { foodItems } = useFoodItems(user || null);
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [showAddListToast, setShowAddListToast] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [userItems, setUserItems] = useState<any[]>([]);
  const lastUsedListIdRef = useRef<string | null>(null);
  const settingsLoadedRef = useRef(false);

  // Load user settings
  useEffect(() => {
    if (!user) {
      setSettingsLoaded(true);
      setLoading(false);
      return;
    }

    // DON'T reset selectedListId here - it prevents restoration

    const loadSettings = async () => {
      try {
        const settings = await userSettingsService.getUserSettings(user.uid);
        const loadedLastUsedId = settings?.lastUsedShoppingListId || null;
        console.log('⚙️ Settings loaded:', { lastUsedShoppingListId: loadedLastUsedId, settings });
        lastUsedListIdRef.current = loadedLastUsedId;
      } catch (error) {
        console.error('Error loading user settings:', error);
        lastUsedListIdRef.current = null;
      } finally {
        setSettingsLoaded(true);
        settingsLoadedRef.current = true;
        console.log('✅ Settings loading complete, settingsLoaded = true');
      }
    };

    loadSettings();
  }, [user]);

  // Update settingsLoadedRef whenever settingsLoaded changes
  useEffect(() => {
    settingsLoadedRef.current = settingsLoaded;
  }, [settingsLoaded]);

  // Persist selection whenever user changes lists (safety net for handleCreateList, etc.)
  useEffect(() => {
    if (!user) return;
    if (!settingsLoaded) return; // avoid writing before initial load
    if (!selectedListId) return;
    if (lastUsedListIdRef.current === selectedListId) return; // avoid duplicate writes

    // Update ref
    lastUsedListIdRef.current = selectedListId;
    
    userSettingsService.setLastUsedShoppingList(user.uid, selectedListId)
      .catch(err => console.error('Failed to persist lastUsedShoppingListId:', err));
  }, [user, settingsLoaded, selectedListId]);


  // Load shopping lists
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribeLists = shoppingListsService.subscribeToShoppingLists(user.uid, (lists: ShoppingList[]) => {
      console.log('📦 Shopping lists updated:', lists.map(l => ({ id: l.id, name: l.name, isDefault: l.isDefault })));
      setShoppingLists(lists);
    });

    return () => unsubscribeLists();
  }, [user]);

  // Restore selected list after settings + lists load
  useEffect(() => {
    if (!user) return;
    if (!settingsLoaded) return;
    if (shoppingLists.length === 0) return;

    const storedId = localStorage.getItem(LAST_LIST_STORAGE_KEY);
    const savedId = lastUsedListIdRef.current;

    // Keep current valid selection
    if (selectedListId && shoppingLists.some(l => l.id === selectedListId)) return;

    // Restore from localStorage if valid
    if (storedId && shoppingLists.some(l => l.id === storedId)) {
      setSelectedListId(storedId);
      return;
    }

    // Restore from settings if valid
    if (savedId && shoppingLists.some(l => l.id === savedId)) {
      setSelectedListId(savedId);
      return;
    }

    // Check for default list
    const defaultList = shoppingLists.find(l => l.isDefault);
    if (defaultList) {
      setSelectedListId(defaultList.id);
      return;
    }

    // Final fallback
    setSelectedListId(shoppingLists[0].id);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, settingsLoaded, shoppingLists]);

  // Load items when selectedListId changes (using subscription for real-time updates)
  useEffect(() => {
    if (!user || !selectedListId) {
      setShoppingListItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = shoppingListService.subscribeToShoppingList(
      user.uid,
      selectedListId,
      (items) => {
        setShoppingListItems(items);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, selectedListId]);

  // Load user items for previously used items
  useEffect(() => {
    if (!user) {
      setUserItems([]);
      return;
    }

    const unsubscribe = userItemsService.subscribeToUserItems(
      user.uid,
      (items) => {
        setUserItems(items);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Debug: Log foodItems and shopping list items changes
  useEffect(() => {
    if (user) {
      console.log('🍔 FoodItems in Shop:', {
        count: foodItems.length,
        items: foodItems.map(fi => fi.name),
        shoppingListItems: shoppingListItems.map(sli => sli.name)
      });
    }
  }, [foodItems, user, shoppingListItems]);

  // Get FoodKeeper suggestions based on search query
  const foodKeeperSuggestions = useMemo(() => {
    if (!newItemName.trim()) {
      return [];
    }
    return findFoodItems(newItemName.trim(), 5); // Limit to 5 suggestions
  }, [newItemName]);

  // Separate items into active and crossed off based on crossedOff field
  const { regularItems, crossedOffItems } = useMemo(() => {
    const regular: ShoppingListItem[] = [];
    const crossedOff: ShoppingListItem[] = [];
    
    // Separate shopping list items based on crossedOff field
    shoppingListItems.forEach(item => {
      if (item.crossedOff === true) {
        // Item is marked as crossed off
        crossedOff.push(item);
      } else {
        // Item is not crossed off (crossedOff is false or undefined)
        regular.push(item);
      }
    });
    
    return { regularItems: regular, crossedOffItems: crossedOff };
  }, [shoppingListItems]);

  // Filter and sort previously used items (exclude items already in current list)
  const previouslyUsedItems = useMemo(() => {
    if (!selectedListId || shoppingListItems.length === 0) {
      return userItems;
    }
    
    const currentListNames = new Set(shoppingListItems.map(item => item.name.toLowerCase()));
    return userItems
      .filter(item => !currentListNames.has(item.name.toLowerCase()))
      .sort((a, b) => {
        if (!a.lastUsed && !b.lastUsed) return 0;
        if (!a.lastUsed) return 1;
        if (!b.lastUsed) return -1;
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      });
  }, [userItems, shoppingListItems, selectedListId]);

  // Merge crossed-off items and previously used items into one unified list
  type MergedItem = {
    id: string;
    name: string;
    isCrossedOff: boolean;
    type: 'shoppingListItem' | 'userItem';
    expirationLength?: number;
    shoppingListItemId?: string;
    shoppingListItem?: ShoppingListItem;
    userItem?: any;
  };

  const mergedItems = useMemo(() => {
    const merged: MergedItem[] = [];
    
    // Add crossed-off items first
    crossedOffItems.forEach(item => {
      merged.push({
        id: item.id,
        name: item.name,
        isCrossedOff: true,
        type: 'shoppingListItem',
        shoppingListItemId: item.id,
        shoppingListItem: item
      });
    });
    
    // Add previously used items
    previouslyUsedItems.forEach(item => {
      merged.push({
        id: item.id,
        name: item.name,
        isCrossedOff: false,
        type: 'userItem',
        expirationLength: item.expirationLength,
        userItem: item
      });
    });
    
    return merged;
  }, [crossedOffItems, previouslyUsedItems]);

  // Handle adding previously used item to current list
  const handleAddPreviouslyUsedItem = async (itemName: string) => {
    if (!user || !selectedListId) {
      alert('Please select a list first');
      return;
    }

    try {
      await shoppingListService.addShoppingListItem(user.uid, selectedListId, itemName);
      // Update lastUsed for the userItem
      const userItem = userItems.find(ui => ui.name.toLowerCase() === itemName.toLowerCase());
      if (userItem) {
        await userItemsService.createOrUpdateUserItem(user.uid, {
          name: userItem.name,
          expirationLength: userItem.expirationLength,
          category: userItem.category
        });
      }
    } catch (error) {
      console.error('Error adding previously used item:', error);
      alert('Failed to add item to list. Please try again.');
    }
  };

  // Handle marking item as crossed off (swipe action)
  const handleMarkAsCrossedOff = async (item: ShoppingListItem) => {
    if (!user) return;
    
    try {
      await shoppingListService.updateShoppingListItemCrossedOff(item.id, true);
      // Track engagement
      if (user) {
        await analyticsService.trackEngagement(user.uid, 'shopping_list_item_crossed_off', {
          action: 'swipe_to_cross_off',
          itemName: item.name,
        });
      }
    } catch (error) {
      console.error('Error marking item as crossed off:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  // Handle adding crossed-off item directly to active list
  const handleAddCrossedOffItem = async (item: ShoppingListItem) => {
    if (!user) {
      alert('Please log in first');
      return;
    }

    try {
      // Set crossedOff to false to make the item active again
      await shoppingListService.updateShoppingListItemCrossedOff(item.id, false);
      
      // Track engagement: shopping_list_item_crossed_off (uncrossed)
      await analyticsService.trackEngagement(user.uid, 'shopping_list_item_crossed_off', {
        itemName: item.name,
        action: 'uncrossed',
      });

      // Find the matching food item from dashboard (case-insensitive) and delete it if it exists
      const itemNameLower = item.name.trim().toLowerCase();
      const matchingFoodItem = foodItems.find(
        fi => fi.name.trim().toLowerCase() === itemNameLower
      );

      if (matchingFoodItem) {
        // Delete the food item from dashboard
        await foodItemService.deleteFoodItem(matchingFoodItem.id);
      }

      // Update lastUsed for the userItem if it exists
      const userItem = userItems.find(ui => ui.name.toLowerCase() === itemNameLower);
      if (userItem) {
        await userItemsService.createOrUpdateUserItem(user.uid, {
          name: userItem.name,
          expirationLength: userItem.expirationLength,
          category: userItem.category
        });
      }
    } catch (error) {
      console.error('Error handling crossed-off item:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('Please log in to add items.');
      return;
    }
    
    if (!newItemName.trim()) {
      alert('Please enter an item name.');
      return;
    }
    
    // Determine list for internal use ONLY — do not mutate UI state
    let listIdToUse = selectedListId;

    if (!listIdToUse && shoppingLists.length > 0) {
      listIdToUse = selectedListId && shoppingLists.some(l => l.id === selectedListId)
        ? selectedListId
        : (lastUsedListIdRef.current && shoppingLists.some(l => l.id === lastUsedListIdRef.current))
          ? lastUsedListIdRef.current
          : shoppingLists[0].id;
    }

    // DO NOT call setSelectedListId here
    
    if (!listIdToUse) {
      alert('Please select a list first.');
      return;
    }

    try {
      await shoppingListService.addShoppingListItem(user.uid, listIdToUse, newItemName.trim());
      
      // Track engagement: shopping_list_item_added
      await analyticsService.trackEngagement(user.uid, 'shopping_list_item_added', {
        itemName: newItemName.trim(),
      });
      setNewItemName('');
      setShowDropdown(false);
    } catch (error) {
      console.error('Error adding item to shopping list:', error);
      alert('Failed to add item. Please try again.');
    }
  };

  const handleListChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const listId = e.target.value;

    if (listId === '__add_list__') {
      setShowAddListToast(true);
      setNewListName('');
      e.target.value = selectedListId || '';
      return;
    }

    setSelectedListId(listId);
    lastUsedListIdRef.current = listId;
    localStorage.setItem(LAST_LIST_STORAGE_KEY, listId);

    if (user) {
      userSettingsService
        .setLastUsedShoppingList(user.uid, listId)
        .catch(err =>
          console.error('Failed to persist lastUsedShoppingListId:', err)
        );
    }
  };

  const handleCreateListClick = () => {
    if (shoppingLists.length === 0) {
      // Show toast to create first list
      setShowAddListToast(true);
      setNewListName('');
    } else {
      // Navigate to edit-lists page
      navigate('/edit-lists');
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newListName.trim()) {
      setShowAddListToast(false);
      return;
    }

    try {
      const listId = await shoppingListsService.createShoppingList(user.uid, newListName.trim(), false);
      setNewListName('');
      setShowAddListToast(false);
      // Automatically select the newly created list
      setSelectedListId(listId);
      lastUsedListIdRef.current = listId;
      localStorage.setItem(LAST_LIST_STORAGE_KEY, listId);
      // Persistence will be handled by the effect
    } catch (error) {
      console.error('Error creating shopping list:', error);
      alert('Failed to create list. Please try again.');
      setShowAddListToast(false);
    }
  };

  const handleCancelCreateList = () => {
    setShowAddListToast(false);
    setNewListName('');
  };

  const handleItemClick = (item: ShoppingListItem) => {
    navigate('/add', { state: { fromShoppingList: true, shoppingListItemId: item.id, itemName: item.name } });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading shopping list...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view your shopping list.</p>
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
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              minWidth: '44px',
              minHeight: '44px'
            }}
            aria-label="Open menu"
          >
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          </button>
        </div>
      </div>

      {/* Shop, List, and Calendar Buttons */}
      <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#002B4D',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            minHeight: '44px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
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
          onClick={() => navigate('/calendar', { state: { defaultView: 'week' } })}
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
          Calendar
        </button>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        {/* List Selector and Lists Button */}
        <div style={{ 
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <select
              value={selectedListId || ''}
              onChange={handleListChange}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none',
                backgroundColor: '#ffffff',
                cursor: 'pointer'
              }}
            >
              {shoppingLists.length === 0 ? (
                <option value="">No lists available</option>
              ) : (
                <>
                  {!selectedListId && <option value="">Select a list</option>}
                  {shoppingLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                  <option value="__add_list__" style={{ fontStyle: 'italic', color: '#6b7280' }}>
                    + Add list
                  </option>
                </>
              )}
            </select>
            <button
              onClick={handleCreateListClick}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                minHeight: '44px',
                minWidth: '100px'
              }}
            >
              {shoppingLists.length === 0 ? 'Create list' : 'Lists'}
            </button>
          </div>

          {/* Add Item Form */}
          <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => {
                  setNewItemName(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  setInputFocused(true);
                  setShowDropdown(true);
                }}
                onBlur={() => {
                  setInputFocused(false);
                  // Delay hiding dropdown to allow item clicks
                  setTimeout(() => {
                    setShowDropdown(false);
                  }, 200);
                }}
                placeholder="Add item to list"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  outline: 'none'
                }}
              />
              {/* Dropdown with FoodKeeper suggestions */}
              {showDropdown && (inputFocused || newItemName.trim()) && foodKeeperSuggestions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                >
                  {foodKeeperSuggestions.map((suggestion, index) => (
                    <div
                      key={`foodkeeper-${suggestion.name}-${index}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setNewItemName(suggestion.name);
                        setShowDropdown(false);
                        setInputFocused(false);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        backgroundColor: '#fef3c7' // Light yellow to distinguish
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fde68a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef3c7';
                      }}
                    >
                      <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                        {suggestion.name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {suggestion.category}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                minHeight: '44px',
                minWidth: '100px'
              }}
            >
              Add Item
            </button>
          </form>
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '0.875rem', 
            color: '#6b7280',
            textAlign: 'left'
          }}>
            Swipe to remove
          </div>
        </div>

        {/* Shopping List Items */}
        <div style={{ 
          position: 'relative', 
          minHeight: '400px',
          width: '100%',
          paddingBottom: '2rem'
        }}>
          
          {/* Items - in front */}
          <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
            {shoppingListItems.length === 0 ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center', 
                color: '#6b7280',
                position: 'relative',
                zIndex: 1
              }}>
                <p>Your shopping list is empty. Add items above to get started.</p>
              </div>
            ) : (
              <>
                {/* Regular Items */}
                {regularItems.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {regularItems.map((item) => {
                      const SwipeableActiveItem = () => {
                        const [translateX, setTranslateX] = useState(0);
                        const [isDragging, setIsDragging] = useState(false);
                        const [startX, setStartX] = useState(0);
                        const itemRef = useRef<HTMLDivElement>(null);
                        const SWIPE_THRESHOLD = 100;

                        const handleTouchStart = (e: React.TouchEvent) => {
                          setStartX(e.touches[0].clientX);
                          setIsDragging(true);
                        };

                        const handleTouchMove = (e: React.TouchEvent) => {
                          if (!isDragging) return;
                          const currentX = e.touches[0].clientX;
                          const diff = currentX - startX;
                          // Only allow swiping right (positive diff)
                          if (diff > 0) {
                            setTranslateX(Math.min(diff, SWIPE_THRESHOLD * 2));
                          }
                        };

                        const handleTouchEnd = () => {
                          setIsDragging(false);
                          if (translateX >= SWIPE_THRESHOLD) {
                            handleMarkAsCrossedOff(item);
                            setTranslateX(0);
                            return;
                          } else {
                            setTranslateX(0);
                          }
                        };

                        const handleMouseDown = (e: React.MouseEvent) => {
                          setStartX(e.clientX);
                          setIsDragging(true);
                        };

                        useEffect(() => {
                          if (isDragging) {
                            const handleGlobalMouseMove = (e: MouseEvent) => {
                              const diff = e.clientX - startX;
                              if (diff > 0) {
                                setTranslateX(Math.min(diff, SWIPE_THRESHOLD * 2));
                              }
                            };

                            const handleGlobalMouseUp = () => {
                              setIsDragging(false);
                              if (translateX >= SWIPE_THRESHOLD) {
                                handleMarkAsCrossedOff(item);
                                setTranslateX(0);
                                return;
                              } else {
                                setTranslateX(0);
                              }
                            };

                            document.addEventListener('mousemove', handleGlobalMouseMove);
                            document.addEventListener('mouseup', handleGlobalMouseUp);

                            return () => {
                              document.removeEventListener('mousemove', handleGlobalMouseMove);
                              document.removeEventListener('mouseup', handleGlobalMouseUp);
                            };
                          }
                        }, [isDragging, startX, translateX, item]);

                        const swipeOpacity = Math.min(translateX / SWIPE_THRESHOLD, 1);

                        return (
                          <div
                            ref={itemRef}
                            style={{
                              position: 'relative',
                              overflow: 'hidden',
                              borderRadius: '8px',
                              backgroundColor: '#ffffff',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                          >
                            {/* Swipe background indicator */}
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${Math.min(translateX, SWIPE_THRESHOLD)}px`,
                                backgroundColor: '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                paddingLeft: '1rem',
                                color: 'white',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                opacity: swipeOpacity,
                                transition: isDragging ? 'none' : 'opacity 0.2s'
                              }}
                            >
                              {translateX >= SWIPE_THRESHOLD ? '✓ Added' : '→ Swipe'}
                            </div>
                            
                            {/* Item content */}
                            <div
                              onTouchStart={handleTouchStart}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
                              onMouseDown={handleMouseDown}
                              style={{
                                padding: '0.5rem 1rem',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: '#ffffff',
                                transform: `translateX(${translateX}px)`,
                                transition: isDragging ? 'none' : 'transform 0.2s',
                                cursor: 'grab',
                                userSelect: 'none'
                              }}
                            >
                              <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                                {item.name}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleItemClick(item);
                                  }}
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
                                  aria-label="Add to calendar"
                                >
                                  + Cal
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      };

                      return <SwipeableActiveItem key={item.id} />;
                    })}
                  </div>
                )}

                {/* Merged List: Crossed Off and Previously Used Items */}
                {mergedItems.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ 
                      fontSize: '1.125rem', 
                      fontWeight: '600', 
                      color: '#1f2937', 
                      marginBottom: '1rem' 
                    }}>
                      Previously Used
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {mergedItems.map((mergedItem) => (
                        <div
                          key={mergedItem.id}
                          onClick={() => {
                            if (mergedItem.type === 'userItem') {
                              handleAddPreviouslyUsedItem(mergedItem.name);
                            }
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: mergedItem.type === 'userItem' ? 'pointer' : 'default',
                            backgroundColor: '#f9fafb',
                            transition: 'background-color 0.2s',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                          }}
                          onMouseEnter={(e) => {
                            if (mergedItem.type === 'userItem') {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (mergedItem.type === 'userItem') {
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                            }
                          }}
                        >
                          <div style={{ 
                            fontSize: '1rem', 
                            fontWeight: '500', 
                            color: mergedItem.isCrossedOff ? '#1f2937' : '#1f2937',
                            textDecoration: mergedItem.isCrossedOff ? 'line-through' : 'none'
                          }}>
                            {mergedItem.name}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {mergedItem.isCrossedOff && mergedItem.shoppingListItem && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddCrossedOffItem(mergedItem.shoppingListItem!);
                                }}
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
                                aria-label="Add item"
                              >
                                Add
                              </button>
                            )}
                            {!mergedItem.isCrossedOff && mergedItem.expirationLength !== undefined && (
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                {mergedItem.expirationLength} days
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      </div>

      {/* Toast-style popup for creating first list */}
      {showAddListToast && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            zIndex: 1000,
            minWidth: '300px',
            maxWidth: '90vw'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
            Create New List
          </h3>
          <form onSubmit={handleCreateList}>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Enter list name"
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelCreateList}
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
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Backdrop overlay */}
      {showAddListToast && (
        <div
          onClick={handleCancelCreateList}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }}
        />
      )}

      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Shop;

