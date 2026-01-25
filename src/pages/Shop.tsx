import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { shoppingListService, shoppingListsService, userSettingsService, userItemsService, foodItemService } from '../services';
import { findFoodItems } from '../services/foodkeeperService';
import type { ShoppingListItem, ShoppingList, LabelScanResult } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import LabelScanner from '../components/features/LabelScanner';
import { useFoodItems } from '../hooks/useFoodItems';
import { analyticsService } from '../services/analyticsService';

import { STORAGE_KEYS } from '../constants';
import { capitalizeItemName } from '../utils/formatting';
import { categoryService } from '../services/categoryService';
import { getFoodItemStatus } from '../utils/statusUtils';

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
  const [editingQuantityItemId, setEditingQuantityItemId] = useState<string | null>(null);
  const [editingQuantityValue, setEditingQuantityValue] = useState<string>('');
  const [editingNameItemId, setEditingNameItemId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [scanningItem, setScanningItem] = useState<ShoppingListItem | null>(null);
  const [showAddItemScanner, setShowAddItemScanner] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const lastUsedListIdRef = useRef<string | null>(null);
  const settingsLoadedRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const cursorPositionRef = useRef<{ start: number; end: number } | null>(null);

  // Load user settings and premium status
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
        const premiumStatus = settings?.isPremium === true;
        console.log('⚙️ Settings loaded:', { lastUsedShoppingListId: loadedLastUsedId, settings });
        lastUsedListIdRef.current = loadedLastUsedId;
        setIsPremium(premiumStatus);
      } catch (error) {
        console.error('Error loading user settings:', error);
        lastUsedListIdRef.current = null;
        setIsPremium(false);
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

    const storedId = localStorage.getItem(STORAGE_KEYS.LAST_SHOPPING_LIST_ID);
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

  // Separate items into active and crossed off based on crossedOff field
  const regularItems = useMemo(() => {
    return shoppingListItems.filter(item => item.crossedOff !== true);
  }, [shoppingListItems]);


  // Get FoodKeeper suggestions based on search query
  const foodKeeperSuggestions = useMemo(() => {
    if (!newItemName.trim()) {
      return [];
    }
    return findFoodItems(newItemName.trim(), 5); // Limit to 5 suggestions
  }, [newItemName]);


  // Restore cursor position after re-renders when editing name
  useEffect(() => {
    if (editingNameItemId && nameInputRef.current && cursorPositionRef.current) {
      const { start, end } = cursorPositionRef.current;
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (nameInputRef.current) {
          const textLength = nameInputRef.current.value.length;
          // Ensure cursor position doesn't exceed text length
          const safeStart = Math.min(start, textLength);
          const safeEnd = Math.min(end, textLength);
          nameInputRef.current.setSelectionRange(safeStart, safeEnd);
        }
      }, 0);
    }
  }, [editingNameItemId, editingNameValue, shoppingListItems]);


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


  const handleQuantityClick = (item: ShoppingListItem) => {
    // Cancel name editing if active
    if (editingNameItemId === item.id) {
      setEditingNameItemId(null);
      setEditingNameValue('');
    }
    setEditingQuantityItemId(item.id);
    setEditingQuantityValue((item.quantity || 1).toString());
  };

  const handleQuantityChange = async (item: ShoppingListItem, newQuantity: number) => {
    if (!user) return;
    
    if (newQuantity < 1) {
      alert('Quantity must be at least 1');
      return;
    }

    try {
      await shoppingListService.updateShoppingListItem(user.uid, item.id, { quantity: newQuantity });
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
    } catch (error) {
      console.error('Error updating quantity:', error);
      alert('Failed to update quantity. Please try again.');
    }
  };

  const handleQuantityInputBlur = (item: ShoppingListItem) => {
    const quantity = parseInt(editingQuantityValue, 10);
    if (isNaN(quantity) || quantity < 1) {
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
      return;
    }
    handleQuantityChange(item, quantity);
  };

  const handleQuantityInputKeyDown = (e: React.KeyboardEvent, item: ShoppingListItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const quantity = parseInt(editingQuantityValue, 10);
      if (isNaN(quantity) || quantity < 1) {
        setEditingQuantityItemId(null);
        setEditingQuantityValue('');
        return;
      }
      handleQuantityChange(item, quantity);
    } else if (e.key === 'Escape') {
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
    }
  };

  const handleNameClick = (item: ShoppingListItem) => {
    // Cancel quantity editing if active
    if (editingQuantityItemId === item.id) {
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
    }
    setEditingNameItemId(item.id);
    setEditingNameValue(item.name);
    // Reset cursor position when starting to edit
    cursorPositionRef.current = null;
  };

  const handleNameChange = async (item: ShoppingListItem, newName: string) => {
    if (!user) return;
    
    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert('Item name cannot be empty');
      return;
    }

    try {
      const capitalizedName = capitalizeItemName(trimmedName);
      await shoppingListService.updateShoppingListItemName(item.id, capitalizedName);
      setEditingNameItemId(null);
      setEditingNameValue('');
    } catch (error) {
      console.error('Error updating item name:', error);
      alert('Failed to update item name. Please try again.');
    }
  };

  const handleNameInputBlur = (item: ShoppingListItem) => {
    const trimmedName = editingNameValue.trim();
    if (!trimmedName) {
      setEditingNameItemId(null);
      setEditingNameValue('');
      return;
    }
    handleNameChange(item, trimmedName);
  };

  const handleNameInputKeyDown = (e: React.KeyboardEvent, item: ShoppingListItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmedName = editingNameValue.trim();
      if (!trimmedName) {
        setEditingNameItemId(null);
        setEditingNameValue('');
        return;
      }
      handleNameChange(item, trimmedName);
    } else if (e.key === 'Escape') {
      setEditingNameItemId(null);
      setEditingNameValue('');
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
      const capitalizedName = capitalizeItemName(newItemName);
      await shoppingListService.addShoppingListItem(user.uid, listIdToUse, capitalizedName, false, undefined, undefined, 1);
      
      // Create/update UserItem to ensure item is in master list
      try {
        // Detect category using AI for Premium users, keyword matching for others
        const category = await categoryService.detectCategoryWithAI(capitalizedName, user.uid);
        
        await userItemsService.createOrUpdateUserItem(user.uid, {
          name: capitalizedName,
          expirationLength: 7, // Default, can be edited later
          category: category
        });
      } catch (userItemError) {
        console.error('Error creating UserItem:', userItemError);
        // Don't block the add if UserItem creation fails
      }
      
      // Track engagement: shopping_list_item_added
      await analyticsService.trackEngagement(user.uid, 'shopping_list_item_added', {
        itemName: capitalizedName,
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
      localStorage.setItem(STORAGE_KEYS.LAST_SHOPPING_LIST_ID, listId);

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
      localStorage.setItem(STORAGE_KEYS.LAST_SHOPPING_LIST_ID, listId);
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

  const handleScanLabel = (item: ShoppingListItem) => {
    setScanningItem(item);
    setShowLabelScanner(true);
  };

  const handleLabelScanResult = async (result: LabelScanResult) => {
    if (!user || !scanningItem) return;

    try {
      // Add item to dashboard
      const capitalizedName = capitalizeItemName(result.itemName);
      const itemData = {
        name: capitalizedName,
        quantity: result.quantity || 1,
        ...(result.expirationDate && { bestByDate: result.expirationDate })
      };

      const status = result.expirationDate ? getFoodItemStatus(result.expirationDate) : 'fresh';
      await foodItemService.addFoodItem(user.uid, itemData, status);

      // Save to userItems if expiration date exists
      if (result.expirationDate) {
        try {
          const addedDate = new Date();
          const expirationLength = Math.ceil((result.expirationDate.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
          const category = await categoryService.detectCategoryWithAI(capitalizedName, user.uid);
          
          await userItemsService.createOrUpdateUserItem(user.uid, {
            name: capitalizedName,
            expirationLength: Math.max(1, expirationLength),
            category: category
          });
        } catch (error) {
          console.error('Error saving to userItems:', error);
        }
      }

      // Remove shopping list item
      await shoppingListService.deleteShoppingListItem(scanningItem.id);

      // Track engagement
      await analyticsService.trackEngagement(user.uid, 'label_scanned_item_added', {
        itemName: capitalizedName,
        hasQuantity: result.quantity !== undefined,
        hasExpirationDate: result.expirationDate !== null
      });

      // Close scanner and navigate to dashboard
      setShowLabelScanner(false);
      setScanningItem(null);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error adding scanned item:', error);
      alert('Failed to add item. Please try again.');
    }
  };

  const handleLabelScannerError = (error: Error) => {
    console.error('Label scanner error:', error);
    alert(error.message || 'Failed to scan label. Please try again.');
  };

  const handleLabelScannerClose = () => {
    setShowLabelScanner(false);
    setScanningItem(null);
  };

  // Handle scan for adding new item to dashboard
  const handleAddItemScanClick = () => {
    if (isPremium) {
      setShowAddItemScanner(true);
    } else {
      alert('Upgrade to Premium to use AI label scanning');
    }
  };

  // Handle scan result for adding new item
  const handleAddItemScanResult = async (result: LabelScanResult) => {
    try {
      if (!user) {
        alert('Please log in to add items.');
        return;
      }

      // Detect category using AI
      const capitalizedName = capitalizeItemName(result.itemName);
      const detectedCategory = await categoryService.detectCategoryWithAI(capitalizedName, user.uid);

      // Navigate to AddItem page with scanned data
      navigate('/add', {
        state: {
          scannedLabelData: {
            itemName: capitalizedName,
            quantity: result.quantity || 1,
            expirationDate: result.expirationDate,
            category: detectedCategory
          }
        }
      });

      setShowAddItemScanner(false);

      // Track analytics
      analyticsService.trackEngagement(user.uid, 'label_scanned', {
        feature: 'label_scanner_add_item',
        hasQuantity: result.quantity !== null && result.quantity !== undefined,
        hasExpirationDate: result.expirationDate !== null && result.expirationDate !== undefined
      });
    } catch (error) {
      console.error('Error processing label scan for add item:', error);
      alert('Failed to process scanned label. Please try again.');
      setShowAddItemScanner(false);
    }
  };

  // Handle add item scanner error
  const handleAddItemScannerError = (error: Error) => {
    console.error('Add item scanner error:', error);
    alert(`Error scanning label: ${error.message}`);
    setShowAddItemScanner(false);
  };

  // Handle add item scanner close
  const handleAddItemScannerClose = () => {
    setShowAddItemScanner(false);
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
        <Banner showHomeIcon={false} onMenuClick={() => setMenuOpen(true)} maxWidth="1400px" />

        {/* Lists, Items, and Plan Buttons */}
        <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#002B4D',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1.25rem',
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
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem', paddingTop: '1.5rem', paddingBottom: '2rem', marginTop: '160px' }}>
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
                fontSize: '1.25rem',
                fontWeight: '500',
                fontFamily: 'inherit',
                color: '#1f2937',
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
                  {shoppingLists.map((list) => {
                    // Capitalize the list name for display (first letter of each word)
                    const displayName = list.name
                      .split(/\s+/)
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                      .join(' ');
                    return (
                      <option key={list.id} value={list.id} style={{ fontSize: '1.25rem' }}>
                        {displayName}
                    </option>
                    );
                  })}
                  <option value="__add_list__" style={{ fontStyle: 'italic', color: '#6b7280' }}>
                    + Add list
                  </option>
                </>
              )}
            </select>
            <button
              onClick={handleCreateListClick}
              style={{
                padding: '0.75rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1.25rem',
                fontWeight: '500',
                cursor: 'pointer',
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
                  {/* FoodKeeper suggestions */}
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="submit"
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1.5rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  minHeight: '42px',
                  minWidth: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Add item"
                title="Add item"
              >
                +
              </button>
              {/* Scan icon button for adding new item - Premium only */}
              {isPremium && (
                <button
                  type="button"
                  onClick={handleAddItemScanClick}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '44px',
                    minHeight: '44px'
                  }}
                  aria-label="Scan label to add item"
                  title="Scan label with AI to add item"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  >
                    {/* Top-left corner bracket */}
                    <path d="M4 4V8H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Top-right corner bracket */}
                    <path d="M20 4V8H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Bottom-left corner bracket */}
                    <path d="M4 20V16H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Bottom-right corner bracket */}
                    <path d="M20 20V16H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Central horizontal line */}
                    <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          </form>
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '1.25rem', 
            color: '#1f2937',
            textAlign: 'center',
            fontStyle: 'italic'
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
                          // Allow swiping both left and right
                          const clampedDiff = Math.max(-SWIPE_THRESHOLD * 2, Math.min(diff, SWIPE_THRESHOLD * 2));
                          setTranslateX(clampedDiff);
                        };

                        const handleTouchEnd = () => {
                          setIsDragging(false);
                          if (Math.abs(translateX) >= SWIPE_THRESHOLD) {
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
                              // Allow swiping both left and right
                              const clampedDiff = Math.max(-SWIPE_THRESHOLD * 2, Math.min(diff, SWIPE_THRESHOLD * 2));
                              setTranslateX(clampedDiff);
                            };

                            const handleGlobalMouseUp = () => {
                              setIsDragging(false);
                              if (Math.abs(translateX) >= SWIPE_THRESHOLD) {
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

                        const swipeOpacity = Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1);
                        const isSwiped = Math.abs(translateX) >= SWIPE_THRESHOLD;
                        const isLeftSwipe = translateX < 0;

                        return (
                          <div
                            ref={itemRef}
                  style={{
                              position: 'relative',
                              overflow: 'hidden',
                              borderRadius: '8px',
                              backgroundColor: item.mealId ? '#f3f4f6' : '#ffffff',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                          >
                            {/* Swipe background indicator - shows on left for left swipe, right for right swipe */}
                            {translateX !== 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  ...(isLeftSwipe ? { right: 0 } : { left: 0 }),
                                  top: 0,
                                  bottom: 0,
                                  width: `${Math.min(Math.abs(translateX), SWIPE_THRESHOLD)}px`,
                                  backgroundColor: '#10b981',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: isLeftSwipe ? 'flex-end' : 'flex-start',
                                  ...(isLeftSwipe ? { paddingRight: '1rem' } : { paddingLeft: '1rem' }),
                                  color: 'white',
                                  fontSize: '0.875rem',
                                  fontWeight: '500',
                                  opacity: swipeOpacity,
                                  transition: isDragging ? 'none' : 'opacity 0.2s'
                                }}
                              >
                                {isSwiped ? '✓ Added' : (isLeftSwipe ? '← Swipe' : '→ Swipe')}
                              </div>
                            )}
                            
                            {/* Item content */}
                            <div
                              onTouchStart={handleTouchStart}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
                              onMouseDown={handleMouseDown}
                              style={{
                                padding: '0.25rem 0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: item.mealId ? '#f3f4f6' : '#ffffff',
                                transform: `translateX(${translateX}px)`,
                                transition: isDragging ? 'none' : 'transform 0.2s',
                                cursor: 'grab',
                                userSelect: 'none'
                  }}
                >
                              <div style={{ fontSize: '1.25rem', fontWeight: '500', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {editingQuantityItemId === item.id ? (
                      <input
                        type="number"
                        min="1"
                        value={editingQuantityValue}
                        onChange={(e) => setEditingQuantityValue(e.target.value)}
                        onBlur={() => handleQuantityInputBlur(item)}
                        onKeyDown={(e) => handleQuantityInputKeyDown(e, item)}
                        autoFocus
                        style={{
                          width: '50px',
                          padding: '0.25rem 0.5rem',
                          border: '2px solid #002B4D',
                          borderRadius: '4px',
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          textAlign: 'center',
                          outline: 'none'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuantityClick(item);
                        }}
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color: '#002B4D',
                          cursor: 'pointer',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: '#f0f8ff',
                          minWidth: '40px',
                          textAlign: 'center',
                          display: 'inline-block'
                        }}
                        title="Tap to edit quantity"
                      >
                        {item.quantity || 1}
                      </span>
                    )}
                    {editingNameItemId === item.id ? (
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => {
                          const input = e.target;
                          // Save cursor position before state update
                          cursorPositionRef.current = {
                            start: input.selectionStart || 0,
                            end: input.selectionEnd || 0
                          };
                          setEditingNameValue(e.target.value);
                          // Restore cursor position after state update
                          setTimeout(() => {
                            if (nameInputRef.current && cursorPositionRef.current) {
                              const { start, end } = cursorPositionRef.current;
                              const textLength = nameInputRef.current.value.length;
                              // Ensure cursor position doesn't exceed text length
                              const safeStart = Math.min(start, textLength);
                              const safeEnd = Math.min(end, textLength);
                              nameInputRef.current.setSelectionRange(safeStart, safeEnd);
                            }
                          }, 0);
                        }}
                        onBlur={() => handleNameInputBlur(item)}
                        onKeyDown={(e) => handleNameInputKeyDown(e, item)}
                        autoFocus
                        style={{
                          flex: 1,
                          padding: '0.25rem 0.5rem',
                          border: '2px solid #002B4D',
                          borderRadius: '4px',
                          fontSize: '1.25rem',
                          fontWeight: '500',
                          outline: 'none',
                          minWidth: '150px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNameClick(item);
                        }}
                        style={{
                          cursor: 'pointer',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="Tap to edit name"
                      >
                        {item.name}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isPremium && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScanLabel(item);
                        }}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '44px',
                          minHeight: '44px'
                        }}
                        aria-label="Scan label"
                        title="Scan label with AI"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ display: 'inline-block', verticalAlign: 'middle' }}
                        >
                          {/* Top-left corner bracket */}
                          <path d="M4 4V8H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          {/* Top-right corner bracket */}
                          <path d="M20 4V8H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          {/* Bottom-left corner bracket */}
                          <path d="M4 20V16H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          {/* Bottom-right corner bracket */}
                          <path d="M20 20V16H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          {/* Central horizontal line */}
                          <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
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
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                      aria-label="Add to calendar"
                    >
                      <span>+</span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ display: 'inline-block', verticalAlign: 'middle' }}
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                        <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                      </svg>
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

      {/* Add Item Scanner Modal */}
      {showAddItemScanner && (
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
          onClick={handleAddItemScannerClose}
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
              onScan={handleAddItemScanResult}
              onError={handleAddItemScannerError}
              onClose={handleAddItemScannerClose}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default Shop;

