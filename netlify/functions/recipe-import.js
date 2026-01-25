/**
 * Netlify Function: Recipe Import
 * Extracts recipe ingredients from recipe URLs
 * Uses Cheerio for reliable HTML parsing and multiple fallback strategies
 */

const cheerio = require('cheerio');

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
    const { url, userId, isPremium } = body;

    if (!url || typeof url !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'URL is required' })
      };
    }

    // Validate URL
    let recipeUrl;
    try {
      recipeUrl = new URL(url);
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid URL format' })
      };
    }

    // Fetch the recipe page
    const response = await fetch(recipeUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TossItTime Recipe Importer/1.0)'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: `Failed to fetch recipe: ${response.statusText}` })
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract domain
    const sourceDomain = recipeUrl.hostname.replace(/^www\./, '');

    // Try to extract recipe data
    let recipeData = null;

    // Method 1: JSON-LD schema.org Recipe
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((i, elem) => {
      if (recipeData) return false; // Break loop if we found data
      
      try {
        const jsonContent = $(elem).html();
        if (!jsonContent) return;
        
        const data = JSON.parse(jsonContent);
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            const ingredients = item.recipeIngredient || [];
            if (ingredients.length > 0) {
              recipeData = {
                title: item.name || item.headline || 'Untitled Recipe',
                ingredients: Array.isArray(ingredients) ? ingredients.map(ing => 
                  typeof ing === 'string' ? ing : (ing.text || ing.name || String(ing))
                ) : [],
                imageUrl: item.image ? (
                  typeof item.image === 'string' ? item.image : 
                  (Array.isArray(item.image) ? item.image[0] : item.image.url)
                ) : undefined,
                sourceUrl: url,
                sourceDomain
              };
              return false; // Break loop
            }
          }
        }
      } catch (e) {
        // Continue to next script
      }
    });

    // Method 2: Microdata fallback (itemprop="recipeIngredient")
    if (!recipeData) {
      const ingredientElements = $('[itemprop="recipeIngredient"]');
      if (ingredientElements.length > 0) {
        const ingredients = [];
        ingredientElements.each((i, elem) => {
          const text = $(elem).text().trim();
          if (text) ingredients.push(text);
        });

        if (ingredients.length > 0) {
          // Try to extract title from microdata or meta tags
          let title = 'Untitled Recipe';
          const nameElement = $('[itemprop="name"]').first();
          if (nameElement.length) {
            title = nameElement.text().trim();
          } else {
            const titleTag = $('title').first().text() || 
                           $('meta[property="og:title"]').attr('content') ||
                           $('h1').first().text();
            if (titleTag) title = titleTag.trim();
          }

          // Try to extract image from og:image
          const imageUrl = $('meta[property="og:image"]').attr('content');

          recipeData = {
            title,
            ingredients,
            imageUrl,
            sourceUrl: url,
            sourceDomain
          };
        }
      }
    }

    // Method 3: Site-specific parsers
    if (!recipeData) {
      recipeData = parseSiteSpecific($, sourceDomain, url, html);
    }

    // Method 4: Generic HTML parsing with Cheerio (comprehensive fallback)
    if (!recipeData) {
      recipeData = parseGenericRecipe($, url, sourceDomain);
    }

    // If no structured data found, try AI extraction as fallback
    if (!recipeData || !recipeData.ingredients || recipeData.ingredients.length === 0) {
      // Try AI extraction as fallback
      try {
        if (process.env.OPENAI_API_KEY) {
          console.log('Scraping failed, trying AI extraction as fallback');
          const aiRecipeData = await extractRecipeWithAI(url, html);
          if (aiRecipeData && aiRecipeData.ingredients && aiRecipeData.ingredients.length > 0) {
            recipeData = aiRecipeData;
          }
        }
      } catch (aiError) {
        console.error('AI extraction fallback failed:', aiError);
      }
    }

    // If still no data, return 422 with helpful error
    if (!recipeData || !recipeData.ingredients || recipeData.ingredients.length === 0) {
      // Log for debugging (visible in Netlify function logs)
      console.error('Recipe import failed:', {
        url,
        hasRecipeData: !!recipeData,
        ingredientCount: recipeData?.ingredients?.length || 0,
        sourceDomain
      });
      
      return {
        statusCode: 422,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'No structured recipe data found. This recipe may not be in a supported format (JSON-LD or microdata).' 
        })
      };
    }

    // If we have ingredients, use AI parser for premium users, or if ingredients need parsing
    if (recipeData.ingredients && recipeData.ingredients.length > 0) {
      try {
        // For premium users, always use AI parsing
        // For non-premium users, only parse if ingredients need it
        const shouldUseAI = isPremium === true || (() => {
          const needsParsing = recipeData.ingredients.some(ing => {
            const ingStr = typeof ing === 'string' ? ing : String(ing);
            // Check if ingredient has a clear quantity pattern
            const hasQuantity = /^[\d\s½¼¾⅓⅔⅛⅜⅝⅞]+/.test(ingStr.trim());
            return !hasQuantity || ingStr.length > 100; // Also parse if very long (might be description)
          });
          return needsParsing;
        })();

        if (shouldUseAI && process.env.OPENAI_API_KEY) {
          console.log(isPremium ? 'Premium user: Parsing all ingredients with AI' : 'Parsing ingredient quantities with AI');
          const parsedResult = await parseIngredientQuantities(recipeData.ingredients, isPremium, userId);
          if (parsedResult && parsedResult.parsedIngredients && parsedResult.parsedIngredients.length > 0) {
            // Replace ingredients with parsed versions
            recipeData.ingredients = parsedResult.parsedIngredients.map(parsed => {
              // Reconstruct ingredient string with structured data
              let ingredientStr = '';
              if (parsed.quantity !== null && parsed.quantity !== undefined) {
                ingredientStr += parsed.quantity;
                if (parsed.unit) {
                  ingredientStr += ` ${parsed.unit}`;
                }
                ingredientStr += ' ';
              }
              ingredientStr += parsed.name;
              return ingredientStr;
            });
            // Also store structured data for easier access
            recipeData.parsedIngredients = parsedResult.parsedIngredients;
            // Include usage data if available
            if (parsedResult.usage) {
              recipeData.usage = parsedResult.usage;
            }
            console.log('AI parsing successful:', {
              ingredientsCount: recipeData.ingredients.length,
              parsedIngredientsCount: recipeData.parsedIngredients.length,
              sampleParsed: recipeData.parsedIngredients[0]
            });
          }
        }
      } catch (parseError) {
        console.error('AI ingredient parsing failed, using original ingredients:', parseError);
        // Continue with original ingredients if parsing fails
      }
    }

    // Ensure parsedIngredients is always an array (even if empty)
    if (!recipeData.parsedIngredients) {
      recipeData.parsedIngredients = [];
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(recipeData)
    };
  } catch (error) {
    console.error('Error in recipe import:', error);
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

/**
 * Site-specific parsers for known recipe sites
 */
function parseSiteSpecific($, domain, url, html) {
  // billyparisi.com - Look for "US Customary" section
  if (domain.includes('billyparisi.com')) {
    // Find the "US Customary" text and get the following list
    const htmlText = $.html();
    const usCustomaryIndex = htmlText.indexOf('US Customary');
    if (usCustomaryIndex !== -1) {
      const afterUsCustomary = htmlText.substring(usCustomaryIndex);
      const $section = cheerio.load(afterUsCustomary);
      
      // Find the first ul or ol after "US Customary"
      const list = $section('ul, ol').first();
      if (list.length) {
        const ingredients = [];
        list.find('li').each((i, elem) => {
          let text = $section(elem).text().trim();
          // Clean up the text
          text = text.replace(/\s+/g, ' ').trim();
          if (text && text.length > 0 && text.length < 200) {
            // Filter out descriptions (contain "–" or "—" followed by long text)
            const hasDescriptionPattern = /[-–—]\s*[A-Z][^-–—]{20,}/.test(text);
            if (!hasDescriptionPattern) {
              ingredients.push(text);
            }
          }
        });
        
        if (ingredients.length > 0) {
          const title = $('title').text() || 
                       $('meta[property="og:title"]').attr('content') ||
                       $('h1').first().text() || 
                       'Untitled Recipe';
          const imageUrl = $('meta[property="og:image"]').attr('content');
          
          return {
            title: title.trim(),
            ingredients,
            imageUrl,
            sourceUrl: url,
            sourceDomain: domain
          };
        }
      }
    }
  }

  // Add more site-specific parsers here as needed
  // Example: allrecipes.com, foodnetwork.com, etc.

  return null;
}

/**
 * Generic recipe parsing using multiple strategies
 */
function parseGenericRecipe($, url, sourceDomain) {
  const ingredients = [];
  let foundIngredients = false;

  // Strategy 1: Common CSS class names for ingredients
  const commonSelectors = [
    '.ingredients li',
    '.recipe-ingredients li',
    '.ingredient-list li',
    '.ingredients-list li',
    '[class*="ingredient"] li',
    '[class*="ingredients"] li',
    '.wprm-recipe-ingredient',
    '.tasty-recipes-ingredients li',
    '.recipe-ingredients__list li',
    '.o-Ingredients__a-ListItem',
    '[itemprop="ingredients"] li',
    '[data-ingredient]'
  ];

  for (const selector of commonSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      elements.each((i, elem) => {
        let text = $(elem).text().trim();
        text = text.replace(/\s+/g, ' ').trim();
        if (isValidIngredient(text)) {
          ingredients.push(text);
          foundIngredients = true;
        }
      });
      if (foundIngredients) break;
    }
  }

  // Strategy 2: Look for "Ingredients" heading followed by a list
  if (!foundIngredients) {
    $('h1, h2, h3, h4, h5, h6').each((i, heading) => {
      if (foundIngredients) return false;
      
      const headingText = $(heading).text().toLowerCase();
      if (headingText.includes('ingredients') && !headingText.includes('substitutions')) {
        // Find the next list after this heading
        let next = $(heading).next();
        let found = false;
        
        // Look for list in next siblings
        for (let i = 0; i < 10 && next.length && !found; i++) {
          const list = next.find('ul, ol').first();
          if (list.length === 0 && (next.is('ul') || next.is('ol'))) {
            list = next;
          }
          
          if (list.length) {
            list.find('li').each((j, li) => {
              let text = $(li).text().trim();
              text = text.replace(/\s+/g, ' ').trim();
              if (isValidIngredient(text)) {
                ingredients.push(text);
                foundIngredients = true;
                found = true;
              }
            });
            if (found) break;
          }
          next = next.next();
        }
        
        if (found) return false; // Break outer loop
      }
    });
  }

  // Strategy 3: Look for lists that contain ingredient-like text
  if (!foundIngredients) {
    $('ul, ol').each((i, list) => {
      if (foundIngredients) return false;
      
      const listItems = $(list).find('li');
      if (listItems.length >= 3 && listItems.length <= 30) {
        // Check if items look like ingredients
        const candidateIngredients = [];
        listItems.each((j, li) => {
          let text = $(li).text().trim();
          text = text.replace(/\s+/g, ' ').trim();
          if (isValidIngredient(text)) {
            candidateIngredients.push(text);
          }
        });
        
        // If most items look like ingredients, use this list
        if (candidateIngredients.length >= 3 && 
            candidateIngredients.length >= listItems.length * 0.6) {
          ingredients.push(...candidateIngredients);
          foundIngredients = true;
          return false; // Break loop
        }
      }
    });
  }

  if (ingredients.length > 0) {
    const title = $('title').text() || 
                 $('meta[property="og:title"]').attr('content') ||
                 $('h1').first().text() || 
                 'Untitled Recipe';
    const imageUrl = $('meta[property="og:image"]').attr('content');

    return {
      title: title.trim(),
      ingredients,
      imageUrl,
      sourceUrl: url,
      sourceDomain
    };
  }

  return null;
}

