/**
 * Netlify Function: EatByDate Scraper
 * Scrapes shelf life information from eatbydate.com
 */

const https = require('https');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get food name from query parameters
  const { foodName, storageType = 'refrigerator' } = event.queryStringParameters || {};

  if (!foodName) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'foodName parameter is required' })
    };
  }

  try {
    // Normalize food name for URL
    const normalizedName = foodName.toLowerCase().trim().replace(/\s+/g, '-');
    
    // EatByDate URL structure: https://www.eatbydate.com/{category}/{food-name}/
    // We'll try to construct a URL and scrape the page
    const url = `https://www.eatbydate.com/${normalizedName}/`;
    
    const shelfLifeData = await scrapeEatByDate(url, foodName, storageType);
    
    if (shelfLifeData) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
        },
        body: JSON.stringify(shelfLifeData)
      };
    } else {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Shelf life data not found for this item' })
      };
    }
  } catch (error) {
    console.error('Error scraping EatByDate:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to scrape EatByDate',
        message: error.message 
      })
    };
  }
};

/**
 * Scrape EatByDate.com for shelf life information
 */
async function scrapeEatByDate(url, foodName, storageType) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          // Parse HTML to extract shelf life information
          // EatByDate typically has structured data in the page
          const shelfLifeInfo = parseEatByDateHTML(data, foodName, storageType);
          resolve(shelfLifeInfo);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Parse HTML from EatByDate to extract shelf life information
 * Uses Cheerio for reliable HTML parsing
 */
function parseEatByDateHTML(html, foodName, storageType) {
  const $ = cheerio.load(html);
  
  // Storage type mapping for EatByDate
  const storageKeywords = {
    refrigerator: ['refrigerator', 'refrigerated', 'fridge', 'cold storage'],
    freezer: ['freezer', 'frozen', 'freeze'],
    pantry: ['pantry', 'room temperature', 'shelf', 'cupboard', 'cabinet']
  };

  const keywords = storageKeywords[storageType] || [];
  let result = null;
  
  // Strategy 1: Look for structured data in tables or lists
  $('table, ul, ol, dl').each((i, elem) => {
    if (result) return; // Already found a result
    
    const text = $(elem).text().toLowerCase();
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // Look for numbers followed by "day" or "days"
        const match = text.match(new RegExp(`${keyword}[^\\d]*(\\d+)\\s*(?:days?|day)`, 'i'));
        if (match && match[1]) {
          const days = parseInt(match[1], 10);
          if (days > 0 && days < 10000) { // Sanity check
            result = {
              foodName,
              storageType,
              days,
              source: 'eatbydate'
            };
            return false; // Break out of each loop
          }
        }
      }
    }
  });

  if (result) return result;

  // Strategy 2: Look for common patterns in paragraphs and divs
  $('p, div, article, section').each((i, elem) => {
    if (result) return false; // Already found a result
    
    const text = $(elem).text().toLowerCase();
    for (const keyword of keywords) {
      // Pattern: "refrigerator: X days" or "refrigerator X days"
      const patterns = [
        new RegExp(`${keyword}[:\\s]+(\\d+)\\s*(?:days?|day)`, 'i'),
        new RegExp(`(\\d+)\\s*(?:days?|day)[^.]*${keyword}`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const days = parseInt(match[1], 10);
          if (days > 0 && days < 10000) { // Sanity check
            result = {
              foodName,
              storageType,
              days,
              source: 'eatbydate'
            };
            return false; // Break out of each loop
          }
        }
      }
    }
  });

  if (result) return result;

  // Strategy 3: Look for "How long does X last?" sections
  const pageText = $('body').text().toLowerCase();
  for (const keyword of keywords) {
    const pattern = new RegExp(`${keyword}[^\\d]*(\\d+)\\s*(?:days?|day)`, 'i');
    const match = pageText.match(pattern);
    if (match && match[1]) {
      const days = parseInt(match[1], 10);
      if (days > 0 && days < 10000) { // Sanity check
        return {
          foodName,
          storageType,
          days,
          source: 'eatbydate'
        };
      }
    }
  }

  return null;
}
