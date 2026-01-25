# Add Favorite Recipes Feature

## Overview
Add a Favorites checkbox to the Save Dish modal, create a Favorite Recipes page accessible from the hamburger menu, and add Plan buttons to favorite recipes that open the calendar for meal planning.

## Implementation Steps

### 1. Create Favorite Recipe Type
**File**: `src/types/favoriteRecipe.ts` (new file)

- Create `FavoriteRecipe` interface with:
  - `id: string`
  - `userId: string`
  - `dishName: string`
  - `recipeTitle?: string | null`
  - `recipeIngredients: string[]`
  - `recipeSourceUrl?: string | null`
  - `recipeSourceDomain?: string | null`
  - `recipeImageUrl?: string | null`
  - `parsedIngredients?: ParsedIngredient[]` (for AI-parsed data)
  - `createdAt: Date`
- Export the type

### 2. Create Favorite Recipes Service
**File**: `src/services/favoriteRecipeService.ts` (new file)

- Create service with functions:
  - `saveFavoriteRecipe(userId, recipeData): Promise<string>` - Save recipe to `favoriteRecipes` collection
  - `getFavoriteRecipes(userId): Promise<FavoriteRecipe[]>` - Get all favorite recipes for user
  - `deleteFavoriteRecipe(recipeId): Promise<void>` - Delete a favorite recipe
  - `subscribeToFavoriteRecipes(userId, callback)` - Real-time subscription
- Use Firestore collection `favoriteRecipes` with userId field
- Follow pattern from other services (userItemsService, etc.)

### 3. Add Favorites Checkbox to SaveDishModal
**File**: `src/components/MealPlanner/SaveDishModal.tsx`

- Add `isFavorite` state (boolean, default false)
- Add checkbox after dish name input (before Cancel/Save buttons)
- Label: "Add to Favorites" or "Save as Favorite Recipe"
- Update `onSave` callback to include `isFavorite: boolean` in the data object
- Pass `isFavorite` to parent component

### 4. Update IngredientPickerModal to Handle Favorites
**File**: `src/components/MealPlanner/IngredientPickerModal.tsx`

- Import `favoriteRecipeService`
- In `handleSaveMeal`, check if `isFavorite` is true
- If true, save recipe to favorites collection (extract recipe data from dish before saving to meal plan)
- Save recipe data including: dishName, recipeTitle, recipeIngredients, recipeSourceUrl, recipeSourceDomain, recipeImageUrl, parsedIngredients

### 5. Create Favorite Recipes Page
**File**: `src/pages/FavoriteRecipes.tsx` (new file)

- Display list of favorite recipes
- Each recipe shows:
  - Recipe name (dishName or recipeTitle)
  - Recipe source URL (if available, as clickable link)
  - Ingredients list
  - Plan button (opens calendar)
  - Delete button (removes from favorites)
- Use similar styling to other list pages (Shop, Dashboard)
- Include Banner and HamburgerMenu components

### 6. Add Plan Button Functionality
**File**: `src/pages/FavoriteRecipes.tsx`

- Plan button navigates to `/planned-meal-calendar` with location state:
  - `favoriteRecipe: FavoriteRecipe`
  - `selectedDate?: Date` (optional, can be today or let user pick)
  - `selectedMealType?: MealType` (optional, can let user pick)
- When calendar opens with favoriteRecipe state, it should:
  - Open IngredientPickerModal with the recipe data pre-populated
  - Allow user to select date and meal type if not provided

### 7. Update PlannedMealCalendar to Handle Favorite Recipe State
**File**: `src/pages/PlannedMealCalendar.tsx`

- Check location state for `favoriteRecipe`
- If present, automatically open IngredientPickerModal with:
  - Pre-populated recipe data (ingredients, title, URL)
  - Use `selectedDate` from state or default to today
  - Use `selectedMealType` from state or show meal type selection

### 8. Update IngredientPickerModal to Accept Favorite Recipe
**File**: `src/components/MealPlanner/IngredientPickerModal.tsx`

- Add optional prop `favoriteRecipe?: FavoriteRecipe`
- If `favoriteRecipe` is provided:
  - Pre-populate recipe URL if available
  - Pre-populate ingredients
  - Set imported recipe state
  - Auto-select appropriate tab (recipeUrl or pasteIngredients)
  - Pre-fill dish name

### 9. Add Favorite Recipes to Hamburger Menu
**File**: `src/components/layout/HamburgerMenu.tsx`

- Add new Link for "Favorite Recipes" after "Meal Planner" or in appropriate location
- Navigate to `/favorite-recipes`
- Use same styling pattern as other menu items

### 10. Add Route for Favorite Recipes Page
**File**: `src/App.tsx`

- Add route: `<Route path="/favorite-recipes" element={<FavoriteRecipes />} />`
- Import FavoriteRecipes component

### 11. Update Firestore Rules
**File**: `firestore.rules`

- Add rules for `favoriteRecipes` collection:
  - Users can read/write their own favorite recipes
  - Users can only create/update/delete recipes with their own userId

## Technical Details

**Data Structure:**
- Favorite recipes stored in `favoriteRecipes` collection
- Each document has userId field for user-specific data
- Recipe data includes all dish information except meal-specific fields (reservedQuantities, claimedItemIds, etc.)

**Navigation Flow:**
1. User saves dish with favorites checked → Recipe saved to favorites
2. User opens Favorite Recipes from menu → Sees list of favorites
3. User taps Plan button → Navigates to calendar with recipe data
4. Calendar opens IngredientPickerModal with recipe pre-populated
5. User selects date/meal type → Recipe added to meal plan

**Files to Create:**
1. `src/types/favoriteRecipe.ts` - Type definitions
2. `src/services/favoriteRecipeService.ts` - Service for favorite recipes
3. `src/pages/FavoriteRecipes.tsx` - Favorite recipes page

**Files to Modify:**
1. `src/components/MealPlanner/SaveDishModal.tsx` - Add favorites checkbox
2. `src/components/MealPlanner/IngredientPickerModal.tsx` - Handle favorites saving and loading
3. `src/pages/PlannedMealCalendar.tsx` - Handle favoriteRecipe state
4. `src/components/layout/HamburgerMenu.tsx` - Add Favorite Recipes link
5. `src/App.tsx` - Add route
6. `firestore.rules` - Add rules for favoriteRecipes collection
7. `src/services/index.ts` - Export favoriteRecipeService
8. `src/types/index.ts` - Export FavoriteRecipe type
