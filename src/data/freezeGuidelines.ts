/**
 * Freeze Guidelines - Single source of truth for frozen food best-quality windows
 * 
 * These guidelines specify how long frozen items maintain best quality (in months).
 * These are general guidelines and may vary based on packaging and storage conditions.
 */

export type FreezeCategory =
  | 'COOKED_LEFTOVERS_GENERAL'
  | 'COOKED_DISHES_SAUCED'
  | 'COOKED_POULTRY'
  | 'COOKED_MEAT_BEEF_PORK'
  | 'RAW_POULTRY'
  | 'RAW_BEEF_PORK'
  | 'FISH_FATTY'
  | 'FISH_LEAN'
  | 'BREAD_BAKED_GOODS'
  | 'VEGETABLES_BLANCHED'
  | 'FRUIT'
  | 'CHEESE_DISHES';

/**
 * Mapping from freeze category to best-quality window in months
 */
export const freezeGuidelines: Record<FreezeCategory, number> = {
  COOKED_LEFTOVERS_GENERAL: 2,
  COOKED_DISHES_SAUCED: 2,
  COOKED_POULTRY: 4,
  COOKED_MEAT_BEEF_PORK: 4,
  RAW_POULTRY: 9,
  RAW_BEEF_PORK: 12,
  FISH_FATTY: 3,
  FISH_LEAN: 8,
  BREAD_BAKED_GOODS: 3,
  VEGETABLES_BLANCHED: 12,
  FRUIT: 12,
  CHEESE_DISHES: 2,
};

/**
 * Human-friendly labels for each freeze category
 */
export const freezeCategoryLabels: Record<FreezeCategory, string> = {
  COOKED_LEFTOVERS_GENERAL: 'Cooked Leftovers (General)',
  COOKED_DISHES_SAUCED: 'Cooked Dishes with Sauce',
  COOKED_POULTRY: 'Cooked Poultry',
  COOKED_MEAT_BEEF_PORK: 'Cooked Beef/Pork',
  RAW_POULTRY: 'Raw Poultry',
  RAW_BEEF_PORK: 'Raw Beef/Pork',
  FISH_FATTY: 'Fatty Fish',
  FISH_LEAN: 'Lean Fish',
  BREAD_BAKED_GOODS: 'Bread & Baked Goods',
  VEGETABLES_BLANCHED: 'Blanched Vegetables',
  FRUIT: 'Fruit',
  CHEESE_DISHES: 'Cheese Dishes',
};

