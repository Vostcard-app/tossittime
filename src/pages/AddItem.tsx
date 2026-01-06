import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import type { FoodItemData, FoodItem, AddItemLocationState } from '../types';
import { foodItemService, shoppingListService, userItemsService } from '../services';
import { getFoodItemStatus } from '../utils/statusUtils';
import { useFoodItems } from '../hooks/useFoodItems';
import AddItemForm from '../components/forms/AddItemForm';
import BarcodeScanner from '../components/features/BarcodeScanner';
import type { BarcodeScanResult } from '../services/barcodeService';
import { findFoodItems, getSuggestedExpirationDate } from '../services/foodkeeperService';
import { differenceInDays } from 'date-fns';
import { analyticsService } from '../services/analyticsService';

import { capitalizeItemName } from '../utils/formatting';
import { isDryCannedItem } from '../utils/storageUtils';

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(
    searchParams.get('barcode') || undefined
  );
  const [isFrozen, setIsFrozen] = useState(false);
  
  // Check if coming from shopping list
  const locationState = location.state as AddItemLocationState | null;
  const fromShoppingList = locationState?.fromShoppingList;
  const shoppingListItemId = locationState?.shoppingListItemId;
  const shoppingListItemName = locationState?.itemName;
  
  // Check if coming from Dashboard with item to edit
  const dashboardEditingItem = locationState?.editingItem;
  const forceFreeze = locationState?.forceFreeze;
  const storageType = locationState?.storageType; // 'pantry' | 'refrigerator'

  // Initialize isFrozen from forceFreeze if provided
  React.useEffect(() => {
    if (forceFreeze && !editingItem) {
      setIsFrozen(true);
    }
  }, [forceFreeze, editingItem]);
  
  // If coming from shopping list, show form immediately with pre-filled name
  React.useEffect(() => {
    if (fromShoppingList && shoppingListItemName) {
      setShowForm(true);
      setSearchQuery(shoppingListItemName);
    }
  }, [fromShoppingList, shoppingListItemName]);

  // If coming from Dashboard with item to edit, show form immediately
  React.useEffect(() => {
    if (dashboardEditingItem) {
      setEditingItem(dashboardEditingItem);
      setShowForm(true);
      setSearchQuery('');
      // Initialize freeze state from item
      setIsFrozen(dashboardEditingItem.isFrozen || false);
    }
  }, [dashboardEditingItem]);

  // If coming from Dashboard with storageType (but no editingItem), show form immediately
  React.useEffect(() => {
    if (storageType && !dashboardEditingItem && !fromShoppingList) {
      setShowForm(true);
      setSearchQuery('');
    }
  }, [storageType, dashboardEditingItem, fromShoppingList]);

  // Sync isFrozen state when editingItem changes
  React.useEffect(() => {
    if (editingItem) {
      setIsFrozen(editingItem.isFrozen || false);
    } else if (!editingItem && !forceFreeze) {
      // Reset freeze state when not editing
      setIsFrozen(false);
    }
  }, [editingItem, forceFreeze]);

  // Sort items by most recent first (by addedDate)
  const sortedItems = useMemo(() => {
    return [...foodItems].sort((a, b) => {
      const dateA = a.addedDate ? new Date(a.addedDate).getTime() : 0;
      const dateB = b.addedDate ? new Date(b.addedDate).getTime() : 0;
      return dateB - dateA; // Most recent first
    });
  }, [foodItems]);

  // Filter items based on search query and storage type
  const filteredItems = useMemo(() => {
    let items = sortedItems;
    
    // Filter by storage type if provided
    if (storageType) {
      items = items.filter(item => {
        const isDryCanned = isDryCannedItem(item);
        return storageType === 'pantry' ? isDryCanned : !isDryCanned;
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [sortedItems, searchQuery, storageType]);

  // Get FoodKeeper suggestions based on search query
  const foodKeeperSuggestions = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    return findFoodItems(searchQuery.trim(), 5); // Limit to 5 suggestions
  }, [searchQuery]);

  const handleSubmit = async (data: FoodItemData, photoFile?: File, noExpiration?: boolean) => {
    if (!user) {
      alert('You must be logged in to add items');
      navigate('/login');
      return;
    }

    try {
      // If coming from shopping list and "no expiration" is selected
      if (fromShoppingList && noExpiration) {
        // Mark item as crossed off, don't add to food items
        if (shoppingListItemId) {
          try {
            await shoppingListService.updateShoppingListItemCrossedOff(shoppingListItemId, true);
          } catch (error) {
            console.error('Error marking shopping list item as crossed off:', error);
            alert('Failed to mark item as crossed off. Please try again.');
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

      // Otherwise, proceed with adding/updating food item
      // For frozen items: require thawDate, for non-frozen items: require expirationDate
      if (data.isFrozen) {
        if (!data.thawDate) {
          alert('Thaw date is required for frozen items');
          return;
        }
      } else {
        if (!data.expirationDate) {
          alert('Please select an expiration date or check "No expiration"');
          return;
        }
      }

      // Upload photo if provided
      let photoUrl: string | undefined = undefined;
      if (photoFile) {
        photoUrl = await foodItemService.uploadPhoto(user.uid, photoFile);
      }

      // Build itemData without undefined fields
      // For frozen items: include thawDate, exclude expirationDate
      // For non-frozen items: include expirationDate, exclude thawDate
      const capitalizedName = capitalizeItemName(data.name);
      const itemData: FoodItemData = {
        name: capitalizedName,
        quantity: data.quantity || 1
      };
      
      // Add date field based on whether item is frozen
      if (data.isFrozen) {
        if (data.thawDate) {
          itemData.thawDate = data.thawDate;
        }
        // Explicitly exclude expirationDate for frozen items
        itemData.expirationDate = undefined;
      } else {
        if (data.expirationDate) {
          itemData.expirationDate = data.expirationDate;
        }
        // Explicitly exclude thawDate for non-frozen items
        itemData.thawDate = undefined;
      }
      
      // Only include optional fields if they have values (not undefined)
      if (scannedBarcode || data.barcode) {
        itemData.barcode = scannedBarcode || data.barcode;
      }
      if (data.category) itemData.category = data.category;
      if (data.notes) itemData.notes = data.notes;
      if (photoUrl) itemData.photoUrl = photoUrl;
      if (data.isFrozen !== undefined) itemData.isFrozen = data.isFrozen;
      if (data.freezeCategory) itemData.freezeCategory = data.freezeCategory;
      if (data.isDryCanned !== undefined) itemData.isDryCanned = data.isDryCanned;

      if (editingItem) {
        // Update existing item
        // For frozen items, status might not be relevant, but we'll use 'fresh' as default
        // For non-frozen items, calculate status from expirationDate
        const status = data.isFrozen ? 'fresh' : (data.expirationDate ? getFoodItemStatus(data.expirationDate) : 'fresh');
        await foodItemService.updateFoodItem(editingItem.id, { ...itemData, status });
        
        // Track engagement: item_updated
        await analyticsService.trackEngagement(user.uid, 'item_updated', {
          itemId: editingItem.id,
          itemName: capitalizedName,
          category: data.category,
        });
      } else {
        // Add new item
        // For frozen items, status might not be relevant, but we'll use 'fresh' as default
        // For non-frozen items, calculate status from expirationDate
        const status = data.isFrozen ? 'fresh' : (data.expirationDate ? getFoodItemStatus(data.expirationDate) : 'fresh');
        const itemId = await foodItemService.addFoodItem(user.uid, itemData, status);
        
        // Track engagement: item_added
        await analyticsService.trackEngagement(user.uid, 'item_added', {
          itemId,
          itemName: capitalizedName,
          category: data.category,
        });
        
        // Save to userItems database if item has expiration or thaw date
        const targetDate = data.isFrozen ? data.thawDate : data.expirationDate;
        if (targetDate) {
          try {
            const addedDate = new Date(); // Use current date for new items
            const expirationLength = differenceInDays(targetDate, addedDate);
            
            // Get category from FoodKeeper or use form category
            let category = data.category;
            if (!category) {
              const foodKeeperMatches = findFoodItems(capitalizedName, 1);
              if (foodKeeperMatches.length > 0) {
                category = foodKeeperMatches[0].category;
              }
            }
            
            await userItemsService.createOrUpdateUserItem(user.uid, {
              name: capitalizedName,
              expirationLength: Math.max(1, expirationLength), // Ensure at least 1 day
              category: category,
              isDryCanned: data.isDryCanned
            });
          } catch (error) {
            console.error('Error saving to userItems:', error);
            // Track error
            await analyticsService.trackQuality(user.uid, 'error_occurred', {
              errorType: 'userItems_save_error',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              action: 'save_user_item',
            });
            // Don't block the save if userItems save fails
          }
        }
      }
      
      // NOTE: Do NOT delete shopping list item when adding to dashboard
      // The item should remain in the shopping list so it can be shown as "crossed off"
      // It will only be removed when user explicitly uncrosses it or deletes it
      
      // Mark shopping list item as crossed off when adding to dashboard from shop list
      if (fromShoppingList && shoppingListItemId) {
        try {
          await shoppingListService.updateShoppingListItemCrossedOff(shoppingListItemId, true);
        } catch (error) {
          console.error('Error marking shopping list item as crossed off:', error);
          // Don't block the save if this fails
        }
      }
      
      // Reset and go back to appropriate view
      setShowForm(false);
      setEditingItem(null);
      setSearchQuery('');
      if (fromShoppingList) {
        navigate('/shop');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error saving food item:', error);
      // Track action failure
      if (user) {
        await analyticsService.trackQuality(user.uid, 'action_failed', {
          errorType: 'add_item_error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          action: 'add_food_item',
        });
      }
      throw error;
    }
  };

  const handleItemSelect = async (item: FoodItem) => {
    // Calculate expiration date based on current date and storage type
    let calculatedExpirationDate: Date | undefined = undefined;
    
    if (!item.isFrozen) {
      // Determine storage type for calculation
      const isDryCanned = isDryCannedItem(item);
      const calcStorageType = isDryCanned ? 'pantry' : 'refrigerator';
      
      // Try to get expiration date from FoodKeeper data
      const suggestedDate = getSuggestedExpirationDate(item.name, calcStorageType);
      
      if (suggestedDate) {
        calculatedExpirationDate = suggestedDate;
      } else {
        // Fall back to userItems expirationLength if available
        // Note: We'd need to look up userItems here, but for now use FoodKeeper
        // If no FoodKeeper data, use a default (7 days for perishable, 30 for dry/canned)
        const defaultDays = isDryCanned ? 30 : 7;
        calculatedExpirationDate = new Date();
        calculatedExpirationDate.setDate(calculatedExpirationDate.getDate() + defaultDays);
      }
    }
    
    // Create item with calculated expiration date
    const itemWithDate: FoodItem = {
      ...item,
      expirationDate: calculatedExpirationDate || item.expirationDate
    };
    
    setEditingItem(itemWithDate);
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
    }
    // Navigate back to the previous page
    navigate(-1);
  };

  const handleToss = async () => {
    if (!editingItem) return;
    
    if (!window.confirm('Are you sure you want to remove this item?')) {
      return;
    }

    try {
      await foodItemService.deleteFoodItem(editingItem.id);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
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
          onToss={editingItem ? handleToss : undefined}
          initialName={fromShoppingList && shoppingListItemName ? shoppingListItemName : undefined}
          forceFreeze={forceFreeze}
          externalIsFrozen={isFrozen}
          onIsFrozenChange={setIsFrozen}
          initialIsDryCanned={storageType === 'pantry' ? true : (storageType === 'refrigerator' ? false : editingItem?.isDryCanned)}
          foodItems={foodItems}
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
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim() && filteredItems.length === 0) {
                handleNewItem();
              }
            }}
            placeholder="Find or add item"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            name="item-search"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
          {/* Dropdown List */}
          {showDropdown && (inputFocused || searchQuery.trim()) && (filteredItems.length > 0 || foodKeeperSuggestions.length > 0) && (
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
                // Prevent blur when clicking inside dropdown
                e.preventDefault();
              }}
            >
              {/* Previously added items */}
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    handleItemSelect(item);
                    setShowDropdown(false);
                    setSearchQuery('');
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
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
                </div>
              ))}
              
              {/* FoodKeeper suggestions */}
              {foodKeeperSuggestions.length > 0 && (
                <>
                  {filteredItems.length > 0 && (
                    <div style={{ 
                      padding: '0.5rem 1rem', 
                      backgroundColor: '#f9fafb', 
                      borderTop: '1px solid #e5e7eb',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Suggested Items
                    </div>
                  )}
                  {foodKeeperSuggestions.map((suggestion, index) => (
                    <div
                      key={`foodkeeper-${suggestion.name}-${index}`}
                      onClick={() => {
                        setSearchQuery(suggestion.name);
                        setShowForm(true);
                        setShowDropdown(false);
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        backgroundColor: '#fef3c7' // Light yellow to distinguish from previous items
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
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item List */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#ffffff' }}>
        {filteredItems.length === 0 && foodKeeperSuggestions.length === 0 && searchQuery.trim() ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No items found. Press Enter to add "{searchQuery}"</p>
          </div>
        ) : filteredItems.length === 0 && foodKeeperSuggestions.length === 0 ? (
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
                  <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                    {item.name}
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

