import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { shoppingListService, shoppingListsService, userSettingsService } from '../services/firebaseService';
import type { ShoppingListItem, ShoppingList } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';

const Shop: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lastUsedListId, setLastUsedListId] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Load user settings first to get lastUsedShoppingListId
  useEffect(() => {
    if (!user) {
      setSettingsLoaded(true);
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      try {
        const settings = await userSettingsService.getUserSettings(user.uid);
        if (settings?.lastUsedShoppingListId) {
          setLastUsedListId(settings.lastUsedShoppingListId);
        }
      } catch (error) {
        console.error('Error loading user settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, [user]);

  // Initialize list selection when both lists and settings are available
  useEffect(() => {
    if (!user || !settingsLoaded || shoppingLists.length === 0 || selectedListId) {
      return;
    }

    // Try to restore last used list first
    if (lastUsedListId) {
      const lastUsedList = shoppingLists.find((l: ShoppingList) => l.id === lastUsedListId);
      if (lastUsedList) {
        setSelectedListId(lastUsedList.id);
        return;
      }
    }

    // Fall back to default list or first list
    const defaultList = shoppingLists.find((l: ShoppingList) => l.isDefault) || shoppingLists[0];
    if (defaultList) {
      setSelectedListId(defaultList.id);
    } else {
      // Create default "shop list" if no lists exist
      shoppingListsService.getDefaultShoppingList(user.uid).then((listId: string) => {
        setSelectedListId(listId);
      });
    }
  }, [user, settingsLoaded, shoppingLists, lastUsedListId, selectedListId]);

  // Load shopping lists
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribeLists = shoppingListsService.subscribeToShoppingLists(user.uid, (lists: ShoppingList[]) => {
      setShoppingLists(lists);
    });

    return () => unsubscribeLists();
  }, [user]);

  // Subscribe to shopping list items for selected list
  useEffect(() => {
    if (!user || !selectedListId) {
      setShoppingListItems([]);
      setLoading(false);
      return;
    }

    const unsubscribe = shoppingListService.subscribeToShoppingList(user.uid, selectedListId, (items) => {
      setShoppingListItems(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, selectedListId]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newItemName.trim() || !selectedListId) return;

    try {
      await shoppingListService.addShoppingListItem(user.uid, selectedListId, newItemName.trim());
      setNewItemName('');
    } catch (error) {
      console.error('Error adding item to shopping list:', error);
      alert('Failed to add item. Please try again.');
    }
  };

  const handleListChange = async (listId: string) => {
    setSelectedListId(listId);
    // Update local state and save as last used
    setLastUsedListId(listId);
    if (user) {
      await userSettingsService.setLastUsedShoppingList(user.uid, listId);
    }
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
              onChange={(e) => handleListChange(e.target.value)}
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
              {shoppingLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => navigate('/edit-lists')}
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
              Lists
            </button>
          </div>

          {/* Add Item Form */}
          <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Add item to list"
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
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
              ))}
            </div>
          )}
        </div>
      </div>

      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Shop;

