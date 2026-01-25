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
import { ShopListHeader } from '../components/shop/ShopListHeader';
import { ShopListItem } from '../components/shop/ShopListItem';
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
  const [editingUnitItemId, setEditingUnitItemId] = useState<string | null>(null);
  const [editingUnitValue, setEditingUnitValue] = useState<string>('');
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
    // Cancel name and unit editing if active
    if (editingNameItemId === item.id) {
      setEditingNameItemId(null);
      setEditingNameValue('');
    }
    if (editingUnitItemId === item.id) {
      setEditingUnitItemId(null);
      setEditingUnitValue('');
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

  const handleUnitClick = (item: ShoppingListItem) => {
    // Cancel quantity and name editing if active
    if (editingQuantityItemId === item.id) {
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
    }
    if (editingNameItemId === item.id) {
      setEditingNameItemId(null);
      setEditingNameValue('');
    }
    setEditingUnitItemId(item.id);
    setEditingUnitValue(item.quantityUnit || '');
  };

  const handleUnitBlur = async (item: ShoppingListItem) => {
    if (!user) return;

    const newUnit = editingUnitValue.trim();
    try {
      await shoppingListService.updateShoppingListItem(user.uid, item.id, { 
        quantityUnit: newUnit || undefined 
      });
      setEditingUnitItemId(null);
      setEditingUnitValue('');
    } catch (error) {
      console.error('Error updating unit:', error);
      alert('Failed to update unit. Please try again.');
    }
  };

  const handleNameClick = (item: ShoppingListItem) => {
    // Cancel quantity and unit editing if active
    if (editingQuantityItemId === item.id) {
      setEditingQuantityItemId(null);
      setEditingQuantityValue('');
    }
    if (editingUnitItemId === item.id) {
      setEditingUnitItemId(null);
      setEditingUnitValue('');
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
        <ShopListHeader
          shoppingLists={shoppingLists}
          selectedListId={selectedListId}
          onListChange={(listId) => {
            if (listId === '__add_list__') {
              handleCreateListClick();
            } else {
              handleListChange({ target: { value: listId } } as React.ChangeEvent<HTMLSelectElement>);
            }
          }}
          onCreateListClick={handleCreateListClick}
          newItemName={newItemName}
          onNewItemNameChange={(value) => {
            setNewItemName(value);
            setShowDropdown(true);
          }}
          onAddItem={handleAddItem}
          showDropdown={showDropdown}
          inputFocused={inputFocused}
          onInputFocus={() => {
            setInputFocused(true);
            setShowDropdown(true);
          }}
          onInputBlur={() => {
            setInputFocused(false);
            setTimeout(() => {
              setShowDropdown(false);
            }, 200);
          }}
          foodKeeperSuggestions={foodKeeperSuggestions}
          onSuggestionClick={(name) => {
            setNewItemName(name);
            setShowDropdown(false);
            setInputFocused(false);
          }}
          isPremium={isPremium}
          onAddItemScanClick={handleAddItemScanClick}
        />

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
                  {regularItems.map((item) => (
                    <ShopListItem
                      key={item.id}
                      item={item}
                      isPremium={isPremium}
                      editingQuantityItemId={editingQuantityItemId}
                      editingQuantityValue={editingQuantityValue}
                      onQuantityClick={handleQuantityClick}
                      onQuantityChange={setEditingQuantityValue}
                      onQuantityBlur={handleQuantityInputBlur}
                      onQuantityKeyDown={handleQuantityInputKeyDown}
                      editingUnitItemId={editingUnitItemId}
                      editingUnitValue={editingUnitValue}
                      onUnitClick={handleUnitClick}
                      onUnitChange={(value) => setEditingUnitValue(value)}
                      onUnitBlur={handleUnitBlur}
                      editingNameItemId={editingNameItemId}
                      editingNameValue={editingNameValue}
                      onNameClick={handleNameClick}
                      onNameChange={setEditingNameValue}
                      onNameBlur={handleNameInputBlur}
                      onNameKeyDown={handleNameInputKeyDown}
                      onMarkAsCrossedOff={handleMarkAsCrossedOff}
                      onScanLabel={handleScanLabel}
                      onAddToCalendar={handleItemClick}
                      nameInputRef={nameInputRef}
                      cursorPositionRef={cursorPositionRef}
                    />
                  ))}
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

