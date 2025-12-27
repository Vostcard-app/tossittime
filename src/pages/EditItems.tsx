import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../firebase/firebaseConfig';
import { userItemsService, userCategoriesService, shoppingListService, shoppingListsService } from '../services/firebaseService';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import type { UserItem, UserItemData, UserCategory, UserCategoryData, ShoppingListItem, ShoppingList } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';

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
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [crossedOffItems, setCrossedOffItems] = useState<ShoppingListItem[]>([]);
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

  // Load crossed-off items from all shopping lists
  useEffect(() => {
    if (!user || shoppingLists.length === 0) {
      setCrossedOffItems([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const itemsByList: Map<string, ShoppingListItem[]> = new Map();

    shoppingLists.forEach(list => {
      const unsubscribe = shoppingListService.subscribeToShoppingList(
        user.uid,
        list.id,
        (items) => {
          // Filter for crossed-off items
          const crossedOff = items.filter(item => item.crossedOff === true);
          itemsByList.set(list.id, crossedOff);
          
          // Combine all crossed-off items from all lists
          const allCrossedOff: ShoppingListItem[] = [];
          itemsByList.forEach(listItems => {
            listItems.forEach(item => {
              if (!allCrossedOff.find(existing => existing.id === item.id)) {
                allCrossedOff.push(item);
              }
            });
          });
          
          setCrossedOffItems(allCrossedOff);
        }
      );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, shoppingLists]);

  // Merge userItems and crossed-off items
  useEffect(() => {
    const merged: MergedEditItem[] = [];
    
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
    
    // Add userItems (previously used items)
    userItems.forEach(item => {
      merged.push({
        id: item.id,
        name: item.name,
        isCrossedOff: false,
        type: 'userItem',
        expirationLength: item.expirationLength,
        userItem: item
      });
    });
    
    setMergedItems(merged);
    setLoading(false);
  }, [userItems, crossedOffItems]);

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
        // For shopping list items, we can update the name
        // Note: Shopping list items don't have expirationLength, so we'll need to handle this differently
        // For now, we'll just update the name in the shopping list item
        await shoppingListService.updateShoppingListItemName(
          editingItem.shoppingListItemId,
          updatedData.name
        );
        
        // If there's a corresponding userItem, update it too
        const matchingUserItem = userItems.find(ui => ui.name.toLowerCase() === editingItem.name.toLowerCase());
        if (matchingUserItem) {
          await userItemsService.updateAllUserItemsByName(
            user.uid,
            editingItem.name,
            updatedData
          );
        }
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
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link 
              to="/shop" 
              style={{ 
                color: '#ffffff', 
                textDecoration: 'none', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#002B4D',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 43, 77, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#002B4D';
              }}
              aria-label="Go to shop"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* House base */}
                <rect x="6" y="12" width="12" height="8" fill="white" />
                {/* House roof */}
                <path d="M12 4L4 10H20L12 4Z" fill="white" />
                {/* Door */}
                <rect x="10" y="16" width="4" height="4" fill="#002B4D" />
              </svg>
            </Link>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
              TossItTime
            </h1>
          </div>
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
              width: '44px',
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
                        Expiration: {item.expirationLength} days
                        {item.userItem?.category && ` • Category: ${item.userItem.category}`}
                      </>
                    )}
                    {item.type === 'shoppingListItem' && (
                      <>Crossed off item</>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {item.type === 'userItem' && (
                    <>
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
                    </>
                  )}
                  {item.type === 'shoppingListItem' && (
                    <>
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
                    </>
                  )}
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

  useEffect(() => {
    setName(item.name);
    setExpirationLength(item.expirationLength || 0);
    setCategory(item.userItem?.category || '');
  }, [item]);

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
    } catch (err: any) {
      alert(err.message || 'Failed to add category. Please try again.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Item name cannot be empty.');
      return;
    }

    if (item.type === 'userItem' && expirationLength < 1) {
      setError('Expiration length must be at least 1 day.');
      return;
    }

    if (item.type === 'userItem') {
      onSave({
        name: name.trim(),
        expirationLength,
        category: category.trim() || undefined
      });
    } else {
      // For shopping list items, only save the name
      onSave({
        name: name.trim(),
        expirationLength: 0,
        category: undefined
      });
    }
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

          {item.type === 'userItem' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                  Suggested Expiration (days)
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
              This is a crossed-off shopping list item. Only the name can be edited.
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

