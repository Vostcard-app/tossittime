/**
 * OpenAI Service
 * Handles AI-powered meal planning using OpenAI API
 */

import OpenAI from 'openai';
import type {
  MealSuggestion,
  MealPlanningContext,
  ReplanningContext
} from '../types/mealPlan';

// Initialize OpenAI client
const getOpenAIClient = (): OpenAI | null => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key not found. Meal planning features will be limited.');
    return null;
  }

  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Required for client-side usage
  });
};

/**
 * Generate meal suggestions using AI
 */
export async function generateMealSuggestions(
  context: MealPlanningContext
): Promise<MealSuggestion[]> {
  const client = getOpenAIClient();
  
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    // Build prompt for meal planning
    const prompt = buildMealPlanningPrompt(context);

    const response = await client.chat.completions.create({
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful meal planning assistant. Suggest meals that use expiring ingredients and match user preferences. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
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
  const client = getOpenAIClient();
  
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const prompt = buildReplanningPrompt(context);

    const response = await client.chat.completions.create({
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful meal planning assistant. Replan meals to prevent food waste after schedule changes. Prioritize items at risk of expiring. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
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
 * Build meal planning prompt
 */
function buildMealPlanningPrompt(context: MealPlanningContext): string {
  const expiringItemsList = context.expiringItems
    .map(item => {
      const date = item.expirationDate || item.thawDate;
      const daysUntil = date ? Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 'unknown';
      return `- ${item.name} (expires in ${daysUntil} days, category: ${item.category || 'unknown'})`;
    })
    .join('\n');

  const leftoverMealsList = context.leftoverMeals
    .map(meal => `- ${meal.mealName} (${meal.quantity}, ingredients: ${meal.ingredients.join(', ')})`)
    .join('\n');

  const scheduleList = context.schedule
    .map(day => {
      const dateStr = day.date.toLocaleDateString();
      const meals = day.meals.map(m => `${m.type} by ${m.finishBy}`).join(', ');
      return `- ${dateStr}: ${meals}`;
    })
    .join('\n');

  return `Generate meal suggestions for the upcoming week based on the following information:

EXPIRING ITEMS (use these soon to prevent waste):
${expiringItemsList || 'None'}

AVAILABLE LEFTOVER MEALS:
${leftoverMealsList || 'None'}

USER PREFERENCES:
- Disliked foods: ${context.userPreferences.dislikedFoods.join(', ') || 'None'}
- Dietary preferences: ${context.userPreferences.foodPreferences.join(', ') || 'None'}
- Meal duration preferences: Breakfast ${context.userPreferences.mealDurationPreferences.breakfast} min, Lunch ${context.userPreferences.mealDurationPreferences.lunch} min, Dinner ${context.userPreferences.mealDurationPreferences.dinner} min

SCHEDULE:
${scheduleList}

CURRENT INVENTORY:
${context.currentInventory.map(item => `- ${item.name}`).join('\n') || 'None'}

Generate meal suggestions that:
1. Prioritize using expiring items and leftovers
2. Match user preferences and dietary restrictions
3. Fit the schedule (consider meal duration preferences)
4. Use items from current inventory when possible
5. Suggest shopping list items only when necessary

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
}`;
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

