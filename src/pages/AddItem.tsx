import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import type { FoodItemData, FoodItem } from '../types';
import { foodItemService, shoppingListService } from '../services/firebaseService';
import { getFoodItemStatus } from '../utils/statusUtils';
import { useFoodItems } from '../hooks/useFoodItems';
import { formatDate } from '../utils/dateUtils';
import AddItemForm from '../components/AddItemForm';
import BarcodeScanner from '../components/BarcodeScanner';
import type { BarcodeScanResult } from '../services/barcodeService';

const AddItem: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { foodItems } = useFoodItems(user || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(
    searchParams.get('barcode') || undefined
  );
  
  // Check if coming from shopping list
  const fromShoppingList = (location.state as any)?.fromShoppingList;
  const shoppingListItemId = (location.state as any)?.shoppingListItemId;
  const shoppingListItemName = (location.state as any)?.itemName;
  
  // If coming from shopping list, show form immediately with pre-filled name
  React.useEffect(() => {
    if (fromShoppingList && shoppingListItemName) {
      setShowForm(true);
      setSearchQuery(shoppingListItemName);
    }
  }, [fromShoppingList, shoppingListItemName]);

  // Sort items by most recent first (by addedDate)
  const sortedItems = useMemo(() => {
    return [...foodItems].sort((a, b) => {
      const dateA = a.addedDate ? new Date(a.addedDate).getTime() : 0;
      const dateB = b.addedDate ? new Date(b.addedDate).getTime() : 0;
      return dateB - dateA; // Most recent first
    });
  }, [foodItems]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedItems;
    }
    const query = searchQuery.toLowerCase();
    return sortedItems.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  }, [sortedItems, searchQuery]);

  const handleSubmit = async (data: FoodItemData, photoFile?: File, noExpiration?: boolean) => {
    if (!user) {
      alert('You must be logged in to add items');
      navigate('/login');
      return;
    }

    try {
      // If coming from shopping list and "no expiration" is selected
      if (fromShoppingList && noExpiration) {
        // Just delete from shopping list, don't add to food items
        if (shoppingListItemId) {
          try {
            await shoppingListService.deleteShoppingListItem(shoppingListItemId);
          } catch (error) {
            console.error('Error deleting shopping list item:', error);
            alert('Failed to remove item from shopping list. Please try again.');
            throw error;
          }
        }
        
        // Reset and go back to shop page
        setShowForm(false);
        setEditingItem(null);
        setSearchQuery('');
        navigate('/shop');
        return;
      }

      // Otherwise, proceed with adding/updating food item (requires expiration date)
      if (!data.expirationDate) {
        alert('Please select an expiration date or check "No expiration"');
        return;
      }

      // Upload photo if provided
      let photoUrl: string | undefined = undefined;
      if (photoFile) {
        photoUrl = await foodItemService.uploadPhoto(user.uid, photoFile);
      }

      // Build itemData without undefined fields
      const itemData: FoodItemData = {
        name: data.name,
        expirationDate: data.expirationDate,
        quantity: data.quantity || 1,
        barcode: scannedBarcode || data.barcode || undefined
      };
      
      // Only include optional fields if they have values
      if (data.category) itemData.category = data.category;
      if (data.notes) itemData.notes = data.notes;
      if (photoUrl) itemData.photoUrl = photoUrl;

      if (editingItem) {
        // Update existing item
        const status = getFoodItemStatus(data.expirationDate);
        await foodItemService.updateFoodItem(editingItem.id, { ...itemData, status });
      } else {
        // Add new item
        const status = getFoodItemStatus(data.expirationDate);
        await foodItemService.addFoodItem(user.uid, itemData, status);
      }
      
      // If coming from shopping list, delete the shopping list item
      if (fromShoppingList && shoppingListItemId) {
        try {
          await shoppingListService.deleteShoppingListItem(shoppingListItemId);
        } catch (error) {
          console.error('Error deleting shopping list item:', error);
          // Don't block the save if shopping list deletion fails
        }
      }
      
      // Reset and go back to appropriate view
      setShowForm(false);
      setEditingItem(null);
      setSearchQuery('');
      if (fromShoppingList) {
        navigate('/shop');
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Error saving food item:', error);
      throw error;
    }
  };

  const handleItemSelect = (item: FoodItem) => {
    setEditingItem(item);
    setShowForm(true);
    setSearchQuery('');
  };

  const handleNewItem = () => {
    if (searchQuery.trim()) {
      setEditingItem(null);
      setShowForm(true);
    }
  };

  const handleDelete = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await foodItemService.deleteFoodItem(itemId);
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item. Please try again.');
      }
    }
  };

  const handleCancel = () => {
    if (showForm) {
      setShowForm(false);
      setEditingItem(null);
      setSearchQuery('');
    } else {
      navigate('/');
    }
  };

  const handleScan = (result: BarcodeScanResult) => {
    setScannedBarcode(result.data);
    setShowScanner(false);
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to add food items.</p>
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

  if (showScanner) {
    return (
      <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      </div>
    );
  }

  if (showForm) {
    return (
      <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
        <AddItemForm
          onSubmit={handleSubmit}
          initialBarcode={scannedBarcode}
          onScanBarcode={() => setShowScanner(true)}
          initialItem={editingItem}
          onCancel={handleCancel}
          initialName={fromShoppingList && shoppingListItemName ? shoppingListItemName : undefined}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Search Header */}
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <button
          onClick={handleCancel}
          style={{
            background: 'none',
            border: 'none',
            color: '#002B4D',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            padding: '0.5rem',
            minWidth: '60px'
          }}
        >
          Cancel
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.trim() && filteredItems.length === 0) {
              handleNewItem();
            }
          }}
          placeholder="Find or add item"
          autoFocus
          style={{
            flex: 1,
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Item List */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#ffffff' }}>
        {filteredItems.length === 0 && searchQuery.trim() ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No items found. Press Enter to add "{searchQuery}"</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No items yet. Start typing to add a new item.</p>
          </div>
        ) : (
          <div>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemSelect(item)}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937', marginBottom: '0.25rem' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Expiration: {formatDate(item.expirationDate)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '44px',
                    minHeight: '44px'
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
  );
};

export default AddItem;

