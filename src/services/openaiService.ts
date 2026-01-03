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
    console.error('Error generating meal suggestions:', error);
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
    console.error('Error replanning meals:', error);
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

  const priorityInstruction = context.expiringItems.length > 0
    ? 'PRIORITIZE using expiring items and leftovers to prevent waste, BUT ONLY if they comply with the diet restrictions below.'
    : 'Since there are no expiring items, base suggestions on user preferences and favorite meals.';

  // Build diet-specific restrictions
  const dietRestrictions = buildDietRestrictions(context.userPreferences.dietApproach, context.userPreferences.dietStrict);
  
  // Filter inventory to only include items that comply with diet
  const compliantInventory = filterInventoryByDiet(context.currentInventory, context.userPreferences.dietApproach, context.userPreferences.dietStrict);
  const compliantExpiringItems = filterInventoryByDiet(context.expiringItems, context.userPreferences.dietApproach, context.userPreferences.dietStrict);

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
 * Build replanning prompt
 */
function buildReplanningPrompt(context: ReplanningContext): string {
  const wasteRiskList = context.wasteRiskItems
    .map(item => `- ${item.name} (expires in ${item.daysUntilExpiration} days)`)
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

