/**
 * Netlify Function: AI Ingredient Parser
 * Uses OpenAI to parse ingredient strings and extract name, quantity, and unit
 */

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { ingredients, userId } = body;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Ingredients array is required' })
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    // Check if this is a premium request (enhanced parsing)
    const isPremium = body.isPremium === true;
    
    // Standard units mapping - only these units should be returned
    const standardUnits = {
      // Volume
      'cup': 'c',
      'cups': 'c',
      'c.': 'c',
      'pint': 'pt',
      'pints': 'pt',
      'pt.': 'pt',
      'quart': 'qt',
      'quarts': 'qt',
      'qt.': 'qt',
      'gallon': 'gal',
      'gallons': 'gal',
      'gal.': 'gal',
      'ounce': 'oz',
      'ounces': 'oz',
      'oz.': 'oz',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'ml.': 'ml',
      'liter': 'l',
      'liters': 'l',
      'litre': 'l',
      'litres': 'l',
      'l.': 'l',
      'L.': 'l',
      // Weight/Mass
      'pound': 'lb',
      'pounds': 'lb',
      'lbs': 'lb',
      'lb.': 'lb',
      'gram': 'g',
      'grams': 'g',
      'g.': 'g',
      'kilogram': 'kg',
      'kilograms': 'kg',
      'kg.': 'kg'
    };
    
    // Enhanced prompt for premium users
    const premiumInstructions = isPremium ? `
IMPORTANT FOR PREMIUM USERS:
1. Remove ALL cooking descriptors from ingredient names:
   - Remove: chopped, diced, minced, sliced, grated, crushed, whole, ground, dried, fresh, frozen, canned, raw, cooked, peeled, seeded, stemmed, trimmed, julienned, cubed, shredded, crumbled, mashed, pureed, whipped, beaten, softened, melted, warmed, cooled, room temperature, large, small, medium, extra large, extra small, thin, thick, fine, coarse, rough, smooth, optional, to taste, as needed, for garnish
   - Example: "3 lbs chopped fresh cilantro" → name: "cilantro" (not "chopped fresh cilantro")
2. Return clean, normalized ingredient names without descriptors.` : '';
    
    // Build prompt for ingredient parsing
    const prompt = `Parse these recipe ingredients and extract the ingredient name, quantity, and unit separately.

CRITICAL UNIT RULES:
- ONLY return standard unit abbreviations: c, pt, qt, gal, oz, lb, g, kg, ml, l (or L)
- Standard units mapping:
  * Volume: cup/cups → c, pint/pints → pt, quart/quarts → qt, gallon/gallons → gal, ounce/ounces → oz, milliliter/milliliters → ml, liter/liters/litre/litres → l (or L)
  * Weight/Mass: pound/pounds/lbs → lb, gram/grams → g, kilogram/kilograms → kg
- If the unit is NOT one of these standard measurements (e.g., "Sprig", "piece", "clove", "bunch", "head", "can", "package", "box", "bag", "bottle", "jar"), return null for unit
- DO NOT populate the unit field for non-standard measurements

Ingredients to parse:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

For each ingredient, extract:
- name: The clean ingredient name (remove cooking descriptors like "chopped", "diced", "minced", etc.)
- quantity: The numeric quantity (e.g., 2, 1.5, 0.5) or null if no quantity specified
- unit: ONLY standard unit abbreviations (c, pt, qt, gal, oz, lb, g, kg, ml, l/L) or null if not a standard measurement

${premiumInstructions}

Examples:
- "2 cups flour" → {name: "flour", quantity: 2, unit: "c"}
- "1 pint milk" → {name: "milk", quantity: 1, unit: "pt"}
- "3 lbs chopped fresh cilantro" → {name: "cilantro", quantity: 3, unit: "lb"}
- "salt, to taste" → {name: "salt", quantity: null, unit: null}
- "1/2 cup diced onions" → {name: "onions", quantity: 0.5, unit: "c"}
- "2 sprigs rosemary" → {name: "rosemary", quantity: 2, unit: null}  // Non-standard unit
- "1 can tomatoes" → {name: "tomatoes", quantity: 1, unit: null}  // Non-standard unit
- "500 g flour" → {name: "flour", quantity: 500, unit: "g"}
- "1 liter water" → {name: "water", quantity: 1, unit: "l"}

Return a JSON object with this structure:
{
  "parsedIngredients": [
    {
      "name": "ingredient name",
      "quantity": 2.0,
      "unit": "c"
    }
  ]
}

Return only valid JSON.`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that parses recipe ingredients. Extract ingredient names, quantities, and units. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: errorText || `OpenAI API error: ${response.status}` 
        })
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Normalize units to standard abbreviations and filter out non-standard units
    const standardUnits = {
      'cup': 'c', 'cups': 'c', 'c.': 'c',
      'pint': 'pt', 'pints': 'pt', 'pt.': 'pt',
      'quart': 'qt', 'quarts': 'qt', 'qt.': 'qt',
      'gallon': 'gal', 'gallons': 'gal', 'gal.': 'gal',
      'ounce': 'oz', 'ounces': 'oz', 'oz.': 'oz',
      'milliliter': 'ml', 'milliliters': 'ml', 'ml.': 'ml',
      'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l', 'l.': 'l', 'L.': 'l', 'L': 'l',
      'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb', 'lb.': 'lb',
      'gram': 'g', 'grams': 'g', 'g.': 'g',
      'kilogram': 'kg', 'kilograms': 'kg', 'kg.': 'kg'
    };
    
    const normalizedIngredients = (parsed.parsedIngredients || []).map(ing => {
      let normalizedUnit = null;
      
      if (ing.unit) {
        const unitLower = ing.unit.toLowerCase().trim();
        // Check if it's already a standard abbreviation
        if (['c', 'pt', 'qt', 'gal', 'oz', 'lb', 'g', 'kg', 'ml', 'l'].includes(unitLower)) {
          normalizedUnit = unitLower === 'l' ? 'l' : unitLower;
        } else if (standardUnits[unitLower]) {
          // Map full name to abbreviation
          normalizedUnit = standardUnits[unitLower];
        }
        // If not in standard units, leave as null (non-standard measurement)
      }
      
      return {
        ...ing,
        unit: normalizedUnit
      };
    });
    
    // Extract token usage from OpenAI response
    const usage = data.usage || null;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        parsedIngredients: normalizedIngredients,
        usage: usage ? {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        } : null,
        userId: userId || null,
        feature: 'ingredient_parsing',
        model: 'gpt-3.5-turbo'
      })
    };
  } catch (error) {
    console.error('Error in AI ingredient parser:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error' 
      })
    };
  }
};
