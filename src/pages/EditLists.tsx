import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { shoppingListsService, shoppingListService } from '../services/firebaseService';
import type { ShoppingList } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';

const EditLists: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [showAddListToast, setShowAddListToast] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  // Subscribe to shopping lists
  useEffect(() => {
    if (!user) return;

    const unsubscribe = shoppingListsService.subscribeToShoppingLists(user.uid, (lists: ShoppingList[]) => {
      setShoppingLists(lists);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddListClick = () => {
    setShowAddListToast(true);
    setNewListName('');
  };

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newListName.trim()) {
      setShowAddListToast(false);
      return;
    }

    try {
      await shoppingListsService.createShoppingList(user.uid, newListName.trim(), false);
      setNewListName('');
      setShowAddListToast(false);
    } catch (error) {
      console.error('Error creating shopping list:', error);
      alert('Failed to create list. Please try again.');
      setShowAddListToast(false);
    }
  };

  const handleCancelAddList = () => {
    setShowAddListToast(false);
    setNewListName('');
  };

  const handleDeleteList = async (listId: string) => {
    if (!user) return;

    // Confirm deletion
    if (!window.confirm('Are you sure you want to delete this list? All items in this list will also be deleted.')) {
      return;
    }

    setDeletingListId(listId);
    try {
      // First, delete all items in the list
      const items = await shoppingListService.getShoppingListItems(user.uid, listId);
      for (const item of items) {
        await shoppingListService.deleteShoppingListItem(item.id);
      }

      // Then delete the list itself
      await shoppingListsService.deleteShoppingList(listId);
    } catch (error) {
      console.error('Error deleting shopping list:', error);
      alert('Failed to delete list. Please try again.');
    } finally {
      setDeletingListId(null);
    }
  };

  // Check if we need to add getShoppingListItems back temporarily
  // Actually, let me check if there's a way to get items by listId
  // We might need to add a function to get items for a specific list

  return (
    <>
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
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
          onClick={() => navigate('/')}
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
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            Manage Lists
          </h2>
          <button
            onClick={handleAddListClick}
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
            Add List
          </button>
        </div>

        {/* Lists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {shoppingLists.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px dashed #d1d5db'
            }}>
              No lists yet. Click "Add List" to create your first list.
            </div>
          ) : (
            shoppingLists.map((list) => (
              <div
                key={list.id}
                style={{
                  backgroundColor: '#ffffff',
                  padding: '1rem',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: list.isDefault ? '2px solid #002B4D' : '1px solid #e5e7eb'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                      {list.name}
                    </span>
                    {list.isDefault && (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#002B4D',
                        color: '#ffffff',
                        borderRadius: '4px',
                        fontWeight: '500'
                      }}>
                        Default
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Created {new Date(list.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteList(list.id)}
                  disabled={deletingListId === list.id || list.isDefault}
                  style={{
                    background: list.isDefault ? '#f3f4f6' : 'none',
                    border: 'none',
                    color: list.isDefault ? '#9ca3af' : '#ef4444',
                    cursor: list.isDefault ? 'not-allowed' : 'pointer',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '36px',
                    minHeight: '36px',
                    borderRadius: '4px',
                    fontSize: '1.25rem',
                    opacity: deletingListId === list.id ? 0.5 : 1
                  }}
                  aria-label="Delete list"
                  title={list.isDefault ? 'Cannot delete default list' : 'Delete list'}
                >
                  {deletingListId === list.id ? '⏳' : '🗑️'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast-style popup for adding new list */}
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
            Add New List
          </h3>
          <form onSubmit={handleAddList}>
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
                onClick={handleCancelAddList}
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
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Backdrop overlay */}
      {showAddListToast && (
        <div
          onClick={handleCancelAddList}
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

export default EditLists;

