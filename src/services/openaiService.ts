/**
 * OpenAI Service
 * Handles AI-powered meal planning using OpenAI API via Netlify Function
 */

import type {
  MealSuggestion,
  MealPlanningContext,
  ReplanningContext,
  MealType
} from '../types/mealPlan';
import { logServiceError } from './baseService';

/**
 * Call OpenAI API via Netlify Function
 */
async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string = 'gpt-3.5-turbo'): Promise<any> {
  const functionUrl = '/.netlify/functions/openai-proxy';
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
        
        // Provide more specific error messages
        if (response.status === 500 && errorMessage.includes('API key not configured')) {
          errorMessage = 'OpenAI API key not configured in Netlify. Please add OPENAI_API_KEY to your Netlify environment variables.';
        } else if (response.status === 404) {
          errorMessage = 'Netlify Function not found. The OpenAI proxy function may not be deployed.';
        }
      } catch (e) {
        // If we can't parse the error, use the status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to reach the OpenAI proxy function. Please check your connection and ensure the Netlify Function is deployed.');
    }
    throw error;
  }
}

/**
 * Generate meal suggestions using AI
 */
export async function generateMealSuggestions(
  context: MealPlanningContext,
  targetMealType?: MealType
): Promise<MealSuggestion[]> {
  try {
    // Build prompt for meal planning
    // Use provided targetMealType, or extract from schedule if not provided
    const mealType = targetMealType || context.schedule[0]?.meals[0]?.type;
    const prompt = buildMealPlanningPrompt(context, mealType);

    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo';
    
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a helpful meal planning assistant. Suggest meals that use expiring ingredients and match user preferences. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], model);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return parsed.meals || [];
  } catch (error) {
    logServiceError('generateMealSuggestions', 'openai', error);
    throw error;
  }
}

/**
 * Replan meals after unplanned events
 */
export async function replanMeals(
  context: ReplanningContext
): Promise<MealSuggestion[]> {
  try {
    const prompt = buildReplanningPrompt(context);
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo';

    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a helpful meal planning assistant. Replan meals to prevent food waste after schedule changes. Prioritize items at risk of expiring. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], model);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return parsed.meals || [];
  } catch (error) {
    logServiceError('replanMeals', 'openai', error);
    throw error;
  }
}

/**
 * Build diet-specific restrictions text
 */
function buildDietRestrictions(dietApproach?: string, dietStrict?: boolean): string {
  if (!dietApproach) return '';

  const strictText = dietStrict ? 'STRICT MODE: Absolutely NO exceptions. ' : '';
  
  const restrictions: Record<string, string> = {
    'Vegan': `${strictText}VEGAN DIET: NO animal products whatsoever. This means NO meat, poultry, fish, seafood, eggs, dairy, honey, or any other animal-derived ingredients. 

CRITICAL: Hotdogs, sausages, bacon, and similar processed meats are NEVER vegan, even if labeled "vegan-style" or "plant-based style" in the meal name. Do NOT suggest meals containing hotdogs, sausages, bacon, ham, or any meat products.

Common non-vegan items to absolutely exclude: hotdogs, hot dogs, sausages, bacon, ham, cheese, milk, butter, eggs, chicken, beef, pork, fish, seafood, honey, etc. 

ONLY use plant-based ingredients: vegetables, fruits, grains, legumes, nuts, seeds, tofu, tempeh, plant-based milks, etc.`,
    'Paleo': `${strictText}PALEO DIET: No grains, legumes, dairy, refined sugar, or processed foods. Focus on meat, fish, eggs, vegetables, fruits, nuts, and seeds.`,
    'Keto': `${strictText}KETO DIET: Very low carb (typically under 20g net carbs per day), high fat, moderate protein. No grains, sugar, most fruits, starchy vegetables, or legumes.`,
    'Whole30': `${strictText}WHOLE30 DIET: No sugar, alcohol, grains, legumes, dairy, or processed foods. Only whole, unprocessed foods.`,
    'Mediterranean': `${strictText}MEDITERRANEAN DIET: Focus on vegetables, fruits, whole grains, legumes, nuts, olive oil, and fish. Limited red meat and processed foods.`,
    'DASH': `${strictText}DASH DIET: Focus on vegetables, fruits, whole grains, lean proteins, and low-fat dairy. Limit sodium, saturated fats, and sweets.`,
    'Weight Watchers': `${strictText}WEIGHT WATCHERS: Focus on balanced nutrition with portion control. Prioritize lean proteins, vegetables, fruits, and whole grains.`,
    'Flexitarian': `${strictText}FLEXITARIAN DIET: Primarily vegetarian but allows occasional meat. Focus on plant-based foods with occasional animal products.`,
    'Low-Carb': `${strictText}LOW-CARB DIET: Limit carbohydrates. Focus on proteins, healthy fats, and non-starchy vegetables. Avoid grains, sugar, and starchy foods.`,
    'Plant-Based': `${strictText}PLANT-BASED DIET: Focus on whole plant foods. May include minimal animal products but primarily plant-focused.`
  };

  return restrictions[dietApproach] || `${strictText}Follow ${dietApproach} diet guidelines.`;
}