/**
 * Validate if text looks like an ingredient
 */
function isValidIngredient(text) {
  if (!text || text.length === 0 || text.length > 200) return false;
  
  const lower = text.toLowerCase();
  
  // Skip obvious non-ingredient text
  if (lower.includes('instructions') ||
      lower.includes('directions') ||
      lower.includes('method') ||
      lower.includes('prep time') ||
      lower.includes('cook time') ||
      lower.includes('servings') ||
      lower.includes('course') ||
      lower.includes('cuisine') ||
      lower.includes('metric') ||
      lower.includes('customary') ||
      lower.includes('nutrition')) {
    return false;
  }
  
  // Filter out descriptions (contain "–" or "—" followed by long explanatory text)
  const hasDescriptionPattern = /[-–—]\s*[A-Z][^-–—]{20,}/.test(text);
  if (hasDescriptionPattern) return false;
  
  // Prefer items that start with a number/measurement, but don't require it
  const startsWithMeasurement = /^[\d\s½¼¾⅓⅔⅛⅜⅝⅞]+/.test(text) || /^[\d]+/.test(text);
  
  // If it doesn't start with a measurement, check if it's still a valid ingredient
  if (!startsWithMeasurement) {
    // Allow short ingredient names (like "salt", "pepper") but filter out very short or very long items
    if (text.length < 3 || text.length > 150) return false;
    // Filter out items that look like headings or labels
    if (/^[A-Z][A-Z\s]{10,}$/.test(text)) return false; // All caps headings
  }
  
  return true;
}

