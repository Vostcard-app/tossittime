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
    const { url } = body;

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

    // If no structured data found, return 422 with helpful error
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