/**
 * Filter inventory items by diet restrictions
 */
function filterInventoryByDiet(
  inventory: Array<{ id: string; name: string; expirationDate?: Date; thawDate?: Date; category?: string }>,
  dietApproach?: string,
  dietStrict?: boolean
): Array<{ id: string; name: string; expirationDate?: Date; thawDate?: Date; category?: string }> {
  if (!dietApproach) {
    return inventory;
  }

  // For Vegan diet, always filter out non-vegan items (vegan should be strict by nature)
  if (dietApproach === 'Vegan') {
    const nonVeganKeywords = [
      'hotdog', 'hot dog', 'sausage', 'bacon', 'ham', 'pork', 'beef', 'chicken', 'turkey', 'duck', 'lamb', 'veal',
      'cheese', 'milk', 'butter', 'cream', 'yogurt', 'sour cream', 'mayonnaise', 'egg', 'eggs',
      'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'seafood', 'anchovy',
      'honey', 'gelatin', 'whey', 'casein', 'lard', 'tallow'
    ];
    
    return inventory.filter(item => {
      const itemNameLower = item.name.toLowerCase();
      return !nonVeganKeywords.some(keyword => itemNameLower.includes(keyword));
    });
  }

  // For strict mode with other diets, filter out non-compliant items
  if (dietStrict) {
    // Add filtering logic for other strict diets if needed
    // For now, return all items and let AI handle it with clear instructions
    return inventory;
  }

  // For non-strict mode with other diets, return all items (AI will handle filtering)
  return inventory;
}

/**
 * Check if leftover meal is compliant with diet
 */
function isLeftoverCompliant(
  meal: { mealName: string; ingredients: string[] },
  dietApproach?: string
): boolean {
  if (!dietApproach) return true;

  // For Vegan diet, always check compliance (vegan should be strict by nature)
  if (dietApproach === 'Vegan') {
    const nonVeganKeywords = [
      'hotdog', 'hot dog', 'sausage', 'bacon', 'ham', 'pork', 'beef', 'chicken', 'turkey', 'duck', 'lamb', 'veal',
      'cheese', 'milk', 'butter', 'cream', 'yogurt', 'sour cream', 'mayonnaise', 'egg', 'eggs',
      'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'seafood', 'anchovy',
      'honey', 'gelatin', 'whey', 'casein', 'lard', 'tallow'
    ];
    
    const allText = `${meal.mealName} ${meal.ingredients.join(' ')}`.toLowerCase();
    return !nonVeganKeywords.some(keyword => allText.includes(keyword));
  }

  return true;
}

/**
 * Build meal planning prompt
 */