/**
 * Extract recipe using AI as fallback
 */
async function extractRecipeWithAI(url, html) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    // Extract text content from HTML (simplified)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Limit to avoid token limits

    const prompt = `Extract recipe information from this webpage content. Focus on finding the recipe title and ingredients list.

URL: ${url}
Content: ${textContent}

Extract:
1. Recipe title/name
2. List of ingredients with quantities

Return a JSON object with this structure:
{
  "title": "Recipe name",
  "ingredients": ["2 cups flour", "1 tbsp salt", ...]
}

Return only valid JSON.`;

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
            content: 'You are a helpful assistant that extracts recipe information from web content. Return only valid JSON.'
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
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);
    const sourceDomain = new URL(url).hostname.replace(/^www\./, '');

    return {
      title: parsed.title || 'Untitled Recipe',
      ingredients: parsed.ingredients || [],
      sourceUrl: url,
      sourceDomain
    };
  } catch (error) {
    console.error('AI recipe extraction error:', error);
    return null;
  }
}

/**
 * Parse ingredient quantities using AI
 * @param ingredients - Array of ingredient strings
 * @param isPremium - Whether user is premium (enhanced parsing)
 */
async function parseIngredientQuantities(ingredients, isPremium = false, userId = null) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const ingredientStrings = ingredients.map(ing => typeof ing === 'string' ? ing : String(ing));
    
    // Enhanced prompt for premium users
    const premiumInstructions = isPremium ? `
IMPORTANT FOR PREMIUM USERS:
1. Remove ALL cooking descriptors from ingredient names:
   - Remove: chopped, diced, minced, sliced, grated, crushed, whole, ground, dried, fresh, frozen, canned, raw, cooked, peeled, seeded, stemmed, trimmed, julienned, cubed, shredded, crumbled, mashed, pureed, whipped, beaten, softened, melted, warmed, cooled, room temperature, large, small, medium, extra large, extra small, thin, thick, fine, coarse, rough, smooth, optional, to taste, as needed, for garnish
   - Example: "3 lbs chopped fresh cilantro" → name: "cilantro" (not "chopped fresh cilantro")
2. Return clean, normalized ingredient names without descriptors.` : '';
    
    const prompt = `Parse these recipe ingredients and extract the ingredient name, quantity, and unit separately.

CRITICAL UNIT RULES:
- ONLY return standard unit abbreviations: c, pt, qt, gal, oz, lb, g, kg, ml, l (or L)
- Standard units mapping:
  * Volume: cup/cups → c, pint/pints → pt, quart/quarts → qt, gallon/gallons → gal, ounce/ounces → oz, milliliter/milliliters → ml, liter/liters/litre/litres → l (or L)
  * Weight/Mass: pound/pounds/lbs → lb, gram/grams → g, kilogram/kilograms → kg
- If the unit is NOT one of these standard measurements (e.g., "Sprig", "piece", "clove", "bunch", "head", "can", "package", "box", "bag", "bottle", "jar"), return null for unit
- DO NOT populate the unit field for non-standard measurements

Ingredients to parse:
${ingredientStrings.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

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
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return null;
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
    
    if (parsed.parsedIngredients && Array.isArray(parsed.parsedIngredients)) {
      parsed.parsedIngredients = parsed.parsedIngredients.map(ing => {
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
    }
    
    // Include usage data if available
    if (data.usage) {
      parsed.usage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
        userId: userId,
        feature: 'ingredient_parsing',
        model: 'gpt-3.5-turbo'
      };
    }
    
    return parsed;
  } catch (error) {
    console.error('AI ingredient parser error:', error);
    return null;
  }
}
