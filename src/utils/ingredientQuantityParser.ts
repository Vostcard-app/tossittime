/**
 * Ingredient Quantity Parser
 * Parses quantities and item names from ingredient strings
 */

export interface ParsedIngredient {
  quantity: number | null; // null if no quantity specified
  itemName: string; // Normalized item name
  unit?: string; // Unit if specified (cup, tbsp, etc.)
  originalText: string; // Original ingredient text
}

/**
 * Parse quantity and item name from ingredient string
 * Examples:
 * - "4 eggs" -> { quantity: 4, itemName: "eggs" }
 * - "6 Roma tomatoes" -> { quantity: 6, itemName: "roma tomatoes" }
 * - "1/2 cup flour" -> { quantity: 0.5, itemName: "flour", unit: "cup" }
 * - "salt and pepper to taste" -> { quantity: null, itemName: "salt and pepper to taste" }
 */
export function parseIngredientQuantity(ingredient: string): ParsedIngredient {
  const originalText = ingredient.trim();
  const normalized = originalText.toLowerCase().trim();
  
  // Pattern to match quantities at the start (numbers, fractions, mixed numbers)
  const quantityPattern = /^([\d\s]+)?([\d]+\/[\d]+)?\s*/;
  const match = normalized.match(quantityPattern);
  
  let quantity: number | null = null;
  let remainingText = normalized;
  let unit: string | undefined;
  
  if (match) {
    const wholeNumberPart = match[1]?.trim();
    const fractionPart = match[2];
    
    if (wholeNumberPart || fractionPart) {
      let qty = 0;
      
      // Parse whole number
      if (wholeNumberPart) {
        qty += parseFloat(wholeNumberPart);
      }
      
      // Parse fraction
      if (fractionPart) {
        const [num, den] = fractionPart.split('/').map(n => parseFloat(n));
        if (den && den !== 0) {
          qty += num / den;
        }
      }
      
      quantity = qty;
      remainingText = normalized.substring(match[0].length).trim();
    }
  }
  
  // Common measurement units
  const measurementWords = [
    'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 
    'tsp', 'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces',
    'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams',
    'kg', 'kilogram', 'kilograms', 'ml', 'milliliter', 'milliliters',
    'l', 'liter', 'liters', 'piece', 'pieces', 'clove', 'cloves',
    'can', 'cans', 'package', 'packages', 'bottle', 'bottles',
    'jar', 'jars', 'box', 'boxes', 'bag', 'bags', 'container', 'containers'
  ];
  
  // Check if there's a unit after the quantity
  for (const unitWord of measurementWords) {
    const unitRegex = new RegExp(`^\\b${unitWord}\\b`, 'i');
    if (remainingText.match(unitRegex)) {
      unit = unitWord;
      remainingText = remainingText.replace(unitRegex, '').trim();
      break;
    }
  }
  
  // Clean up the item name
  // Remove common prefixes and clean up
  let itemName = remainingText
    .replace(/^of\s+/i, '') // Remove "of" prefix
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // If no quantity was found, the whole string is the item name
  if (quantity === null) {
    itemName = normalized;
  }
  
  return {
    quantity,
    itemName,
    unit,
    originalText
  };
}

/**
 * Normalize item name for matching (for use in reserved quantities map)
 */
export function normalizeItemName(itemName: string): string {
  return itemName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ''); // Remove special characters
}
