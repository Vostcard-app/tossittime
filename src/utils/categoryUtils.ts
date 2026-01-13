/**
 * Category Utilities
 * Auto-detect food item categories based on item names
 */

export type FoodCategory = 'Proteins' | 'Vegetables' | 'Fruits' | 'Dairy' | 'Leftovers' | 'Other';

/**
 * Detect category from item name using keyword matching
 * Returns the most specific matching category
 */
export function detectCategory(itemName: string): FoodCategory {
  if (!itemName || !itemName.trim()) {
    return 'Other';
  }

  const normalizedName = itemName.toLowerCase().trim();

  // Check for Leftovers first (most specific)
  if (normalizedName.includes('leftover') || normalizedName.includes('left over')) {
    return 'Leftovers';
  }

  // Check for Proteins
  const proteinKeywords = [
    'meat', 'chicken', 'beef', 'pork', 'fish', 'seafood', 'turkey', 'lamb',
    'bacon', 'ham', 'sausage', 'hot dog', 'hotdog', 'burger', 'hamburger',
    'steak', 'ribs', 'chop', 'cutlet', 'fillet', 'salmon', 'tuna', 'shrimp',
    'crab', 'lobster', 'mussel', 'oyster', 'scallop', 'egg', 'eggs', 'tofu',
    'tempeh', 'seitan', 'beans', 'black bean', 'kidney bean', 'chickpea',
    'lentil', 'edamame', 'peanut', 'almond', 'walnut', 'cashew', 'pistachio',
    'pecan', 'hazelnut', 'macadamia', 'brazil nut', 'pumpkin seed', 'sunflower seed',
    'chia seed', 'flax seed', 'hemp seed', 'quinoa', 'jerky', 'deli meat',
    'lunch meat', 'salami', 'pepperoni', 'prosciutto', 'chorizo', 'bratwurst',
    'kielbasa', 'andouille', 'ground beef', 'ground turkey', 'ground chicken',
    'ground pork', 'chicken breast', 'chicken thigh', 'chicken wing', 'chicken leg',
    'pork chop', 'pork tenderloin', 'beef roast', 'pork roast', 'turkey breast',
    'duck', 'goose', 'venison', 'bison', 'elk', 'rabbit'
  ];

  for (const keyword of proteinKeywords) {
    if (normalizedName.includes(keyword)) {
      return 'Proteins';
    }
  }

  // Check for Dairy
  const dairyKeywords = [
    'milk', 'cheese', 'yogurt', 'yoghurt', 'cream', 'butter', 'sour cream',
    'cottage cheese', 'ricotta', 'mozzarella', 'cheddar', 'swiss', 'gouda',
    'brie', 'camembert', 'feta', 'goat cheese', 'blue cheese', 'parmesan',
    'pecorino', 'romano', 'asiago', 'provolone', 'gorgonzola', 'mascarpone',
    'cream cheese', 'whipped cream', 'heavy cream', 'half and half', 'buttermilk',
    'kefir', 'greek yogurt', 'ice cream', 'gelato', 'sorbet', 'frozen yogurt',
    'pudding', 'custard', 'flan', 'creme', 'milk alternative', 'almond milk',
    'soy milk', 'oat milk', 'coconut milk', 'rice milk', 'hemp milk'
  ];

  for (const keyword of dairyKeywords) {
    if (normalizedName.includes(keyword)) {
      return 'Dairy';
    }
  }

  // Check for Fruits
  const fruitKeywords = [
    'apple', 'banana', 'orange', 'berry', 'strawberry', 'blueberry', 'raspberry',
    'blackberry', 'cranberry', 'elderberry', 'gooseberry', 'grape', 'grapefruit',
    'lemon', 'lime', 'kiwi', 'kiwifruit', 'mango', 'papaya', 'pineapple',
    'watermelon', 'cantaloupe', 'honeydew', 'melon', 'peach', 'pear', 'plum',
    'apricot', 'cherry', 'nectarine', 'avocado', 'coconut', 'pomegranate',
    'fig', 'date', 'prune', 'raisin', 'currant', 'cranberry', 'elderberry',
    'passion fruit', 'dragon fruit', 'star fruit', 'lychee', 'rambutan',
    'durian', 'jackfruit', 'persimmon', 'quince', 'guava', 'tamarind',
    'dried fruit', 'fruit juice', 'fruit salad'
  ];

  for (const keyword of fruitKeywords) {
    if (normalizedName.includes(keyword)) {
      return 'Fruits';
    }
  }

  // Check for Vegetables
  const vegetableKeywords = [
    'vegetable', 'veggie', 'lettuce', 'spinach', 'kale', 'arugula', 'chard',
    'collard', 'mustard green', 'bok choy', 'cabbage', 'broccoli', 'cauliflower',
    'brussels sprout', 'asparagus', 'carrot', 'celery', 'onion', 'garlic',
    'leek', 'shallot', 'scallion', 'green onion', 'chive', 'potato', 'sweet potato',
    'yam', 'radish', 'turnip', 'rutabaga', 'parsnip', 'beet', 'beetroot',
    'tomato', 'pepper', 'bell pepper', 'jalapeno', 'habanero', 'serrano',
    'poblano', 'anaheim', 'cucumber', 'zucchini', 'squash', 'pumpkin', 'butternut',
    'acorn squash', 'spaghetti squash', 'eggplant', 'okra', 'corn', 'peas',
    'green bean', 'snap pea', 'snow pea', 'edamame', 'lima bean', 'fava bean',
    'artichoke', 'brussels sprout', 'cabbage', 'kohlrabi', 'fennel', 'rhubarb',
    'mushroom', 'shiitake', 'portobello', 'cremini', 'oyster mushroom',
    'enoki', 'maitake', 'salad', 'greens', 'herb', 'basil', 'parsley', 'cilantro',
    'dill', 'oregano', 'thyme', 'rosemary', 'sage', 'mint', 'tarragon'
  ];

  for (const keyword of vegetableKeywords) {
    if (normalizedName.includes(keyword)) {
      return 'Vegetables';
    }
  }

  // Default to Other if no match
  return 'Other';
}
