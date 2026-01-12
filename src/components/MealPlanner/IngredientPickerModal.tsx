/**
 * Ingredient Picker Modal
 * Popup modal for selecting ingredients for meal planning with tabs
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { foodItemService, shoppingListService, shoppingListsService, mealPlanningService, recipeImportService, recipeSiteService } from '../../services';
import type { MealType, Dish } from '../../types';
import type { RecipeImportResult } from '../../types/recipeImport';
import type { RecipeSite } from '../../types/recipeImport';
import { isDryCannedItem } from '../../utils/storageUtils';
import { addDays, startOfWeek, isSameDay } from 'date-fns';
import { useIngredientAvailability } from '../../hooks/useIngredientAvailability';
import { IngredientChecklist } from './IngredientChecklist';
import { GoogleSearchModal } from './GoogleSearchModal';
import { GoogleSearchRecipeModal } from './GoogleSearchRecipeModal';
import { showToast } from '../Toast';

interface IngredientPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  initialMealType?: MealType;
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
  selectedDate,
  initialMealType
}) => {
  const [user] = useAuthState(auth);
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(null);
  const [activeTab, setActiveTab] = useState<'myIngredients' | 'recipeUrl' | 'pasteIngredients'>('myIngredients');
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [pastedIngredients, setPastedIngredients] = useState('');
  const [parsedIngredients, setParsedIngredients] = useState<string[]>([]);
  const [selectedPastedIngredientIndices, setSelectedPastedIngredientIndices] = useState<Set<number>>(new Set());
  const [dishName, setDishName] = useState('');
  const [saving, setSaving] = useState(false);
  const [importingRecipe, setImportingRecipe] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState<RecipeImportResult | null>(null);
  const [favoriteWebsites, setFavoriteWebsites] = useState<RecipeSite[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [selectedFavoriteSite, setSelectedFavoriteSite] = useState<RecipeSite | null>(null);
  const [selectedSearchIngredients, setSelectedSearchIngredients] = useState<Set<string>>(new Set());
  const [showGoogleSearchModal, setShowGoogleSearchModal] = useState(false);
  const [showGoogleSearchRecipeModal, setShowGoogleSearchRecipeModal] = useState(false);

  // Parse pasted ingredients when text changes
  useEffect(() => {
    if (!pastedIngredients.trim()) {
      setParsedIngredients([]);
      setSelectedPastedIngredientIndices(new Set());
      return;
    }

    // Split by newlines, commas, or semicolons, then clean up each ingredient
    const lines = pastedIngredients
      .split(/[\n,;]/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    setParsedIngredients(lines);
    // Select all by default
    setSelectedPastedIngredientIndices(new Set(lines.map((_, index) => index)));
  }, [pastedIngredients]);

  // Use ingredient availability hook for pasted ingredients
  const {
    ingredientStatuses: pastedIngredientStatuses,
    loading: loadingPastedIngredients
  } = useIngredientAvailability(
    parsedIngredients,
    { isOpen: isOpen && parsedIngredients.length > 0 }
  );

  // Set default selections for pasted ingredients (unavailable items selected by default)
  useEffect(() => {
    if (parsedIngredients.length === 0 || pastedIngredientStatuses.length === 0) return;
    
    // Only set default selections on initial parse (when all are selected)
    const allSelected = selectedPastedIngredientIndices.size === parsedIngredients.length;
    if (!allSelected) return; // Respect user's manual selections
    
    const unavailableIndices = pastedIngredientStatuses
      .filter(item => item.status === 'missing' || item.status === 'partial')
      .map(item => item.index);
    
    if (unavailableIndices.length > 0) {
      setSelectedPastedIngredientIndices(new Set(unavailableIndices));
    }
  }, [pastedIngredientStatuses.length, parsedIngredients.length]); // Only depend on lengths to avoid infinite loops

  const togglePastedIngredient = (index: number) => {
    const newSelected = new Set(selectedPastedIngredientIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedPastedIngredientIndices(newSelected);
  };

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

        // Helper function to check if item is not claimed by any meal
        const isNotClaimed = (item: { usedByMeals?: string[] }) => {
          return !item.usedByMeals || item.usedByMeals.length === 0;
        };

        // 1. Load best by soon items (next 14 days)
        const allFoodItems = await foodItemService.getFoodItems(user.uid);
        const now = new Date();
        const twoWeeksFromNow = addDays(now, 14);
        
        const bestBySoonItems = allFoodItems.filter(item => {
          const expDate = item.bestByDate || item.thawDate;
          if (!expDate) return false;
          if (!isNotClaimed(item)) return false; // Exclude claimed items
          return expDate >= now && expDate <= twoWeeksFromNow;
        });

        bestBySoonItems.forEach(item => {
          allIngredients.push({
            id: `bestBySoon-${item.id}`,
            name: item.name,
            source: 'bestBySoon'
          });
        });

        // 2. Load default shop list
        const shoppingLists = await shoppingListsService.getShoppingLists(user.uid);
        const defaultList = shoppingLists.find(list => list.isDefault) || shoppingLists[0];
        
        if (defaultList) {
          const shopListItems = await shoppingListService.getShoppingListItems(user.uid, defaultList.id);
          // Only include non-crossed-off items that aren't already claimed by other meals
          shopListItems
            .filter(item => !item.crossedOff && !item.mealId)
            .forEach(item => {
              allIngredients.push({
                id: `shopList-${item.id}`,
                name: item.name,
                source: 'shopList'
              });
            });
        }

        // 3. Load perishable items (not dry/canned)
        const perishableItems = allFoodItems.filter(item => 
          !isDryCannedItem(item) && isNotClaimed(item)
        );
        perishableItems.forEach(item => {
          allIngredients.push({
            id: `perishable-${item.id}`,
            name: item.name,
            source: 'perishable'
          });
        });

        // 4. Load dry/canned items
        const dryCannedItems = allFoodItems.filter(item => 
          isDryCannedItem(item) && isNotClaimed(item)
        );
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

  // Combine all selected ingredients from different tabs
  const combinedIngredients = useMemo(() => {
    const combined: string[] = [];
    
    // From "My Ingredients" tab
    Array.from(selectedIngredients).forEach(id => {
      const ingredient = ingredients.find(ing => ing.id === id);
      if (ingredient) {
        combined.push(ingredient.name);
      }
    });
    
    // From "Paste Ingredients" tab
    Array.from(selectedPastedIngredientIndices).forEach(index => {
      if (parsedIngredients[index]) {
        combined.push(parsedIngredients[index]);
      }
    });
    
    // Remove duplicates
    return Array.from(new Set(combined));
  }, [selectedIngredients, ingredients, selectedPastedIngredientIndices, parsedIngredients]);

  // Use ingredient availability hook for combined ingredients
  const {
    pantryItems,
    shoppingListItems,
    ingredientStatuses: combinedIngredientStatuses,
    loading: loadingCombinedIngredients,
    userShoppingLists,
    targetListId,
    setTargetListId
  } = useIngredientAvailability(
    combinedIngredients,
    { isOpen: isOpen && combinedIngredients.length > 0 && selectedMealType !== null }
  );

  // Selected indices for combined ingredients list
  const [selectedCombinedIndices, setSelectedCombinedIndices] = useState<Set<number>>(new Set());

  // Set default selections for combined ingredients (unavailable items selected by default)
  useEffect(() => {
    if (combinedIngredients.length === 0 || combinedIngredientStatuses.length === 0) return;
    if (selectedCombinedIndices.size > 0) return; // Respect user's manual selections
    
    const unavailableIndices = combinedIngredientStatuses
      .filter(item => item.status === 'missing' || item.status === 'partial')
      .map(item => item.index);
    
    if (unavailableIndices.length > 0) {
      setSelectedCombinedIndices(new Set(unavailableIndices));
    }
  }, [combinedIngredientStatuses.length, combinedIngredients.length]);

  const toggleCombinedIngredient = (index: number) => {
    const newSelected = new Set(selectedCombinedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedCombinedIndices(newSelected);
  };

  // Toggle search ingredient selection (max 3)
  const toggleSearchIngredient = (ingredient: string) => {
    const newSelected = new Set(selectedSearchIngredients);
    if (newSelected.has(ingredient)) {
      newSelected.delete(ingredient);
    } else {
      if (newSelected.size >= 3) {
        showToast('You can only select up to 3 ingredients for search', 'warning');
        return;
      }
      newSelected.add(ingredient);
    }
    setSelectedSearchIngredients(newSelected);
  };

  // Handle favorite website selection
  const handleFavoriteSiteSelect = (site: RecipeSite) => {
    setSelectedFavoriteSite(site);
    setRecipeUrl(site.baseUrl);
  };

  // Handle View button click
  const handleViewFavoriteSite = () => {
    if (selectedFavoriteSite) {
      window.open(selectedFavoriteSite.baseUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Handle Google search button click
  const handleGoogleSearch = () => {
    if (selectedSearchIngredients.size === 0) {
      showToast('Please select at least one ingredient to search', 'warning');
      return;
    }
    if (selectedSearchIngredients.size > 3) {
      showToast('Please select no more than 3 ingredients', 'warning');
      return;
    }
    setShowGoogleSearchModal(true);
  };

  // Handle recipe imported from Google search modal
  const handleRecipeImported = (recipe: RecipeImportResult, importedDishName: string) => {
    // Add imported ingredients to parsed ingredients and auto-select them
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      setParsedIngredients(prev => {
        const newIngredients = recipe.ingredients!
          .map(ing => ing.trim())
          .filter(ing => ing.length > 0 && !prev.includes(ing));
        
        // Auto-select all new ingredients
        setSelectedPastedIngredientIndices(prevSelected => {
          const newSelected = new Set(prevSelected);
          const currentLength = prev.length;
          newIngredients.forEach((_, index) => {
            newSelected.add(currentLength + index);
          });
          return newSelected;
        });
        
        return [...prev, ...newIngredients];
      });
    }
    
    // Set dish name if provided
    if (importedDishName && importedDishName.trim()) {
      setDishName(importedDishName);
    }
    
    // Set recipe URL and imported recipe
    if (recipe.sourceUrl) {
      setRecipeUrl(recipe.sourceUrl);
      setImportedRecipe(recipe);
    }
  };

  // Set initial meal type if provided
  useEffect(() => {
    if (isOpen && initialMealType) {
      setSelectedMealType(initialMealType);
    }
  }, [isOpen, initialMealType]);

  // Auto-import recipe when URL is entered and dish name is empty
  useEffect(() => {
    // Debounce the import to avoid multiple calls while user is typing
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
      } catch {
        return false;
      }
    };

    // Only import if URL is valid, dish name is empty, user is logged in, and we haven't already imported this URL
    const trimmedUrl = recipeUrl.trim();
    if (
      trimmedUrl && 
      !dishName.trim() && 
      isValidUrl(trimmedUrl) && 
      user &&
      (!importedRecipe || importedRecipe.sourceUrl !== trimmedUrl)
    ) {
      timeoutId = setTimeout(async () => {
        setImportingRecipe(true);
        try {
          const recipe = await recipeImportService.importRecipe(trimmedUrl);
          setImportedRecipe(recipe);
          
          // Set dish name from recipe title
          if (recipe.title) {
            setDishName(recipe.title);
          }
          
          // Add recipe ingredients to parsed ingredients and auto-select them
          if (recipe.ingredients && recipe.ingredients.length > 0) {
            // Use functional updates to avoid dependency issues
            setParsedIngredients(prevParsed => {
              const newParsed = recipe.ingredients!
                .map(ing => ing.trim())
                .filter(ing => ing.length > 0 && !prevParsed.includes(ing));
              
              if (newParsed.length > 0) {
                // Auto-select all new recipe ingredients
                setSelectedPastedIngredientIndices(prevSelected => {
                  const newSelected = new Set(prevSelected);
                  newParsed.forEach((_, index) => {
                    newSelected.add(prevParsed.length + index);
                  });
                  return newSelected;
                });
                
                return [...prevParsed, ...newParsed];
              }
              
              return prevParsed;
            });
          }
          
          showToast('Recipe imported successfully', 'success');
        } catch (error: any) {
          console.error('Error auto-importing recipe:', error);
          showToast(error.message || 'Failed to import recipe. You can still enter a dish name manually.', 'error');
        } finally {
          setImportingRecipe(false);
        }
      }, 1500); // Wait 1.5 seconds after user stops typing
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [recipeUrl, dishName, user, importedRecipe]);

  // Ensure Google exists as a favorite website
  const ensureGoogleFavorite = async () => {
    try {
      const allSites = await recipeSiteService.getRecipeSites();
      const googleSite = allSites.find(s => 
        s.label.toLowerCase() === 'google' || 
        s.baseUrl.includes('google.com')
      );
      
      if (!googleSite) {
        // Create Google as a favorite
        await recipeSiteService.createRecipeSite({
          label: 'Google',
          baseUrl: 'https://www.google.com',
          searchTemplateUrl: 'https://www.google.com/search?q={query}',
          enabled: true
        });
      } else if (!googleSite.enabled) {
        // Enable Google if it exists but is disabled
        await recipeSiteService.updateRecipeSite(googleSite.id, { enabled: true });
      }
    } catch (error) {
      console.error('Error ensuring Google favorite:', error);
    }
  };

  // Load favorite websites when modal opens
  useEffect(() => {
    if (!isOpen || !user) {
      setFavoriteWebsites([]);
      return;
    }

    const loadFavorites = async () => {
      try {
        setLoadingFavorites(true);
        // Ensure Google exists
        await ensureGoogleFavorite();
        
        // Get all sites and filter for enabled ones (more reliable than ordering by enabled)
        const allSites = await recipeSiteService.getRecipeSites();
        const enabledSites = allSites.filter(site => site.enabled === true);
        // Sort by label, but put Google first
        enabledSites.sort((a, b) => {
          if (a.label.toLowerCase() === 'google') return -1;
          if (b.label.toLowerCase() === 'google') return 1;
          return a.label.localeCompare(b.label);
        });
        setFavoriteWebsites(enabledSites);
        console.log('[IngredientPickerModal] Loaded favorite websites:', enabledSites.length, enabledSites);
      } catch (error) {
        console.error('Error loading favorite websites:', error);
        showToast('Failed to load favorite websites', 'error');
      } finally {
        setLoadingFavorites(false);
      }
    };

    loadFavorites();
  }, [isOpen, user]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMealType(null);
      setActiveTab('myIngredients');
      setSelectedIngredients(new Set());
      setRecipeUrl('');
      setPastedIngredients('');
      setParsedIngredients([]);
      setSelectedPastedIngredientIndices(new Set());
      setDishName('');
      setSelectedCombinedIndices(new Set());
      setImportedRecipe(null);
      setImportingRecipe(false);
      setSelectedFavoriteSite(null);
      setSelectedSearchIngredients(new Set());
      setShowGoogleSearchModal(false);
      setShowGoogleSearchRecipeModal(false);
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

  const handleSaveMeal = async () => {
    if (!user || !selectedMealType) {
      showToast('Please select a meal type', 'error');
      return;
    }

    if (combinedIngredients.length === 0) {
      showToast('Please add at least one ingredient', 'error');
      return;
    }

    if (selectedCombinedIndices.size > 0 && !targetListId) {
      showToast('Please select a shopping list to add ingredients', 'error');
      return;
    }

    if (!dishName.trim()) {
      showToast('Please enter a dish name', 'error');
      return;
    }

    setSaving(true);
    try {
      const dishId = `dish-${Date.now()}`;
      const finalDishName = dishName.trim();

      // Get checked ingredients from combined list
      const checkedIngredients = Array.from(selectedCombinedIndices)
        .map(index => combinedIngredients[index])
        .filter(Boolean);

      // Calculate reserved quantities for this dish
      const reservedQuantities = recipeImportService.calculateMealReservedQuantities(
        combinedIngredients,
        pantryItems
      );

      // Get or create meal plan for this week
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      weekStart.setHours(0, 0, 0, 0);

      let mealPlan = await mealPlanningService.getMealPlan(user.uid, weekStart);
      
      if (!mealPlan) {
        mealPlan = await mealPlanningService.createMealPlan(user.uid, weekStart, []);
      }

      // Get or create PlannedMeal for this date and meal type
      let plannedMeal = mealPlan.meals.find(
        m => isSameDay(m.date, selectedDate) && m.mealType === selectedMealType
      );

      if (!plannedMeal) {
        // Create new PlannedMeal for this date+mealType
        const mealId = `meal-${Date.now()}`;
        plannedMeal = {
          id: mealId,
          date: selectedDate,
          mealType: selectedMealType,
          finishBy: '18:00',
          confirmed: false,
          skipped: false,
          isLeftover: false,
          dishes: []
        };
      }

      // Claim items from dashboard/pantry for this dish (using dishId as mealId)
      const claimedItemIds = await recipeImportService.claimItemsForMeal(
        user.uid,
        dishId,
        combinedIngredients,
        pantryItems,
        reservedQuantities
      );

      // Claim existing shopping list items for this dish (using dishId as mealId)
      const claimedShoppingListItemIds = await recipeImportService.claimShoppingListItemsForMeal(
        user.uid,
        dishId,
        combinedIngredients,
        shoppingListItems
      );

      // Add checked ingredients (missing items) to shopping list
      const itemsToAdd = checkedIngredients;
      const newlyAddedItemIds: string[] = [];
      
      if (itemsToAdd.length > 0 && targetListId) {
        for (const ingredient of itemsToAdd) {
          const itemId = await shoppingListService.addShoppingListItem(
            user.uid,
            targetListId,
            ingredient,
            false,
            'meal_plan',
            dishId
          );
          newlyAddedItemIds.push(itemId);
        }
      }

      // Combine claimed and newly added shopping list item IDs
      const allClaimedShoppingListItemIds = [...claimedShoppingListItemIds, ...newlyAddedItemIds];

      // Create the dish
      const dish: Dish = {
        id: dishId,
        dishName: finalDishName,
        recipeTitle: finalDishName,
        recipeIngredients: combinedIngredients,
        recipeSourceUrl: recipeUrl || null,
        recipeSourceDomain: recipeUrl ? (() => {
          try {
            return new URL(recipeUrl).hostname;
          } catch {
            return null;
          }
        })() : null,
        recipeImageUrl: null,
        reservedQuantities,
        claimedItemIds,
        claimedShoppingListItemIds: allClaimedShoppingListItemIds,
        completed: false
      };

      // Add dish to PlannedMeal
      const updatedDishes = [...(plannedMeal.dishes || []), dish];
      plannedMeal.dishes = updatedDishes;

      // Update or add PlannedMeal to meal plan
      const mealIndex = mealPlan.meals.findIndex(m => m.id === plannedMeal!.id);
      if (mealIndex >= 0) {
        mealPlan.meals[mealIndex] = plannedMeal;
      } else {
        mealPlan.meals.push(plannedMeal);
      }

      await mealPlanningService.updateMealPlan(mealPlan.id, { meals: mealPlan.meals });

      if (itemsToAdd.length > 0) {
        showToast(`Dish saved and ${itemsToAdd.length} ingredient(s) added to shopping list!`, 'success');
      } else {
        showToast('Dish saved to meal planner successfully!', 'success');
      }

      onClose();
    } catch (error) {
      console.error('Error saving dish:', error);
      showToast('Failed to save dish. Please try again.', 'error');
      setSaving(false);
    }
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
              /* Tabbed Ingredient Selection */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
                      {MEAL_TYPES.find(m => m.value === selectedMealType)?.label}
                    </h3>
                    <button
                      onClick={handleSaveMeal}
                      disabled={saving || !dishName.trim() || (selectedCombinedIndices.size > 0 && !targetListId) || combinedIngredients.length === 0}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: saving || !dishName.trim() || (selectedCombinedIndices.size > 0 && !targetListId) || combinedIngredients.length === 0 ? '#9ca3af' : '#002B4D',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        fontWeight: '500',
                        cursor: saving || !dishName.trim() || (selectedCombinedIndices.size > 0 && !targetListId) || combinedIngredients.length === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {saving ? 'Saving...' : `Create Dish${selectedCombinedIndices.size > 0 ? ` & Add ${selectedCombinedIndices.size} to List` : ''}`}
                    </button>
                  </div>
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

                {/* Name your Dish Field */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="dishName" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                    Name your Dish
                  </label>
                  <input
                    id="dishName"
                    type="text"
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    placeholder="e.g., Homemade Tortilla Soup"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      color: '#1f2937',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Tab Headers */}
                <div style={{
                  display: 'flex',
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  marginBottom: '1.5rem'
                }}>
                  <button
                    onClick={() => setActiveTab('myIngredients')}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      border: 'none',
                      backgroundColor: activeTab === 'myIngredients' ? '#ffffff' : 'transparent',
                      borderBottom: activeTab === 'myIngredients' ? '2px solid #002B4D' : 'none',
                      color: activeTab === 'myIngredients' ? '#002B4D' : '#6b7280',
                      fontWeight: activeTab === 'myIngredients' ? '600' : '400',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    My Ingredients
                  </button>
                  <button
                    onClick={() => setActiveTab('pasteIngredients')}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      border: 'none',
                      backgroundColor: activeTab === 'pasteIngredients' ? '#ffffff' : 'transparent',
                      borderBottom: activeTab === 'pasteIngredients' ? '2px solid #002B4D' : 'none',
                      color: activeTab === 'pasteIngredients' ? '#002B4D' : '#6b7280',
                      fontWeight: activeTab === 'pasteIngredients' ? '600' : '400',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Paste Ingredients
                  </button>
                  <button
                    onClick={() => setActiveTab('recipeUrl')}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      border: 'none',
                      backgroundColor: activeTab === 'recipeUrl' ? '#ffffff' : 'transparent',
                      borderBottom: activeTab === 'recipeUrl' ? '2px solid #002B4D' : 'none',
                      color: activeTab === 'recipeUrl' ? '#002B4D' : '#6b7280',
                      fontWeight: activeTab === 'recipeUrl' ? '600' : '400',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Recipe URL
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ marginBottom: '1.5rem', minHeight: '300px' }}>
                  {activeTab === 'myIngredients' && (
                    <div>
                      {loading ? (
                        <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading ingredients...</p>
                      ) : (
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                          {/* Expiring Soon */}
                          {groupedIngredients.bestBySoon.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                                {getSourceLabel('bestBySoon')}
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {groupedIngredients.bestBySoon.map(ingredient => (
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
                      )}
                    </div>
                  )}

                  {activeTab === 'recipeUrl' && (
                    <div>
                      {/* Favorite Websites Dropdown */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <label htmlFor="favoriteWebsite" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                          Select Favorite Website
                        </label>
                        <select
                          id="favoriteWebsite"
                          value={selectedFavoriteSite?.id || ''}
                          onChange={(e) => {
                            if (e.target.value === '__add_favorite__') {
                              // Open Google search modal with selected ingredients
                              const ingredientsToSearch = selectedSearchIngredients.size > 0
                                ? Array.from(selectedSearchIngredients)
                                : combinedIngredients.slice(0, 3); // Limit to 3
                              
                              if (ingredientsToSearch.length === 0) {
                                showToast('Please select at least one ingredient to search', 'warning');
                                return;
                              }
                              
                              setShowGoogleSearchRecipeModal(true);
                            } else {
                              const site = favoriteWebsites.find(s => s.id === e.target.value);
                              if (site) {
                                handleFavoriteSiteSelect(site);
                              }
                            }
                          }}
                          disabled={loadingFavorites}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            color: '#1f2937',
                            backgroundColor: loadingFavorites ? '#f3f4f6' : '#ffffff'
                          }}
                        >
                          <option value="">Choose a favorite website...</option>
                          {favoriteWebsites.map(site => (
                            <option key={site.id} value={site.id}>
                              {site.label}
                            </option>
                          ))}
                          <option value="__add_favorite__" style={{ fontStyle: 'italic', color: '#6b7280' }}>
                            + Add Favorite (Google Search)
                          </option>
                        </select>
                        {loadingFavorites && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                            Loading favorite websites...
                          </p>
                        )}
                        {!loadingFavorites && favoriteWebsites.length === 0 && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#dc2626' }}>
                            No favorite websites found. Add favorites at{' '}
                            <a 
                              href="/favorite-websites" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ color: '#002B4D', textDecoration: 'underline' }}
                            >
                              Favorite Websites
                            </a>
                          </p>
                        )}
                      </div>

                      {/* View Button */}
                      {selectedFavoriteSite && (
                        <div style={{ marginBottom: '1.5rem' }}>
                          <button
                            onClick={handleViewFavoriteSite}
                            style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#002B4D',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '1rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              width: '100%'
                            }}
                          >
                            View {selectedFavoriteSite.label}
                          </button>
                        </div>
                      )}

                      {/* Check up to 3 items to search */}
                      {combinedIngredients.length > 0 && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            Check up to 3 items to search ({selectedSearchIngredients.size} of 3 selected)
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                            {combinedIngredients.map((ingredient, index) => (
                              <label
                                key={index}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.5rem',
                                  cursor: selectedSearchIngredients.size >= 3 && !selectedSearchIngredients.has(ingredient) ? 'not-allowed' : 'pointer',
                                  borderRadius: '4px',
                                  backgroundColor: selectedSearchIngredients.has(ingredient) ? '#f0f8ff' : 'transparent',
                                  opacity: selectedSearchIngredients.size >= 3 && !selectedSearchIngredients.has(ingredient) ? 0.5 : 1
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSearchIngredients.has(ingredient)}
                                  onChange={() => toggleSearchIngredient(ingredient)}
                                  disabled={selectedSearchIngredients.size >= 3 && !selectedSearchIngredients.has(ingredient)}
                                  style={{
                                    marginRight: '0.75rem',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    cursor: selectedSearchIngredients.size >= 3 && !selectedSearchIngredients.has(ingredient) ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <span style={{ flex: 1, fontSize: '0.875rem' }}>{ingredient}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Search with Google Button */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <button
                          onClick={handleGoogleSearch}
                          disabled={selectedSearchIngredients.size === 0 || selectedSearchIngredients.size > 3}
                          style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: (selectedSearchIngredients.size === 0 || selectedSearchIngredients.size > 3) ? '#9ca3af' : '#002B4D',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            fontWeight: '500',
                            cursor: (selectedSearchIngredients.size === 0 || selectedSearchIngredients.size > 3) ? 'not-allowed' : 'pointer',
                            width: '100%'
                          }}
                        >
                          Search with Google
                        </button>
                      </div>

                      {/* Recipe URL Paste Field */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="recipeUrl" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                          Paste Recipe URL
                        </label>
                        <input
                          id="recipeUrl"
                          type="url"
                          value={recipeUrl}
                          onChange={(e) => setRecipeUrl(e.target.value)}
                          placeholder="https://example.com/recipe"
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            color: '#1f2937'
                          }}
                        />
                        {importingRecipe && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#002B4D', fontStyle: 'italic' }}>
                            Importing recipe...
                          </p>
                        )}
                        {importedRecipe && !importingRecipe && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px' }}>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: '#166534', fontWeight: '500' }}>
                              ✓ Recipe imported: {importedRecipe.title}
                            </p>
                            {importedRecipe.ingredients && importedRecipe.ingredients.length > 0 && (
                              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#15803d' }}>
                                {importedRecipe.ingredients.length} ingredient{importedRecipe.ingredients.length !== 1 ? 's' : ''} added
                              </p>
                            )}
                          </div>
                        )}
                        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          Paste a recipe URL to automatically import the recipe title and ingredients.
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'pasteIngredients' && (
                    <div>
                      <label htmlFor="pastedIngredients" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                        Paste Ingredients
                      </label>
                      <textarea
                        id="pastedIngredients"
                        value={pastedIngredients}
                        onChange={(e) => setPastedIngredients(e.target.value)}
                        placeholder="Paste ingredients here, one per line or separated by commas...&#10;Example:&#10;2 cups flour&#10;1 cup sugar&#10;3 eggs"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          color: '#1f2937',
                          minHeight: '150px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          marginBottom: '1rem'
                        }}
                      />
                      {parsedIngredients.length > 0 && (
                        <div>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                            Parsed Ingredients ({selectedPastedIngredientIndices.size} of {parsedIngredients.length} selected)
                          </h4>
                          {loadingPastedIngredients ? (
                            <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>Checking ingredient availability...</p>
                          ) : (
                            <IngredientChecklist
                              ingredientStatuses={pastedIngredientStatuses}
                              selectedIngredientIndices={selectedPastedIngredientIndices}
                              onToggleIngredient={togglePastedIngredient}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Create Dish Section */}
                {combinedIngredients.length > 0 && (
                  <div style={{
                    marginTop: '2rem',
                    padding: '1.5rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                      Create Dish
                    </h3>

                    {/* Combined Ingredients with Checkboxes */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                          Ingredients ({combinedIngredients.length})
                        </h4>
                        {combinedIngredientStatuses.length > 0 && (
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            <span style={{ color: '#059669', marginRight: '0.5rem' }}>
                              In Dashboard: {combinedIngredientStatuses.filter(item => item.status === 'available' || item.status === 'partial').length}
                            </span>
                            <span style={{ color: '#dc2626' }}>
                              Missing: {combinedIngredientStatuses.filter(item => item.status === 'missing').length}
                            </span>
                          </div>
                        )}
                      </div>
                      {loadingCombinedIngredients ? (
                        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>Checking ingredient availability...</p>
                      ) : (
                        <IngredientChecklist
                          ingredientStatuses={combinedIngredientStatuses}
                          selectedIngredientIndices={selectedCombinedIndices}
                          onToggleIngredient={toggleCombinedIngredient}
                        />
                      )}
                    </div>

                    {/* Shopping List Selection */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                        Add selected to:
                      </label>
                      <select
                        value={targetListId || ''}
                        onChange={(e) => setTargetListId(e.target.value)}
                        disabled={loadingCombinedIngredients}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: loadingCombinedIngredients ? '#f3f4f6' : '#ffffff'
                        }}
                      >
                        <option value="">Do not add to list</option>
                        {userShoppingLists.map(list => (
                          <option key={list.id} value={list.id}>
                            {list.name} {list.isDefault ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Cancel Button */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button
                    onClick={onClose}
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
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Google Search Modal */}
      <GoogleSearchModal
        isOpen={showGoogleSearchModal}
        onClose={() => setShowGoogleSearchModal(false)}
        ingredients={Array.from(selectedSearchIngredients)}
      />

      {/* Google Search Recipe Modal */}
      <GoogleSearchRecipeModal
        isOpen={showGoogleSearchRecipeModal}
        onClose={() => setShowGoogleSearchRecipeModal(false)}
        ingredients={selectedSearchIngredients.size > 0 
          ? Array.from(selectedSearchIngredients) 
          : combinedIngredients.slice(0, 3)}
        onRecipeImported={handleRecipeImported}
      />
    </>
  );
};
