/**
 * Measurement Units
 * Shared unit constants for shopping lists and food items
 */

// Quantity unit options for measurement-based items
export const PANTRY_UNITS = [
  // Volume (Cups & larger)
  { value: 'c', label: 'c (cup)' },
  { value: 'pt', label: 'pt (pint)' },
  { value: 'qt', label: 'qt (quart)' },
  { value: 'gal', label: 'gal (gallon)' },
  // Weight / Mass - US / Imperial
  { value: 'oz', label: 'oz (ounce)' },
  { value: 'lb', label: 'lb (pound)' },
  // Weight / Mass - Metric
  { value: 'g', label: 'g (gram)' },
  { value: 'kg', label: 'kg (kilogram)' },
  // Volume - Metric
  { value: 'ml', label: 'ml (milliliter)' },
  { value: 'l', label: 'L (liter)' }
] as const;
