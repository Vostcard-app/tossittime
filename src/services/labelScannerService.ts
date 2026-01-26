/**
 * Label Scanner Service
 * Handles AI-powered label scanning for Premium users
 */

import { userSettingsService } from './userSettingsService';
import { aiUsageService } from './aiUsageService';
import { logServiceOperation, logServiceError } from './baseService';
import type { LabelScanResult } from '../types/labelScanner';

export const labelScannerService = {
  /**
   * Convert image file to base64 string
   */
  async convertImageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Scan label image and extract item information using AI
   * Premium users only
   */
  async scanLabel(imageFile: File, userId?: string): Promise<LabelScanResult> {
    logServiceOperation('scanLabel', 'labelScannerService', { userId, fileName: imageFile.name });

    // Check if user is Premium
    if (!userId) {
      throw new Error('User ID is required for label scanning');
    }

    let isPremium = false;
    try {
      isPremium = await userSettingsService.isPremiumUser(userId);
    } catch (error) {
      console.error('Error checking premium status:', error);
      throw new Error('Unable to verify premium status');
    }

    if (!isPremium) {
      throw new Error('Label scanning is only available for Premium users');
    }

    // Check if user has seen scan warning
    let settings = null;
    try {
      settings = await userSettingsService.getUserSettings(userId);
      if (!settings?.hasSeenScanWarning) {
        throw new Error('FIRST_SCAN_WARNING'); // Special error code
      }
    } catch (error) {
      // Re-throw FIRST_SCAN_WARNING to be handled by component
      if (error instanceof Error && error.message === 'FIRST_SCAN_WARNING') {
        throw error;
      }
      // If settings fetch fails, continue with defaults
      console.error('Error loading user settings:', error);
    }

    // Get regional settings with defaults
    const dateFormat = settings?.dateFormat || 'MM/DD/YYYY';
    const weightUnit = settings?.weightUnit || 'pounds';

    try {
      // Convert image to base64
      const imageBase64 = await this.convertImageToBase64(imageFile);

      // Call Netlify function with regional settings
      const response = await fetch('/.netlify/functions/ai-label-scanner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          imageBase64, 
          userId,
          dateFormat,
          weightUnit
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Parse and validate result
      const result: LabelScanResult = {
        itemName: data.itemName || 'Unknown Item',
        quantity: data.quantity !== null && data.quantity !== undefined ? Number(data.quantity) : undefined,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : null
      };

      // Validate expiration date
      if (result.expirationDate && isNaN(result.expirationDate.getTime())) {
        console.warn('Invalid expiration date received, setting to null');
        result.expirationDate = null;
      }

      // Record token usage if available
      if (data.usage && userId) {
        try {
          await aiUsageService.recordAIUsage(userId, {
            feature: 'label_scanning',
            model: 'gpt-4o-mini',
            promptTokens: data.usage.promptTokens || 0,
            completionTokens: data.usage.completionTokens || 0,
            totalTokens: data.usage.totalTokens || 0
          });
        } catch (usageError) {
          // Don't fail the request if usage recording fails
          console.error('Failed to record AI usage:', usageError);
        }
      }

      logServiceOperation('scanLabel', 'labelScannerService', { 
        userId, 
        itemName: result.itemName,
        hasQuantity: result.quantity !== undefined,
        hasExpirationDate: result.expirationDate !== null
      });

      return result;
    } catch (error) {
      logServiceError('scanLabel', 'labelScannerService', error, { userId, fileName: imageFile.name });
      throw error;
    }
  }
};