function buildMealPlanningPrompt(context: MealPlanningContext, targetMealType?: MealType): string {
  const scheduleList = context.schedule
    .map(day => {
      const dateStr = day.date.toLocaleDateString();
      const meals = day.meals.map(m => `${m.type} by ${m.finishBy}`).join(', ');
      return `- ${dateStr}: ${meals}`;
    })
    .join('\n');

  const targetDate = context.schedule[0]?.date;
  const targetDateStr = targetDate ? targetDate.toLocaleDateString() : 'the specified date';
  const mealTypeInstruction = targetMealType 
    ? `Generate exactly 3 meal suggestions for ${targetMealType} on ${targetDateStr}.`
    : 'Generate meal suggestions for the upcoming week.';

  const priorityInstruction = context.bestBySoonItems.length > 0
    ? 'PRIORITIZE using expiring items and leftovers to prevent waste, BUT ONLY if they comply with the diet restrictions below.'
    : 'Since there are no expiring items, base suggestions on user preferences and favorite meals.';

  // Build diet-specific restrictions
  const dietRestrictions = buildDietRestrictions(context.userPreferences.dietApproach, context.userPreferences.dietStrict);
  
  // Filter inventory to only include items that comply with diet
  const compliantInventory = filterInventoryByDiet(context.currentInventory, context.userPreferences.dietApproach, context.userPreferences.dietStrict);
  const compliantBestBySoonItems = filterInventoryByDiet(context.bestBySoonItems, context.userPreferences.dietApproach, context.userPreferences.dietStrict);

  return `${mealTypeInstruction} ${priorityInstruction}

${dietRestrictions}

Based on the following information:

EXPIRING ITEMS (use these soon to prevent waste, but ONLY if they comply with diet restrictions):
${compliantExpiringItems.length > 0 ? compliantExpiringItems.map(item => {
  const date = item.expirationDate || item.thawDate;
  const daysUntil = date ? Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 'unknown';
  return `- ${item.name} (expires in ${daysUntil} days, category: ${item.category || 'unknown'})`;
}).join('\n') : 'None (all expiring items filtered out due to diet restrictions)'}

AVAILABLE LEFTOVER MEALS:
${context.leftoverMeals
  .filter(meal => isLeftoverCompliant(meal, context.userPreferences.dietApproach))
  .map(meal => `- ${meal.mealName} (${meal.quantity}, ingredients: ${meal.ingredients.join(', ')})`)
  .join('\n') || 'None'}

USER PREFERENCES:
- Disliked foods: ${context.userPreferences.dislikedFoods.join(', ') || 'None'}
- Dietary preferences: ${context.userPreferences.foodPreferences.join(', ') || 'None'}
- Diet approach: ${context.userPreferences.dietApproach || 'None'}${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? ' (STRICT - must strictly adhere to all diet criteria, NO EXCEPTIONS)' : ''}
- Favorite meals: ${context.userPreferences.favoriteMeals.join(', ') || 'None'}
- Serving size: ${context.userPreferences.servingSize} people
- Meal duration preferences: Breakfast ${context.userPreferences.mealDurationPreferences.breakfast} min, Lunch ${context.userPreferences.mealDurationPreferences.lunch} min, Dinner ${context.userPreferences.mealDurationPreferences.dinner} min

SCHEDULE:
${scheduleList}

CURRENT INVENTORY (only items that comply with diet restrictions):
${compliantInventory.length > 0 ? compliantInventory.map(item => `- ${item.name}`).join('\n') : 'None (all items filtered out due to diet restrictions)'}

Generate meal suggestions that:
1. ${context.userPreferences.dietApproach && context.userPreferences.dietStrict 
  ? 'STRICTLY comply with diet restrictions - DO NOT use any non-compliant items from inventory'
  : 'Prioritize using expiring items and leftovers (only if compliant with diet)'}
2. Match user preferences and dietary restrictions
${context.userPreferences.dietApproach && context.userPreferences.dietStrict 
  ? `3. ABSOLUTELY NO exceptions to ${context.userPreferences.dietApproach} guidelines. Do not suggest any meals that violate the diet's core principles, even if it means not using expiring items.`
  : context.userPreferences.dietApproach 
    ? `3. Consider ${context.userPreferences.dietApproach} preferences but allow flexibility.`
    : '3. Include favorite meals when appropriate'}
