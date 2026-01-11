/**
 * Add Meal from Recipe Modal
 * Allows users to import recipes from URLs or search recipe sites
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { recipeImportService, shoppingListsService, shoppingListService } from '../../services';
import type { RecipeSite, RecipeImportResult } from '../../types/recipeImport';
import type { FoodItem, MealType, ShoppingListItem } from '../../types';
import { showToast } from '../Toast';

interface AddMealFromRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (recipe: RecipeImportResult, date: Date, mealType: MealType, finishBy: string) => void;
  bestBySoonItems?: FoodItem[];
}

export const AddMealFromRecipeModal: React.FC<AddMealFromRecipeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  bestBySoonItems = []
}) => {
  const [user] = useAuthState(auth);
  const [recipeSites, setRecipeSites] = useState<RecipeSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [shoppingListItems, setShoppingListItems] = useState<ShoppingListItem[]>([]);
  const [loadingShoppingList, setLoadingShoppingList] = useState(true);
  const [selectedExpiringItems, setSelectedExpiringItems] = useState<Set<string>>(new Set());
  const [selectedShoppingListItems, setSelectedShoppingListItems] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState<RecipeImportResult | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner');
  const [selectedFinishBy, setSelectedFinishBy] = useState<string>('18:00');

  // Load recipe sites
  useEffect(() => {
    if (!isOpen) return;

    const loadSites = async () => {
      try {
        const sites = await recipeImportService.getEnabledRecipeSites();
        setRecipeSites(sites);
      } catch (error) {
        console.error('Error loading recipe sites:', error);
        showToast('Failed to load recipe sites', 'error');
      } finally {
        setLoadingSites(false);
      }
    };

    loadSites();
  }, [isOpen]);

  // Load default shopping list items
  useEffect(() => {
    if (!isOpen || !user) return;

    const loadShoppingList = async () => {
      setLoadingShoppingList(true);
      try {
        const lists = await shoppingListsService.getShoppingLists(user.uid);
        const defaultList = lists.find(list => list.isDefault) || lists[0];
        
        if (defaultList) {
          const items = await shoppingListService.getShoppingListItems(user.uid, defaultList.id);
          // Only show items that are not crossed off
          setShoppingListItems(items.filter(item => !item.crossedOff));
        } else {
          setShoppingListItems([]);
        }
      } catch (error) {
        console.error('Error loading shopping list:', error);
        showToast('Failed to load shopping list', 'error');
      } finally {
        setLoadingShoppingList(false);
      }
    };

    loadShoppingList();
  }, [isOpen, user]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUrlInput('');
      setImportedRecipe(null);
      setSelectedIngredients(new Set());
      setSelectedExpiringItems(new Set());
      setSelectedShoppingListItems(new Set());
      setSelectedDate(new Date());
      setSelectedMealType('dinner');
      setSelectedFinishBy('18:00');
    }
  }, [isOpen]);

  // Set default selected ingredients when recipe is imported
  useEffect(() => {
    if (importedRecipe) {
      setSelectedIngredients(new Set(importedRecipe.ingredients.map((_, index) => index)));
    }
  }, [importedRecipe]);

  // Toggle best by soon item selection
  const toggleExpiringItem = (itemId: string) => {
    const newSelected = new Set(selectedExpiringItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedExpiringItems(newSelected);
  };

  // Toggle shopping list item selection
  const toggleShoppingListItem = (itemId: string) => {
    const newSelected = new Set(selectedShoppingListItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedShoppingListItems(newSelected);
  };

  // Combine selected items into search query
  const buildSearchQuery = (): string => {
    const selectedItems: string[] = [];
    
    // Add selected best by soon items
    bestBySoonItems.forEach(item => {
      if (selectedExpiringItems.has(item.id)) {
        selectedItems.push(item.name);
      }
    });
    
    // Add selected shopping list items
    shoppingListItems.forEach(item => {
      if (selectedShoppingListItems.has(item.id)) {
        selectedItems.push(item.name);
      }
    });
    
    return selectedItems.join(' ');
  };

  const handleSearchSite = (site: RecipeSite) => {
    const query = buildSearchQuery();
    
    if (!query.trim()) {
      showToast('Please select at least one item to search', 'error');
      return;
    }
    
    const searchUrl = recipeImportService.buildSearchUrl(site, query);
    window.open(searchUrl, '_blank');
  };

  const handleImportFromUrl = async () => {
    if (!urlInput.trim()) {
      showToast('Please enter a recipe URL', 'error');
      return;
    }

    setImporting(true);
    try {
      const recipe = await recipeImportService.importRecipe(urlInput.trim());
      setImportedRecipe(recipe);
      showToast('Recipe imported successfully', 'success');
    } catch (error: any) {
      console.error('Error importing recipe:', error);
      showToast(error.message || 'Failed to import recipe', 'error');
    } finally {
      setImporting(false);
    }
  };

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredients);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredients(newSelected);
  };

  const handleSave = async () => {
    if (!importedRecipe || selectedIngredients.size === 0) {
      showToast('Please select at least one ingredient', 'error');
      return;
    }

    setSaving(true);
    try {
      // Filter recipe to only include selected ingredients
      const filteredRecipe: RecipeImportResult = {
        ...importedRecipe,
        ingredients: importedRecipe.ingredients.filter((_, index) => selectedIngredients.has(index))
      };

      onSave(filteredRecipe, selectedDate, selectedMealType, selectedFinishBy);
      showToast('Recipe saved to meal planner', 'success');
      onClose();
    } catch (error) {
      console.error('Error saving recipe:', error);
      showToast('Failed to save recipe', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Add Meal from Recipe</h2>
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
          {!importedRecipe ? (
            <>
              {/* Expiring Soon Items Section */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                  Expiring Soon Items
                </h3>
                {expiringItems.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', fontStyle: 'italic' }}>
                    No items expiring soon
                  </p>
                ) : (
                  <div style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '6px', 
                    padding: '0.5rem' 
                  }}>
                    {expiringItems.map(item => {
                      const expDate = item.expirationDate || item.thawDate;
                      const daysUntil = expDate ? Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
                      return (
                        <label
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            marginBottom: '0.25rem',
                            backgroundColor: selectedExpiringItems.has(item.id) ? '#f3f4f6' : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedExpiringItems.has(item.id)}
                            onChange={() => toggleExpiringItem(item.id)}
                            style={{
                              marginRight: '0.75rem',
                              width: '1.25rem',
                              height: '1.25rem',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ flex: 1, fontSize: '1rem' }}>
                            {item.name} {expDate && `(expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''})`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Shopping List Items Section */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                  Shopping List Items
                </h3>
                {loadingShoppingList ? (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading shopping list...</p>
                ) : shoppingListItems.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', fontStyle: 'italic' }}>
                    No items in your shopping list
                  </p>
                ) : (
                  <div style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '6px', 
                    padding: '0.5rem' 
                  }}>
                    {shoppingListItems.map(item => (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          marginBottom: '0.25rem',
                          backgroundColor: selectedShoppingListItems.has(item.id) ? '#f3f4f6' : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedShoppingListItems.has(item.id)}
                          onChange={() => toggleShoppingListItem(item.id)}
                          style={{
                            marginRight: '0.75rem',
                            width: '1.25rem',
                            height: '1.25rem',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ flex: 1, fontSize: '1rem' }}>{item.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipe Sites Section */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                  Recipe Sites
                </h3>
                {loadingSites ? (
                  <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading recipe sites...</p>
                ) : recipeSites.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6b7280' }}>
                    No recipe sites available. Please contact an administrator.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {recipeSites.map(site => (
                      <button
                        key={site.id}
                        onClick={() => handleSearchSite(site)}
                        style={{
                          padding: '1rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }}
                      >
                        <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{site.label}</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{site.baseUrl}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Paste URL Section */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.125rem', fontWeight: '600' }}>
                  Or paste a recipe URL
                </h3>
                <p style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  Paste a recipe URL to import its ingredients directly.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/recipe"
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleImportFromUrl();
                      }
                    }}
                  />
                  <button
                    onClick={handleImportFromUrl}
                    disabled={importing || !urlInput.trim()}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: importing || !urlInput.trim() ? '#9ca3af' : '#002B4D',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: importing || !urlInput.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Recipe Preview */
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>
                {importedRecipe.title}
              </h3>

              {importedRecipe.imageUrl && (
                <img
                  src={importedRecipe.imageUrl}
                  alt={importedRecipe.title}
                  style={{
                    width: '100%',
                    maxHeight: '200px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    marginBottom: '1rem'
                  }}
                />
              )}

              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.875rem', color: '#6b7280' }}>
                Recipe from{' '}
                <a
                  href={importedRecipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#002B4D', textDecoration: 'underline' }}
                >
                  {importedRecipe.sourceDomain}
                </a>
                {' '}•{' '}
                <a
                  href={importedRecipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#002B4D', textDecoration: 'underline' }}
                >
                  View full recipe
                </a>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>
                  Ingredients ({importedRecipe.ingredients.length})
                </h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                  {importedRecipe.ingredients.map((ingredient, index) => (
                    <label
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        marginBottom: '0.25rem',
                        backgroundColor: selectedIngredients.has(index) ? '#f3f4f6' : 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIngredients.has(index)}
                        onChange={() => toggleIngredient(index)}
                        style={{
                          marginRight: '0.75rem',
                          width: '1.25rem',
                          height: '1.25rem',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, fontSize: '1rem' }}>{ingredient}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date/Time/Meal Type Selection */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                  Schedule This Meal
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Date:
                    </label>
                    <input
                      type="date"
                      value={selectedDate.toISOString().split('T')[0]}
                      onChange={(e) => setSelectedDate(new Date(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Meal Type:
                    </label>
                    <select
                      value={selectedMealType}
                      onChange={(e) => setSelectedMealType(e.target.value as MealType)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Finish By (HH:mm):
                    </label>
                    <input
                      type="time"
                      value={selectedFinishBy}
                      onChange={(e) => setSelectedFinishBy(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setImportedRecipe(null)}
                  disabled={saving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || selectedIngredients.size === 0}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: saving || selectedIngredients.size === 0 ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving || selectedIngredients.size === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : `Save to Meal Planner (${selectedIngredients.size} ingredients)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

