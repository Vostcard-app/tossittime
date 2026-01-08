/**
 * Netlify Function: Recipe Import
 * Extracts recipe ingredients from recipe URLs
 * Supports JSON-LD schema.org Recipe and microdata fallback
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

    // Extract domain
    const sourceDomain = recipeUrl.hostname.replace(/^www\./, '');

    // Try to extract recipe data
    let recipeData = null;

    // Method 1: JSON-LD schema.org Recipe
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonContent = match.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i, '').replace(/<\/script>/i, '').trim();
          const data = JSON.parse(jsonContent);
          
          // Handle both single objects and arrays
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
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next match
          continue;
        }
        if (recipeData) break;
      }
    }

    // Method 2: Microdata fallback (itemprop="recipeIngredient")
    if (!recipeData) {
      const ingredientMatches = html.match(/<[^>]*itemprop=["']recipeIngredient["'][^>]*>(.*?)<\/[^>]*>/gi);
      if (ingredientMatches && ingredientMatches.length > 0) {
        const ingredients = ingredientMatches.map(match => {
          // Extract text content, removing HTML tags
          return match.replace(/<[^>]*>/g, '').trim();
        }).filter(ing => ing.length > 0);

        if (ingredients.length > 0) {
          // Try to extract title from microdata or meta tags
          let title = 'Untitled Recipe';
          const titleMatch = html.match(/<[^>]*itemprop=["']name["'][^>]*>(.*?)<\/[^>]*>/i) ||
                            html.match(/<title[^>]*>(.*?)<\/title>/i) ||
                            html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
          if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
          }

          // Try to extract image from og:image
          let imageUrl;
          const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
          if (imageMatch) {
            imageUrl = imageMatch[1];
          }

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

    // Method 3: Fallback - Parse ingredients from HTML patterns
    if (!recipeData) {
      // Look for common ingredient list patterns
      // Pattern 1: List items after "Ingredients" heading (more flexible matching)
      const ingredientsSectionMatch = html.match(/(?:<h[2-6][^>]*>.*?[Ii]ngredients?.*?<\/h[2-6]>|<h[2-6][^>]*>.*?[Ii]ngredients?.*?<\/h[2-6]>|<strong[^>]*>.*?[Ii]ngredients?.*?<\/strong>|<b[^>]*>.*?[Ii]ngredients?.*?<\/b>)(.*?)(?=<h[2-6]|<h3|<h4|<div[^>]*class[^>]*instructions|<div[^>]*class[^>]*directions|<section[^>]*class|<div[^>]*id[^>]*recipe|$)/is);
      
      if (ingredientsSectionMatch) {
        const ingredientsSection = ingredientsSectionMatch[1];
        // Extract list items (both <li> and <p> tags that look like ingredients)
        const listItemMatches = ingredientsSection.match(/<li[^>]*>(.*?)<\/li>/gis) ||
                                ingredientsSection.match(/<p[^>]*>(.*?)<\/p>/gis);
        
        if (listItemMatches && listItemMatches.length > 0) {
          const ingredients = listItemMatches.map(match => {
            // Remove HTML tags and clean up
            let text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            // Remove common prefixes like bullet points, numbers, etc. but keep the ingredient text
            // Don't remove numbers at the start as they might be quantities
            text = text.replace(/^[\s•\-\*\.]+/, '').trim();
            return text;
          }).filter(ing => {
            // Filter out empty, too long, or non-ingredient items
            const lower = ing.toLowerCase();
            return ing.length > 0 && 
                   ing.length < 200 && 
                   !lower.includes('instructions') &&
                   !lower.includes('directions') &&
                   !lower.includes('method') &&
                   !lower.includes('prep time') &&
                   !lower.includes('cook time') &&
                   !lower.includes('servings') &&
                   !lower.includes('course') &&
                   !lower.includes('cuisine');
          });

          if (ingredients.length > 0) {
            // Try to extract title
            let title = 'Untitled Recipe';
            const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i) ||
                              html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<h1[^>]*>(.*?)<\/h1>/i);
            if (titleMatch) {
              title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
            }

            // Try to extract image
            let imageUrl;
            const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<img[^>]*class[^>]*recipe[^>]*src=["']([^"']+)["']/i);
            if (imageMatch) {
              imageUrl = imageMatch[1];
            }

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

      // Pattern 2: Look for ingredients in common recipe card/list structures
      if (!recipeData) {
        // Try to find ingredients in divs with common class names or IDs
        const recipeCardMatch = html.match(/<div[^>]*(?:class|id)[^>]*recipe[^>]*ingredients?[^>]*>(.*?)<\/div>/is) ||
                               html.match(/<section[^>]*(?:class|id)[^>]*ingredients?[^>]*>(.*?)<\/section>/is) ||
                               html.match(/<ul[^>]*(?:class|id)[^>]*ingredients?[^>]*>(.*?)<\/ul>/is) ||
                               html.match(/<ol[^>]*(?:class|id)[^>]*ingredients?[^>]*>(.*?)<\/ol>/is);
        
        if (recipeCardMatch) {
          const cardContent = recipeCardMatch[1];
          const listItemMatches = cardContent.match(/<li[^>]*>(.*?)<\/li>/gis) ||
                                 cardContent.match(/<p[^>]*>(.*?)<\/p>/gis);
          
          if (listItemMatches && listItemMatches.length > 0) {
            const ingredients = listItemMatches.map(match => {
              let text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              // Keep numbers at start (quantities) but remove bullet points
              text = text.replace(/^[\s•\-\*\.]+/, '').trim();
              return text;
            }).filter(ing => {
              const lower = ing.toLowerCase();
              // Filter out common non-ingredient text
              return ing.length > 0 && 
                     ing.length < 200 && 
                     !lower.includes('instructions') &&
                     !lower.includes('directions') &&
                     !lower.includes('method') &&
                     !lower.includes('prep time') &&
                     !lower.includes('cook time') &&
                     !lower.includes('servings') &&
                     !lower.includes('course') &&
                     !lower.includes('cuisine');
            });

            if (ingredients.length > 0) {
              let title = 'Untitled Recipe';
              const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i) ||
                                html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<h1[^>]*>(.*?)<\/h1>/i);
              if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
              }

              let imageUrl;
              const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
              if (imageMatch) {
                imageUrl = imageMatch[1];
              }

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
      }

      // Pattern 3: Look for ingredients list with "US Customary" or similar labels (billyparisi.com pattern)
      if (!recipeData) {
        // Look for patterns like "US Customary" followed by list items
        const usCustomaryMatch = html.match(/US\s+Customary[^<]*(?:<[^>]*>)*\s*(?:<ul[^>]*>|<ol[^>]*>)?(.*?)(?=<h|<div[^>]*class[^>]*instructions|<\/div>|$)/is);
        
        if (usCustomaryMatch) {
          const listContent = usCustomaryMatch[1];
          const listItemMatches = listContent.match(/<li[^>]*>(.*?)<\/li>/gis);
          
          if (listItemMatches && listItemMatches.length > 0) {
            const ingredients = listItemMatches.map(match => {
              let text = match.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              // Keep numbers at start (quantities)
              text = text.replace(/^[\s•\-\*\.]+/, '').trim();
              return text;
            }).filter(ing => {
              const lower = ing.toLowerCase();
              return ing.length > 0 && 
                     ing.length < 200 && 
                     !lower.includes('instructions') &&
                     !lower.includes('directions') &&
                     !lower.includes('method') &&
                     !lower.includes('prep time') &&
                     !lower.includes('cook time') &&
                     !lower.includes('servings') &&
                     !lower.includes('course') &&
                     !lower.includes('cuisine') &&
                     !lower.includes('metric') &&
                     !lower.includes('customary');
            });

            if (ingredients.length > 0) {
              let title = 'Untitled Recipe';
              const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i) ||
                                html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<h1[^>]*>(.*?)<\/h1>/i);
              if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
              }

              let imageUrl;
              const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
              if (imageMatch) {
                imageUrl = imageMatch[1];
              }

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
      }
    }

    // If no structured data found, return 422
    if (!recipeData || recipeData.ingredients.length === 0) {
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

