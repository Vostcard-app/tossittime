import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase/firebaseConfig';
import { userItemsService, userCategoriesService, shoppingListService, shoppingListsService } from '../services';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import type { UserItem, UserItemData, UserCategory, UserCategoryData, ShoppingListItem, ShoppingList } from '../types';
import { getErrorInfo } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';

type MergedEditItem = {
  id: string;
  name: string;
  isCrossedOff: boolean;
  type: 'shoppingListItem' | 'userItem';
  expirationLength?: number;
  shoppingListItemId?: string;
  shoppingListItem?: ShoppingListItem;
  userItem?: UserItem;
};

const EditItems: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [allShoppingListItems, setAllShoppingListItems] = useState<ShoppingListItem[]>([]);
  const [mergedItems, setMergedItems] = useState<MergedEditItem[]>([]);
  const [editingItem, setEditingItem] = useState<MergedEditItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to user items
  useEffect(() => {
    if (!user) {
      setUserItems([]);
      setLoading(false);
      return;
    }

    console.log('🔍 EditItems: Subscribing to user items for user:', user.uid);
    const unsubscribe = userItemsService.subscribeToUserItems(
      user.uid,
      (items) => {
        console.log('📦 EditItems: Received user items:', items.length, items);
        setUserItems(items);
      }
    );

    return () => {
      console.log('🔍 EditItems: Unsubscribing from user items');
      unsubscribe();
    };
  }, [user]);

  // Load shopping lists
  useEffect(() => {
    if (!user) {
      setShoppingLists([]);
      return;
    }

    const unsubscribe = shoppingListsService.subscribeToShoppingLists(
      user.uid,
      (lists: ShoppingList[]) => {
        setShoppingLists(lists);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load ALL items from all shopping lists (both active and crossed-off)
  useEffect(() => {
    if (!user || shoppingLists.length === 0) {
      setAllShoppingListItems([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const itemsByList: Map<string, ShoppingListItem[]> = new Map();

    shoppingLists.forEach(list => {
      const unsubscribe = shoppingListService.subscribeToShoppingList(
        user.uid,
        list.id,
        (items) => {
          // Get ALL items (both active and crossed-off)
          itemsByList.set(list.id, items);
          
          // Combine all items from all lists
          const allItems: ShoppingListItem[] = [];
          itemsByList.forEach(listItems => {
            listItems.forEach(item => {
              if (!allItems.find(existing => existing.id === item.id)) {
                allItems.push(item);
              }
            });
          });
          
          setAllShoppingListItems(allItems);
        }
      );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, shoppingLists]);

  // Merge userItems and all shopping list items
  useEffect(() => {
    const merged: MergedEditItem[] = [];
    const processedNames = new Set<string>();
    
    // Add all shopping list items (both active and crossed-off)
    allShoppingListItems.forEach(item => {
      processedNames.add(item.name.toLowerCase());
      merged.push({
        id: item.id,
        name: item.name,
        isCrossedOff: item.crossedOff === true,
        type: 'shoppingListItem',
        shoppingListItemId: item.id,
        shoppingListItem: item
      });
    });
    
    // Add userItems that don't have a corresponding shopping list item
    userItems.forEach(item => {
      if (!processedNames.has(item.name.toLowerCase())) {
        merged.push({
          id: item.id,
          name: item.name,
          isCrossedOff: false,
          type: 'userItem',
          expirationLength: item.expirationLength,
          userItem: item
        });
      }
    });
    
    setMergedItems(merged);
    setLoading(false);
  }, [userItems, allShoppingListItems]);

  const handleEdit = (item: MergedEditItem) => {
    setEditingItem(item);
  };

  const handleSave = async (updatedData: UserItemData) => {
    if (!user || !editingItem) return;

    try {
      setError(null);
      
      if (editingItem.type === 'userItem') {
        // Update all userItems with the same name
      await userItemsService.updateAllUserItemsByName(
        user.uid,
        editingItem.name,
        updatedData
      );
      } else if (editingItem.type === 'shoppingListItem' && editingItem.shoppingListItemId) {
        // Update the shopping list item name
        await shoppingListService.updateShoppingListItemName(
          editingItem.shoppingListItemId,
          updatedData.name
        );
        
        // Create or update the corresponding UserItem
        await userItemsService.createOrUpdateUserItem(user.uid, {
          name: updatedData.name,
          expirationLength: updatedData.expirationLength || 7,
          category: updatedData.category
        });
      }
      
      setEditingItem(null);
    } catch (err) {
      console.error('Error updating item:', err);
      setError('Failed to update item. Please try again.');
    }
  };

  const handleDelete = async (item: MergedEditItem) => {
    if (!user) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${item.name}"? This will remove it from your item database.`
    );

    if (!confirmed) return;

    try {
      if (item.type === 'userItem') {
        // Delete all userItems with this name
      const q = query(
        collection(db, 'userItems'),
        where('userId', '==', user.uid),
        where('name', '==', item.name)
      );
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      } else if (item.type === 'shoppingListItem' && item.shoppingListItemId) {
        // Delete the shopping list item
        await shoppingListService.deleteShoppingListItem(item.shoppingListItemId);
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading items...</p>
      </div>
    );
  }

  return (
    <>
      <Banner showHomeIcon={false} onMenuClick={() => setMenuOpen(true)} maxWidth="1400px" />

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

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
          Edit Items
        </h2>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            color: '#991b1b'
          }}>
            {error}
          </div>
        )}

        {mergedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              No items yet.
            </p>
            <p>
              Items will appear here after you add them to your lists.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {mergedItems.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: '600', 
                    color: '#1f2937', 
                    marginBottom: '0.25rem',
                    textDecoration: item.isCrossedOff ? 'line-through' : 'none'
                  }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {item.type === 'userItem' && item.expirationLength !== undefined && (
                      <>
                    Best By Date Length: {item.expirationLength} days
                        {item.userItem?.category && ` • Category: ${item.userItem.category}`}
                      </>
                    )}
                    {item.type === 'shoppingListItem' && (
                      <>
                        {item.isCrossedOff ? 'Crossed off' : 'Active'} shopping list item
                        {(() => {
                          const matchingUserItem = userItems.find(ui => ui.name.toLowerCase() === item.name.toLowerCase());
                          if (matchingUserItem && matchingUserItem.expirationLength) {
                            return ` • Best By Date Length: ${matchingUserItem.expirationLength} days`;
                          }
                          return '';
                        })()}
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleEdit(item)}
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
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleSave}
        />
      )}

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

// Edit Item Modal Component
interface EditItemModalProps {
  item: MergedEditItem;
  onClose: () => void;
  onSave: (data: UserItemData) => void;
}

const EditItemModal: React.FC<EditItemModalProps> = ({ item, onClose, onSave }) => {
  const [user] = useAuthState(auth);
  const [name, setName] = useState(item.name);
  const [expirationLength, setExpirationLength] = useState(item.expirationLength || 0);
  const [category, setCategory] = useState(item.userItem?.category || '');
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [userItems, setUserItems] = useState<UserItem[]>([]);

  useEffect(() => {
    setName(item.name);
    // For shopping list items, try to get expirationLength from matching UserItem
    if (item.type === 'shoppingListItem') {
      const matchingUserItem = userItems.find(ui => ui.name.toLowerCase() === item.name.toLowerCase());
      setExpirationLength(matchingUserItem?.expirationLength || 7);
      setCategory(matchingUserItem?.category || '');
    } else {
      setExpirationLength(item.expirationLength || 0);
      setCategory(item.userItem?.category || '');
    }
  }, [item, userItems]);

  // Load categories
  useEffect(() => {
    if (!user) return;

    const unsubscribe = userCategoriesService.subscribeToUserCategories(
      user.uid,
      (cats) => {
        setCategories(cats);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load userItems to get expirationLength for shopping list items
  useEffect(() => {
    if (!user) return;

    const unsubscribe = userItemsService.subscribeToUserItems(
      user.uid,
      (items) => {
        setUserItems(items);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__add_category__') {
      setShowAddCategoryModal(true);
    } else {
      setCategory(value);
    }
  };

  const handleAddCategory = async (data: UserCategoryData) => {
    if (!user) return;
    try {
      await userCategoriesService.createCategory(user.uid, data);
      setShowAddCategoryModal(false);
      // The category will be automatically selected when the list refreshes
      // We need to wait a moment for the subscription to update
      setTimeout(() => {
        setCategory(data.name);
      }, 100);
    } catch (err: unknown) {
      const errorInfo = getErrorInfo(err);
      alert(errorInfo.message || 'Failed to add category. Please try again.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Item name cannot be empty.');
      return;
    }

    if (expirationLength < 1) {
      setError('Best by date length must be at least 1 day.');
      return;
    }

    // Save with expiration and category for both userItems and shopping list items
    onSave({
      name: name.trim(),
      expirationLength,
      category: category.trim() || undefined
    });
  };

  return (
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
        zIndex: 1000
      }}
      onClick={onClose}
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
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Edit Item
        </h3>

        {error && (
          <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Item Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none'
              }}
              required
            />
          </div>

          {(item.type === 'userItem' || item.type === 'shoppingListItem') && (
            <>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Suggested Best By Date Length (days)
            </label>
            <input
              type="number"
              value={expirationLength}
              onChange={(e) => setExpirationLength(parseInt(e.target.value) || 1)}
              min="1"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Category (optional)
            </label>
            <select
              value={category}
              onChange={handleCategoryChange}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none',
                backgroundColor: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
              <option value="__add_category__">Add Category</option>
            </select>
          </div>
            </>
          )}
          
          {item.type === 'shoppingListItem' && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '0.875rem', color: '#6b7280' }}>
              {item.isCrossedOff 
                ? 'This is a crossed-off shopping list item. Editing will update both the shopping list item and the master list.'
                : 'This is an active shopping list item. Editing will update both the shopping list item and the master list.'}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
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
                cursor: 'pointer'
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <AddCategoryModal
          onSave={handleAddCategory}
          onClose={() => setShowAddCategoryModal(false)}
        />
      )}
    </div>
  );
};

// Add Category Modal Component
interface AddCategoryModalProps {
  onSave: (data: UserCategoryData) => void;
  onClose: () => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Category name cannot be empty.');
      return;
    }

    onSave({
      name: name.trim()
    });
  };

  return (
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
        zIndex: 2000
      }}
      onClick={onClose}
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
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Add Category
        </h3>

        {error && (
          <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Category Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none'
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
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
                cursor: 'pointer'
              }}
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditItems;