${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? '4' : '4'}. ${context.userPreferences.dietApproach && !context.userPreferences.dietStrict ? 'Include favorite meals when appropriate' : `Plan for ${context.userPreferences.servingSize} servings per meal`}
${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? '5' : '5'}. ${context.userPreferences.dietApproach && !context.userPreferences.dietStrict ? `Plan for ${context.userPreferences.servingSize} servings per meal` : 'Fit the schedule (consider meal duration preferences)'}
${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? '6' : '6'}. ${context.userPreferences.dietApproach && !context.userPreferences.dietStrict ? 'Fit the schedule (consider meal duration preferences)' : 'Use items from current inventory when possible'}
${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? '7' : '7'}. ${context.userPreferences.dietApproach && !context.userPreferences.dietStrict ? 'Use items from current inventory when possible' : 'Suggest shopping list items only when necessary'}
${context.userPreferences.dietApproach && context.userPreferences.dietStrict ? '8. Suggest shopping list items only when necessary' : ''}

IMPORTANT: Generate exactly 3 meal suggestions for ${context.schedule[0]?.meals.find(m => m.type === 'breakfast' || m.type === 'lunch' || m.type === 'dinner')?.type || 'this meal type'}.

Return a JSON object with this structure:
{
  "meals": [
    {
      "mealName": "Meal name",
      "mealType": "breakfast|lunch|dinner",
      "date": "YYYY-MM-DD",
      "suggestedIngredients": ["ingredient1", "ingredient2"],
      "usesExpiringItems": ["itemId1", "itemId2"],
      "usesLeftovers": ["leftoverId1"],
      "reasoning": "Why this meal was suggested",
      "priority": "high|medium|low"
    }
  ]
}

Generate exactly 3 different meal suggestions.`;
}

/**
 * Suggest expiration date using AI
 */
export async function suggestExpirationDate(
  itemName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry',
  isLeftover: boolean = false
): Promise<{ expirationDate: string; reasoning: string }> {
  try {
    const prompt = buildExpirationDatePrompt(itemName, storageType, isLeftover);
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo';
    
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a food safety expert. Provide accurate expiration date suggestions based on USDA FoodKeeper guidelines and food safety best practices. Return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], model);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    return {
      expirationDate: parsed.expirationDate,
      reasoning: parsed.reasoning || 'Based on food safety guidelines'
    };
  } catch (error) {
    logServiceError('suggestExpirationDate', 'openai', error);
    throw error;
  }
}

/**
 * Build expiration date suggestion prompt
 */
function buildExpirationDatePrompt(
  itemName: string,
  storageType: 'refrigerator' | 'freezer' | 'pantry',
  isLeftover: boolean
): string {
  const leftoverContext = isLeftover 
    ? 'This is a leftover food item that has been cooked/prepared and stored.'
    : 'This is a fresh food item.';
  
  const storageContext = storageType === 'freezer'
    ? 'The item is stored in the freezer.'
    : storageType === 'pantry'
    ? 'The item is stored in the pantry (room temperature, dry storage).'
    : 'The item is stored in the refrigerator.';

  // Add specific guidance for pantry items (dry goods) which have much longer shelf lives
  // Based on USDA/NCHFP guidelines and comprehensive dry goods shelf life table
  const pantryGuidance = storageType === 'pantry' 
    ? `\nIMPORTANT - PANTRY/DRY GOODS SHELF LIFE (USDA/NCHFP Guidelines):
Use the following authoritative shelf life ranges for dry/canned goods:

