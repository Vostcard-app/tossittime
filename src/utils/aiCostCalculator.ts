/**
 * AI Cost Calculator
 * Calculates the cost of AI usage based on OpenAI pricing
 */

/**
 * OpenAI pricing per million tokens (as of 2025)
 */
const PRICING = {
  'gpt-3.5-turbo': {
    input: 0.50,   // $0.50 per million input tokens
    output: 1.50   // $1.50 per million output tokens
  },
  'gpt-4o-mini': {
    input: 0.40,   // $0.40 per million input tokens
    output: 1.60   // $1.60 per million output tokens
  },
  'gpt-4o': {
    input: 2.50,   // $2.50 per million input tokens
    output: 10.00  // $10.00 per million output tokens
  },
  'gpt-4-turbo': {
    input: 10.00,  // $10.00 per million input tokens
    output: 30.00  // $30.00 per million output tokens
  }
} as const;

/**
 * Calculate cost for a specific model and token usage
 */
export function calculateModelCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const modelPricing = PRICING[model as keyof typeof PRICING];
  
  if (!modelPricing) {
    // Default to GPT-3.5 Turbo pricing for unknown models
    console.warn(`Unknown model: ${model}, using GPT-3.5 Turbo pricing`);
    const defaultPricing = PRICING['gpt-3.5-turbo'];
    const inputCost = (promptTokens / 1_000_000) * defaultPricing.input;
    const outputCost = (completionTokens / 1_000_000) * defaultPricing.output;
    return inputCost + outputCost;
  }
  
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
  
  return inputCost + outputCost;
}

/**
 * Calculate total cost from aggregated token usage
 * Estimates cost by proportionally distributing prompt/completion tokens across models
 */
export function calculateTotalCost(usage: {
  byModel: Record<string, { totalTokens: number; requestCount: number }>;
  promptTokens: number;
  completionTokens: number;
}): {
  totalCost: number;
  byModel: Record<string, number>;
  breakdown: Array<{ model: string; promptTokens: number; completionTokens: number; cost: number }>;
} {
  const byModelCost: Record<string, number> = {};
  const breakdown: Array<{ model: string; promptTokens: number; completionTokens: number; cost: number }> = [];
  let totalCost = 0;

  // If we have breakdown by model, calculate per model
  if (Object.keys(usage.byModel).length > 0) {
    // Calculate total tokens across all models
    const totalTokens = Object.values(usage.byModel).reduce((sum, m) => sum + m.totalTokens, 0);

    for (const [model, modelUsage] of Object.entries(usage.byModel)) {
      // Estimate prompt/completion tokens proportionally based on model's share
      const modelTokenRatio = modelUsage.totalTokens / totalTokens;
      const estimatedPromptTokens = Math.round(usage.promptTokens * modelTokenRatio);
      const estimatedCompletionTokens = Math.round(usage.completionTokens * modelTokenRatio);
      
      const cost = calculateModelCost(model, estimatedPromptTokens, estimatedCompletionTokens);
      byModelCost[model] = cost;
      totalCost += cost;
      
      breakdown.push({
        model,
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        cost
      });
    }
  } else {
    // Fallback: assume GPT-3.5 Turbo if no model breakdown
    const cost = calculateModelCost('gpt-3.5-turbo', usage.promptTokens, usage.completionTokens);
    totalCost = cost;
    byModelCost['gpt-3.5-turbo'] = cost;
    breakdown.push({
      model: 'gpt-3.5-turbo',
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cost
    });
  }

  return {
    totalCost,
    byModel: byModelCost,
    breakdown
  };
}

/**
 * Calculate cost for a specific number of tokens
 * Assumes a typical 70/30 split (70% input, 30% output) for GPT-3.5 Turbo
 */
export function estimateCostForTokens(
  totalTokens: number,
  model: string = 'gpt-3.5-turbo',
  promptRatio: number = 0.7
): number {
  const promptTokens = Math.round(totalTokens * promptRatio);
  const completionTokens = totalTokens - promptTokens;
  return calculateModelCost(model, promptTokens, completionTokens);
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6
  }).format(cost);
}
