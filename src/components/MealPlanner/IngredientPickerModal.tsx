/**
 * Ingredient Picker Modal
 * Popup modal for selecting ingredients for meal planning
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { foodItemService, shoppingListService, shoppingListsService } from '../../services';
import type { MealType } from '../../types';
import { isDryCannedItem } from '../../utils/storageUtils';
import { addDays } from 'date-fns';
import { WebsiteSelectionModal } from './WebsiteSelectionModal';

interface IngredientPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
}

interface IngredientItem {
  id: string;
  name: string;
  source: 'bestBySoon' | 'shopList' | 'perishable' | 'dryCanned';
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' }
];

export const IngredientPickerModal: React.FC<IngredientPickerModalProps> = ({
  isOpen,
  onClose,
  selectedDate
}) => {
  const [user] = useAuthState(auth);
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWebsiteSelection, setShowWebsiteSelection] = useState(false);

  // Load ingredients from all sources
  useEffect(() => {
    if (!isOpen || !user) {
      setLoading(false);
      return;
    }

    const loadIngredients = async () => {
      try {
        setLoading(true);
        const allIngredients: IngredientItem[] = [];

        // 1. Load best by soon items (next 14 days)
        const allFoodItems = await foodItemService.getFoodItems(user.uid);
        const now = new Date();
        const twoWeeksFromNow = addDays(now, 14);
        
        const bestBySoonItems = allFoodItems.filter(item => {
          const expDate = item.bestByDate || item.thawDate;
          if (!expDate) return false;
          return expDate >= now && expDate <= twoWeeksFromNow;
        });

        expiringItems.forEach(item => {
          allIngredients.push({
            id: `expiring-${item.id}`,
            name: item.name,
            source: 'expiring'
          });
        });

        // 2. Load default shop list
        const shoppingLists = await shoppingListsService.getShoppingLists(user.uid);
        const defaultList = shoppingLists.find(list => list.isDefault) || shoppingLists[0];
        
        if (defaultList) {
          const shopListItems = await shoppingListService.getShoppingListItems(user.uid, defaultList.id);
          // Only include non-crossed-off items
          shopListItems
            .filter(item => !item.crossedOff)
            .forEach(item => {
              allIngredients.push({
                id: `shopList-${item.id}`,
                name: item.name,
                source: 'shopList'
              });
            });
        }

        // 3. Load perishable items (not dry/canned)
        const perishableItems = allFoodItems.filter(item => !isDryCannedItem(item));
        perishableItems.forEach(item => {
          allIngredients.push({
            id: `perishable-${item.id}`,
            name: item.name,
            source: 'perishable'
          });
        });

        // 4. Load dry/canned items
        const dryCannedItems = allFoodItems.filter(item => isDryCannedItem(item));
        dryCannedItems.forEach(item => {
          allIngredients.push({
            id: `dryCanned-${item.id}`,
            name: item.name,
            source: 'dryCanned'
          });
        });

        // Remove duplicates (same name)
        const uniqueIngredients: IngredientItem[] = [];
        const seenNames = new Set<string>();
        
        allIngredients.forEach(ingredient => {
          const normalizedName = ingredient.name.toLowerCase().trim();
          if (!seenNames.has(normalizedName)) {
            seenNames.add(normalizedName);
            uniqueIngredients.push(ingredient);
          }
        });

        setIngredients(uniqueIngredients);
      } catch (error) {
        console.error('Error loading ingredients:', error);
      } finally {
        setLoading(false);
      }
    };

    loadIngredients();
  }, [isOpen, user]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMealType(null);
      setSelectedIngredients(new Set());
      setShowWebsiteSelection(false);
    }
  }, [isOpen]);

  // Group ingredients by source
  const groupedIngredients = useMemo(() => {
    const groups = {
      bestBySoon: [] as IngredientItem[],
      shopList: [] as IngredientItem[],
      perishable: [] as IngredientItem[],
      dryCanned: [] as IngredientItem[]
    };

    ingredients.forEach(ingredient => {
      groups[ingredient.source].push(ingredient);
    });

    return groups;
  }, [ingredients]);

  const toggleIngredient = (ingredientId: string) => {
    const newSelected = new Set(selectedIngredients);
    
    if (newSelected.has(ingredientId)) {
      newSelected.delete(ingredientId);
    } else {
      // Limit to 3 selections
      if (newSelected.size >= 3) {
        return;
      }
      newSelected.add(ingredientId);
    }
    
    setSelectedIngredients(newSelected);
  };

  const handleCreate = () => {
    if (selectedIngredients.size > 3) {
      alert('Please select no more than 3 ingredients');
      return;
    }

    // Copy selected ingredients to clipboard (if any)
    const selectedNames = Array.from(selectedIngredients)
      .map(id => {
        const ingredient = ingredients.find(ing => ing.id === id);
        return ingredient?.name || '';
      })
      .filter(Boolean)
      .join(', ');

    // Copy to clipboard if there are ingredients
    if (selectedNames) {
      navigator.clipboard.writeText(selectedNames).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }

    // Show website selection modal
    setShowWebsiteSelection(true);
  };

  const getSourceLabel = (source: IngredientItem['source']): string => {
    switch (source) {
      case 'bestBySoon':
        return 'Expiring Soon';
      case 'shopList':
        return 'Shop List';
      case 'perishable':
        return 'Perishable Items';
      case 'dryCanned':
        return 'Dry/Canned Items';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <>
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
          zIndex: 1000,
          padding: '1rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Select Ingredients</h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0.25rem 0.5rem'
              }}
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '1.5rem' }}>
            {!selectedMealType ? (
              /* Meal Type Selection */
              <div>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                  Select Meal Type
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {MEAL_TYPES.map(mealType => (
                    <button
                      key={mealType.value}
                      onClick={() => setSelectedMealType(mealType.value)}
                      style={{
                        padding: '1.5rem',
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1.125rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#002B4D';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      {mealType.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Ingredient Selection */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
                    Select up to 3 ingredients for {MEAL_TYPES.find(m => m.value === selectedMealType)?.label}
                  </h3>
                  <button
                    onClick={() => setSelectedMealType(null)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f3f4f6',
                      color: '#1f2937',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    Back
                  </button>
                </div>

                {loading ? (
                  <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading ingredients...</p>
                ) : (
                  <>
                    <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {selectedIngredients.size} of 3 selected
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                      {/* Expiring Soon */}
                      {groupedIngredients.expiring.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            {getSourceLabel('expiring')}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {groupedIngredients.expiring.map(ingredient => (
                              <label
                                key={ingredient.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.75rem',
                                  cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer',
                                  borderRadius: '4px',
                                  backgroundColor: selectedIngredients.has(ingredient.id) ? '#f0f8ff' : 'transparent',
                                  opacity: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 0.5 : 1
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIngredients.has(ingredient.id)}
                                  onChange={() => toggleIngredient(ingredient.id)}
                                  disabled={selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id)}
                                  style={{
                                    marginRight: '0.75rem',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <span style={{ flex: 1, fontSize: '1rem' }}>{ingredient.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Shop List */}
                      {groupedIngredients.shopList.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            {getSourceLabel('shopList')}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {groupedIngredients.shopList.map(ingredient => (
                              <label
                                key={ingredient.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.75rem',
                                  cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer',
                                  borderRadius: '4px',
                                  backgroundColor: selectedIngredients.has(ingredient.id) ? '#f0f8ff' : 'transparent',
                                  opacity: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 0.5 : 1
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIngredients.has(ingredient.id)}
                                  onChange={() => toggleIngredient(ingredient.id)}
                                  disabled={selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id)}
                                  style={{
                                    marginRight: '0.75rem',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <span style={{ flex: 1, fontSize: '1rem' }}>{ingredient.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Perishable Items */}
                      {groupedIngredients.perishable.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            {getSourceLabel('perishable')}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {groupedIngredients.perishable.map(ingredient => (
                              <label
                                key={ingredient.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.75rem',
                                  cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer',
                                  borderRadius: '4px',
                                  backgroundColor: selectedIngredients.has(ingredient.id) ? '#f0f8ff' : 'transparent',
                                  opacity: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 0.5 : 1
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIngredients.has(ingredient.id)}
                                  onChange={() => toggleIngredient(ingredient.id)}
                                  disabled={selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id)}
                                  style={{
                                    marginRight: '0.75rem',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <span style={{ flex: 1, fontSize: '1rem' }}>{ingredient.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dry/Canned Items */}
                      {groupedIngredients.dryCanned.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            {getSourceLabel('dryCanned')}
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {groupedIngredients.dryCanned.map(ingredient => (
                              <label
                                key={ingredient.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.75rem',
                                  cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer',
                                  borderRadius: '4px',
                                  backgroundColor: selectedIngredients.has(ingredient.id) ? '#f0f8ff' : 'transparent',
                                  opacity: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 0.5 : 1
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIngredients.has(ingredient.id)}
                                  onChange={() => toggleIngredient(ingredient.id)}
                                  disabled={selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id)}
                                  style={{
                                    marginRight: '0.75rem',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    cursor: selectedIngredients.size >= 3 && !selectedIngredients.has(ingredient.id) ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <span style={{ flex: 1, fontSize: '1rem' }}>{ingredient.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Create Button */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={onClose}
                        style={{
                          padding: '0.75rem 1.5rem',
                          backgroundColor: '#f3f4f6',
                          color: '#1f2937',
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
                        onClick={handleCreate}
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
                        Create ({selectedIngredients.size})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Website Selection Modal */}
      {showWebsiteSelection && selectedMealType && (
        <WebsiteSelectionModal
          isOpen={showWebsiteSelection}
          onClose={() => {
            setShowWebsiteSelection(false);
            onClose();
          }}
          selectedIngredients={Array.from(selectedIngredients).map(id => {
            const ingredient = ingredients.find(ing => ing.id === id);
            return ingredient?.name || '';
          }).filter(Boolean)}
          selectedDate={selectedDate}
          selectedMealType={selectedMealType}
        />
      )}
    </>
  );
};
