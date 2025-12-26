import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { shoppingListService, shoppingListsService, userSettingsService, userItemsService } from '../services/firebaseService';
import { findFoodItems } from '../services/foodkeeperService';
import type { ShoppingListItem, ShoppingList, UserItem } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';
import EditItemModal from '../components/EditItemModal';

const LAST_LIST_STORAGE_KEY = 'tossittime:lastShoppingListId';

const Shop: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
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
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [editingUserItem, setEditingUserItem] = useState<UserItem | null>(null);
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

  // Get FoodKeeper suggestions based on search query
  const foodKeeperSuggestions = useMemo(() => {
    if (!newItemName.trim()) {
      return [];
    }
    return findFoodItems(newItemName.trim(), 5); // Limit to 5 suggestions
  }, [newItemName]);

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

  const handleDelete = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this item from your shopping list?')) {
      try {
        await shoppingListService.deleteShoppingListItem(itemId);
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item. Please try again.');
      }
    }
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
        </div>

        {/* Shopping List Items */}
        <div>
          {shoppingListItems.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              <p>Your shopping list is empty. Add items above to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {shoppingListItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#ffffff',
                    transition: 'background-color 0.2s',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                    {item.name}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const userItem = userItems.find(ui => ui.name.toLowerCase() === item.name.toLowerCase());
                        if (userItem) {
                          setEditingUserItem(userItem);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                      aria-label="Edit item"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                      aria-label="Delete item"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Previously Used Items */}
        {previouslyUsedItems.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: '600', 
              color: '#1f2937', 
              marginBottom: '1rem' 
            }}>
              Previously Used
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {previouslyUsedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleAddPreviouslyUsedItem(item.name)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f9fafb',
                    transition: 'background-color 0.2s',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                >
                  <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                    {item.name}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {item.expirationLength} days
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingUserItem(item);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                      aria-label="Edit item"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {editingUserItem && (
        <EditItemModal
          item={editingUserItem}
          onClose={() => setEditingUserItem(null)}
          onSave={() => {
            // Refresh will happen automatically via subscription
            setEditingUserItem(null);
          }}
        />
      )}

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