CANNED GOODS:
- Canned vegetables: 2-5 years (safe indefinitely if can is undamaged; quality declines over time)
- Canned fruits: 1-2 years (higher acidity shortens quality window)
- Canned soups & stews: 2-5 years (broth-based last longer than dairy-based)
- Canned meat (tuna, chicken): 3-5 years (low-acid, very stable when unopened)
- Canned beans: 2-5 years (texture may soften with age)
- Canned tomatoes: 12-18 months (high acid; shorter shelf life)

DRY GRAINS & LEGUMES:
- Dry white rice: 4-5 years (longer if airtight and cool)
- Dry brown rice: 6-12 months (oils cause faster spoilage)
- Dry pasta: 1-2 years (can last longer if sealed tightly)
- Dry beans & lentils: 1-2 years (safe longer; cooking time increases)

BAKING INGREDIENTS:
- All-purpose flour: 8-12 months (refrigeration extends shelf life)
- Whole wheat flour: 6-8 months (higher oil content)
- Sugar (white, brown): Indefinite (but suggest 2-3 years for best quality; quality may harden)
- Honey: Indefinite (may crystallize; warm gently)
- Salt: Indefinite (keep dry)
- Baking powder: 6-12 months (loses effectiveness over time)
- Baking soda: 2-3 years (replace sooner for baking quality)

OILS & CONDIMENTS:
- Cooking oil (vegetable, canola): 12-18 months (heat and light accelerate rancidity)
- Olive oil: 12-18 months (store away from heat and light)
- Peanut butter: 6-12 months (natural versions spoil faster)
- Vinegar: Indefinite (flavor stable; may cloud)
- Soy sauce: 2-3 years (refrigeration extends quality)

OTHER DRY GOODS:
- Breakfast cereal: 6-12 months (stales after opening)
- Crackers: 6-9 months (moisture causes staleness)
- Dried herbs & spices (whole): 2-4 years (flavor fades, not unsafe)
- Dried herbs & spices (ground): 1-3 years (potency declines faster)
- Powdered milk: 12-18 months (keep tightly sealed)
- Instant coffee: 2-20 years (freeze-dried lasts longest)
- Tea bags: 12-36 months (flavor loss over time)

CRITICAL RULES FOR PANTRY ITEMS:
- For items like "uncooked spaghetti", "pasta", "rice", "flour" - suggest dates 1-5 YEARS in the future, NOT days or weeks
- Use the ranges above to select an appropriate date within the min-max range
- Always include the message: "Best quality by [date]; often safe beyond if stored properly"
- Reference USDA/FSIS for safety (many items safe indefinitely if stored correctly) and quality (peak freshness windows)`
    : '';

  const leftoverGuidance = isLeftover
    ? `\nIMPORTANT - LEFTOVER FOOD:
- Leftovers have SHORT shelf lives (typically 3-7 days in refrigerator)
- Cooked foods spoil much faster than fresh/uncooked items
- For leftovers, suggest dates within 3-7 days, not weeks or months`
    : '';

  return `Suggest a safe expiration date for the following food item:

Item Name: ${itemName}
${storageContext}
${leftoverContext}

Please provide:
1. A recommended expiration date (in YYYY-MM-DD format, calculated from today)
2. A brief explanation of why this date is recommended, including which authoritative source(s) influenced the recommendation

AUTHORITATIVE SOURCES TO REFERENCE:

1. **USDA/FSIS (United States Department of Agriculture/Food Safety and Inspection Service)**:
   - Shelf-stable foods (dried pasta, rice, flour): Safe to eat indefinitely if stored correctly, though typically at peak quality for about 2 years
   - Distinguishes between safety (food remains safe) and quality (peak freshness)

2. **Food Standards Agency (FSA)**:
   - "Best before" dates indicate quality/peak freshness (food may still be safe after this date)
   - "Use by" dates indicate safety (food should not be consumed after this date)
   - Dried foods like pasta are safe to eat past their best-before date if stored properly

