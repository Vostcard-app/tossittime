/**
 * Netlify Function: AI Label Scanner
 * Uses OpenAI Vision API to extract item name, quantity, and expiration date from food label images
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
    const { imageBase64, userId, dateFormat = 'MM/DD/YYYY', weightUnit = 'pounds' } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Image base64 string is required' })
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

    // Prepare image data URL (remove data:image/...;base64, prefix if present)
    const imageData = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    // Build date format instruction based on user preference
    let dateFormatInstruction = '';
    if (dateFormat === 'MM/DD/YYYY') {
      dateFormatInstruction = 'assume MM/DD/YYYY format (US format: month/day/year)';
    } else if (dateFormat === 'DD/MM/YYYY') {
      dateFormatInstruction = 'assume DD/MM/YYYY format (EU/UK format: day/month/year)';
    } else {
      dateFormatInstruction = 'assume YYYY-MM-DD format (ISO format: year-month-day)';
    }

    // Build weight unit context
    const weightUnitContext = weightUnit === 'pounds' 
      ? 'When extracting weight/quantity, the user prefers pounds (lb). Consider this when interpreting weight values.'
      : 'When extracting weight/quantity, the user prefers kilograms (kg). Consider this when interpreting weight values.';

    const prompt = `Analyze this food product label image and extract the following information:

1. Item Name: The product name or main food item name (e.g., "Milk", "Chicken Breast", "Organic Tomatoes")
2. Quantity: The quantity/amount if visible on the label (e.g., 1, 2, 12 oz, 1 lb). Return as a number only (e.g., 1, 2, 12). If no quantity is visible, return null.
3. Expiration Date: Look for "Best By", "Use By", "Sell By", or "Expires" dates. Extract the date in YYYY-MM-DD format. If no expiration date is found, return null.

Important:
- Extract the actual product name, not generic descriptions
- For quantity, extract only the numeric value (ignore units like oz, lb, etc. in the quantity field)
- ${weightUnitContext}
- For expiration date, convert to YYYY-MM-DD format. If the date format is ambiguous (e.g., 01/02/2026), ${dateFormatInstruction}.
- If any information is not clearly visible or cannot be determined, return null for that field.

Return a JSON object with this exact structure:
{
  "itemName": "Product Name",
  "quantity": 1,
  "expirationDate": "2026-02-15"
}

Return only valid JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that extracts information from food product labels. Return only valid JSON with itemName, quantity, and expirationDate fields.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`
                }
              }
            ]
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
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No response from OpenAI' })
      };
    }

    const parsed = JSON.parse(content);
    
    // Validate and clean the response
    const result = {
      itemName: parsed.itemName || 'Unknown Item',
      quantity: parsed.quantity !== null && parsed.quantity !== undefined ? Number(parsed.quantity) : null,
      expirationDate: parsed.expirationDate || null
    };

    // Validate expiration date format if provided
    if (result.expirationDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(result.expirationDate)) {
        console.warn(`Invalid date format returned: ${result.expirationDate}, setting to null`);
        result.expirationDate = null;
      }
    }

    // Extract token usage from OpenAI response
    const usage = data.usage || null;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...result,
        usage: usage ? {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        } : null,
        userId: userId || null,
        feature: 'label_scanning',
        model: 'gpt-4o-mini'
      })
    };
  } catch (error) {
    console.error('Error in AI label scanner:', error);
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
