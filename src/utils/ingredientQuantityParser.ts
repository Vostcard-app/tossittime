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

/**
 * Clean ingredient name by removing descriptors and duplicates
 * Examples:
 * - "fresh chopped fresh basil" -> "basil"
 * - "diced roma tomatoes" -> "roma tomatoes"
 * - "minced garlic cloves" -> "garlic"
 */
export function cleanIngredientName(itemName: string): string {
  // Common cooking descriptors to remove
  const descriptors = [
    'fresh', 'chopped', 'diced', 'minced', 'sliced', 'grated', 'crushed',
    'whole', 'ground', 'dried', 'frozen', 'canned', 'raw', 'cooked',
    'peeled', 'seeded', 'stemmed', 'trimmed', 'julienned', 'cubed',
    'shredded', 'crumbled', 'mashed', 'pureed', 'whipped', 'beaten',
    'softened', 'melted', 'warmed', 'cooled', 'room temperature',
    'large', 'small', 'medium', 'extra large', 'extra small',
    'thin', 'thick', 'fine', 'coarse', 'rough', 'smooth',
    'optional', 'to taste', 'as needed', 'for garnish'
  ];
  
  // Split into words and filter
  const words = itemName
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(word => {
      // Remove descriptors
      if (descriptors.includes(word)) return false;
      // Remove very short words (unless they're important like "of")
      if (word.length < 2) return false;
      return true;
    });
  
  // Remove duplicates while preserving order
  const uniqueWords: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      uniqueWords.push(word);
    }
  }
  
  return uniqueWords.join(' ').trim();
}