3. **Scientific Research (Frontiers in Microbiology)**:
   - Fresh pasta: Homemade versions last 2-3 days; industrially produced fresh pasta (heat-treated and specially packaged) can last 30-90 days in refrigerator
   - Important distinction between homemade and commercially produced fresh pasta

4. **KitchenAid Guidelines**:
   - Homemade fresh pasta: 1 day in refrigerator, up to 8 months in freezer
   - Supports scientific research on homemade fresh pasta shelf life

5. **StillTasty**:
   - Detailed pantry storage timelines
   - Opened dry pasta: Use within 1 year for best quality
   - Unopened dry pasta: 2-3 years for best quality

CONSIDERATIONS:
- USDA FoodKeeper guidelines
- Food safety best practices
- Storage conditions (${storageType})
- Whether it's a leftover (shorter shelf life) or fresh/uncooked item
- Distinction between fresh vs dried products (e.g., fresh pasta vs dried pasta)
- Distinction between homemade vs commercially produced items
- Typical spoilage patterns for this type of food
${pantryGuidance}${leftoverGuidance}

CRITICAL RULES:
- Pantry items (dry goods): Suggest 1-3 YEARS in the future (e.g., uncooked pasta, rice, flour, canned goods)
  - Reference USDA/FSIS for safety (indefinite if stored correctly) and quality (peak ~2 years)
  - Reference StillTasty for opened vs unopened guidance (1 year opened, 2-3 years unopened)
- Refrigerator items (perishable): Suggest DAYS to WEEKS in the future (e.g., fresh produce, dairy, meat)
  - For fresh pasta: Reference scientific research (homemade 2-3 days vs industrial 30-90 days)
  - Reference KitchenAid for homemade fresh pasta (1 day fridge)
- Leftovers: Suggest 3-7 DAYS in the future
- Frozen items: Not applicable (this is for non-frozen items only)

IMPORTANT - SOURCE CITATION:
When providing your reasoning, cite which authoritative source(s) you used. For example:
- "Based on USDA/FSIS guidelines, dried pasta is safe indefinitely but at peak quality for ~2 years..."
- "According to StillTasty, opened dry pasta should be used within 1 year for best quality..."
- "Scientific research indicates homemade fresh pasta lasts 2-3 days, while industrial fresh pasta can last 30-90 days..."

Return a JSON object with this structure:
{
  "expirationDate": "YYYY-MM-DD",
  "reasoning": "Brief explanation citing which authoritative source(s) influenced the recommendation"
}

Today's date is ${new Date().toISOString().split('T')[0]}.`;
}

/**
 * Build replanning prompt
 */
function buildReplanningPrompt(context: ReplanningContext): string {
  const wasteRiskList = context.wasteRiskItems
    .map(item => `- ${item.name} (best by in ${item.daysUntilBestBy} days)`)
    .join('\n');

  const skippedMealsList = context.skippedMeals
    .map(meal => `- ${meal.mealName} on ${meal.date.toLocaleDateString()} (${meal.mealType})`)
    .join('\n');

  const basePrompt = buildMealPlanningPrompt(context);

  return `${basePrompt}

UNPLANNED EVENT:
- Date: ${context.unplannedEvent.date.toLocaleDateString()}
- Affected meals: ${context.unplannedEvent.mealTypes.join(', ')}
- Reason: ${context.unplannedEvent.reason}

SKIPPED MEALS (these meals were cancelled):
${skippedMealsList}

ITEMS AT RISK OF WASTE (prioritize these):
${wasteRiskList}

IMPORTANT: Generate new meal suggestions that:
1. Use items at risk of waste FIRST (highest priority)
2. Replace the skipped meals with new suggestions
3. Ensure no food goes to waste due to expiration
4. Consider leftover meals as alternatives
5. Adjust shopping list to account for items now available from skipped meals`;
}

