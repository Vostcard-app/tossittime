import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import type { FoodItemData, FoodItem, UserItem } from '../../types';
import { getSuggestedExpirationDate, findFoodItems, findFoodItem } from '../../services/foodkeeperService';
import { getDryGoodsShelfLife } from '../../services/shelfLifeService';
import { freezeGuidelines, freezeCategoryLabels, notRecommendedToFreeze, type FreezeCategory } from '../../data/freezeGuidelines';
import { userItemsService, userSettingsService, categoryService } from '../../services';
import { addMonths, addDays } from 'date-fns';
import { analyticsService } from '../../services/analyticsService';
import { suggestExpirationDate } from '../../services/openaiService';
import LabelScanner from '../features/LabelScanner';
import type { LabelScanResult } from '../../types/labelScanner';
import { capitalizeItemName } from '../../utils/formatting';

import { PANTRY_UNITS } from '../../utils/units';

interface AddItemFormProps {
  onSubmit: (data: FoodItemData, photoFile?: File, noBestBy?: boolean) => Promise<void>;
  onCancel?: () => void;
  onToss?: () => void;
  initialBarcode?: string;
  onScanBarcode?: () => void;
  initialItem?: FoodItem | null;
  initialName?: string;
  forceFreeze?: boolean;
  externalIsFrozen?: boolean;
  onIsFrozenChange?: (isFrozen: boolean) => void;
  initialIsDryCanned?: boolean; // Pre-set isDryCanned based on storage type
  foodItems?: FoodItem[]; // List of previously added items for search/autocomplete
  fromShop?: boolean; // True when navigating from Shop screen
  fromStorageTab?: 'perishable' | 'dryCanned' | null; // Which storage tab user came from
  scannedLabelData?: {
    itemName: string;
    quantity?: number;
    expirationDate?: Date;
    category?: string;
  };
}

const AddItemForm: React.FC<AddItemFormProps> = ({ onSubmit, initialBarcode, initialItem, onCancel, onToss, initialName, forceFreeze, externalIsFrozen, onIsFrozenChange, initialIsDryCanned, foodItems = [], fromShop = false, fromStorageTab = null, scannedLabelData }) => {
  const [user] = useAuthState(auth);
  const [formData, setFormData] = useState<FoodItemData>({
    name: initialItem?.name || initialName || '',
    barcode: initialBarcode || initialItem?.barcode || '',
    bestByDate: initialItem?.isFrozen ? undefined : (initialItem?.bestByDate ? new Date(initialItem.bestByDate) : new Date()),
    thawDate: initialItem?.isFrozen && initialItem?.thawDate ? new Date(initialItem.thawDate) : undefined,
    quantity: initialItem?.quantity || 1,
    quantityUnit: initialItem?.quantityUnit || 'units',
    category: initialItem?.category || '',
    notes: initialItem?.notes || '',
    isFrozen: initialItem?.isFrozen || false,
    freezeCategory: initialItem?.freezeCategory as FreezeCategory | undefined,
    isDryCanned: initialItem?.isDryCanned ?? initialIsDryCanned
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedBestByDate, setSuggestedBestByDate] = useState<Date | null>(null);
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);
  // Use external isFrozen if provided, otherwise use internal state
  const [internalIsFrozen, setInternalIsFrozen] = useState(false);
  const isFrozen = externalIsFrozen !== undefined ? externalIsFrozen : internalIsFrozen;
  
  // Helper function to set freeze state (works with both internal and external)
  const setIsFrozenState = (frozen: boolean) => {
    if (externalIsFrozen !== undefined && onIsFrozenChange) {
      onIsFrozenChange(frozen);
    } else {
      setInternalIsFrozen(frozen);
    }
    setFormData(prev => ({ ...prev, isFrozen: frozen }));
  };
  const [freezeCategory, setFreezeCategory] = useState<FreezeCategory | null>(null);
  const [hasManuallyChangedDate, setHasManuallyChangedDate] = useState(false);
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [showFreezeWarning, setShowFreezeWarning] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [nameInputFocused, setNameInputFocused] = useState(false);
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [showUpgradeMessage, setShowUpgradeMessage] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load userItems
  useEffect(() => {
    if (!user) return;

    const unsubscribe = userItemsService.subscribeToUserItems(
      user.uid,
      (items) => {
        setUserItems(items);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Check premium status on mount
  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      return;
    }

    const checkPremiumStatus = async () => {
      try {
        const premium = await userSettingsService.isPremiumUser(user.uid);
        setIsPremium(premium);
      } catch (error) {
        console.error('Error checking premium status:', error);
        setIsPremium(false);
      }
    };

    checkPremiumStatus();
  }, [user]);

  const handleDismissFreezeWarning = () => {
    setShowFreezeWarning(false);
    setIsFrozenState(false);
    setFormData(prev => ({ ...prev, isFrozen: false }));
  };

  const handleProceedWithFreeze = () => {
    setShowFreezeWarning(false);
    setIsFrozenState(true);
    setFormData(prev => ({ ...prev, isFrozen: true }));
  };

  // Handle scan icon click
  const handleScanClick = () => {
    if (isPremium) {
      setShowLabelScanner(true);
    } else {
      setShowUpgradeMessage(true);
    }
  };

  // Handle label scan result
  const handleLabelScanResult = async (result: LabelScanResult) => {
    try {
      const capitalizedName = capitalizeItemName(result.itemName);
      
      // Detect category using AI
      let detectedCategory = '';
      if (user) {
        detectedCategory = await categoryService.detectCategoryWithAI(capitalizedName, user.uid);
      }

      // Populate form fields
      setFormData(prev => ({
        ...prev,
        name: capitalizedName,
        quantity: result.quantity || 1,
        bestByDate: result.expirationDate || prev.bestByDate || new Date(),
        category: detectedCategory || prev.category
      }));

      // Track analytics
      if (user) {
        analyticsService.trackEngagement(user.uid, 'label_scanned', {
          feature: 'label_scanner',
          hasQuantity: result.quantity !== null && result.quantity !== undefined,
          hasExpirationDate: result.expirationDate !== null && result.expirationDate !== undefined
        });
      }

      setShowLabelScanner(false);
    } catch (error) {
      console.error('Error processing label scan result:', error);
      alert('Failed to process scanned label. Please try again.');
    }
  };

  // Handle label scanner error
  const handleLabelScannerError = (error: Error) => {
    console.error('Label scanner error:', error);
    alert(`Error scanning label: ${error.message}`);
    setShowLabelScanner(false);
  };

  // Handle label scanner close
  const handleLabelScannerClose = () => {
    setShowLabelScanner(false);
  };

  // Handle AI best by date
  const handleAIBestByDate = async () => {
    if (!isPremium || !user) return;
    if (!formData.name.trim()) {
      alert('Please enter an item name first');
      return;
    }
    
    setIsAILoading(true);
    setAiError(null);
    
    try {
      const storageType = formData.isDryCanned ? 'pantry' : 'refrigerator';
      const result = await suggestExpirationDate(
        formData.name.trim(),
        storageType,
        false // isLeftover
      );
      
      const suggestedDate = new Date(result.expirationDate);
      if (isNaN(suggestedDate.getTime())) {
        throw new Error('Invalid date returned from AI');
      }
      
      setFormData(prev => ({
        ...prev,
        bestByDate: suggestedDate
      }));
      setHasManuallyChangedDate(true); // Mark as manually changed since user clicked button
    } catch (error) {
      console.error('Error getting AI best by date:', error);
      setAiError(error instanceof Error ? error.message : 'Failed to get AI suggestion');
    } finally {
      setIsAILoading(false);
    }
  };

  // Update form data when initialItem or initialName changes
  useEffect(() => {
    if (initialItem) {
      const shouldFreeze = forceFreeze !== undefined ? forceFreeze : (initialItem.isFrozen ?? false);
      setFormData({
        name: initialItem.name,
        barcode: initialItem.barcode || '',
        bestByDate: shouldFreeze ? undefined : (initialItem.bestByDate ? new Date(initialItem.bestByDate) : new Date()),
        thawDate: shouldFreeze && initialItem.thawDate ? new Date(initialItem.thawDate) : undefined,
        quantity: initialItem.quantity || 1,
        quantityUnit: initialItem.quantityUnit || 'units',
        category: initialItem.category || '',
        notes: initialItem.notes || '',
        isFrozen: shouldFreeze,
        freezeCategory: initialItem.freezeCategory as FreezeCategory | undefined
      });
      setIsFrozenState(shouldFreeze);
      setFreezeCategory(initialItem.freezeCategory as FreezeCategory | null);
      setHasManuallyChangedDate(true); // Don't auto-apply when editing existing item
    } else if (scannedLabelData) {
      // Populate form with scanned label data
      setFormData(prev => ({
        ...prev,
        name: scannedLabelData.itemName,
        quantity: scannedLabelData.quantity || 1,
        bestByDate: scannedLabelData.expirationDate || prev.bestByDate || new Date(),
        category: scannedLabelData.category || prev.category
      }));
      setHasManuallyChangedDate(false); // Reset flag for new items
    } else if (initialName && !formData.name) {
      setFormData(prev => ({ ...prev, name: initialName }));
      setHasManuallyChangedDate(false); // Reset flag for new items
    }
  }, [initialItem, initialName, scannedLabelData, forceFreeze]);

  // Handle forceFreeze when no initialItem
  // Note: Warning should have already been shown on dashboard when Freeze button was tapped
  // So we just set isFrozen to true without showing warning again
  useEffect(() => {
    if (forceFreeze && !initialItem) {
      // User already saw warning on dashboard and proceeded, so just set frozen state
      console.log('✅ Setting freeze state from forceFreeze (warning already shown on dashboard)');
      setIsFrozenState(true);
    }
  }, [forceFreeze, initialItem]);

  // Filter food items for dropdown based on name input
  const filteredFoodItems = React.useMemo(() => {
    if (!formData.name.trim() || !showNameDropdown) {
      return [];
    }
    const query = formData.name.toLowerCase();
    return foodItems.filter(item => 
      item.name.toLowerCase().includes(query) && 
      item.name.toLowerCase() !== query // Don't show exact match
    ).slice(0, 5); // Limit to 5 items
  }, [formData.name, foodItems, showNameDropdown]);

  // Get FoodKeeper suggestions for dropdown
  const foodKeeperSuggestions = React.useMemo(() => {
    if (!formData.name.trim() || !showNameDropdown) {
      return [];
    }
    return findFoodItems(formData.name.trim(), 3); // Limit to 3 suggestions
  }, [formData.name, showNameDropdown]);

  // Watch formData.name and isFrozen to calculate suggested expiration date and auto-apply it
  useEffect(() => {
    if (formData.name.trim()) {
      const storageType = isFrozen ? 'freezer' : (formData.isDryCanned ? 'pantry' : 'refrigerator');
      
      // First check userItems for a matching item
      const normalizedName = formData.name.trim().toLowerCase();
      const userItem = userItems.find(
        item => item.name.trim().toLowerCase() === normalizedName
      );
      
      let suggestion: Date | null = null;
      let qualityMsg: string | null = null;
      
      if (userItem && !isFrozen) {
        // Use user's custom expirationLength
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        suggestion = addDays(today, userItem.expirationLength);
      } else {
        // Fall back to foodkeeper.json or shelfLifeService
        const foodKeeperItem = findFoodItem(formData.name.trim());
        suggestion = getSuggestedExpirationDate(formData.name.trim(), storageType);
        
        // For dry/canned goods, get quality message from shelfLifeService
        if (formData.isDryCanned && storageType === 'pantry') {
          const shelfLifeResult = getDryGoodsShelfLife(formData.name.trim(), foodKeeperItem || null);
          if (shelfLifeResult && shelfLifeResult.qualityMessage) {
            qualityMsg = shelfLifeResult.qualityMessage;
          }
        }
      }
      
      setSuggestedBestByDate(suggestion);
      setQualityMessage(qualityMsg);
      
      // Auto-apply suggestion if available and user hasn't manually changed the date
      // BUT: Don't auto-apply if freeze is checked (we'll use category-based calculation instead)
      if (suggestion && !hasManuallyChangedDate && !isFrozen && formData.bestByDate) {
        // Only auto-apply if current date is today (default) or if we're editing and date hasn't been manually changed
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentDate = new Date(formData.bestByDate);
        currentDate.setHours(0, 0, 0, 0);
        const isDefaultDate = currentDate.getTime() === today.getTime();
        
        // Auto-apply if it's the default date or if we're not editing an existing item
        if (isDefaultDate || !initialItem) {
          setFormData(prev => ({
            ...prev,
            bestByDate: suggestion
          }));
        }
      }
    } else {
      setSuggestedBestByDate(null);
      setQualityMessage(null);
    }
  }, [formData.name, formData.isDryCanned, isFrozen, hasManuallyChangedDate, initialItem, userItems]);


  // Calculate thaw date when freeze category is selected
  useEffect(() => {
    if (isFrozen && freezeCategory) {
      const bestQualityMonths = freezeGuidelines[freezeCategory];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Calculate thaw date = today + bestQualityMonths
      const thawDate = addMonths(today, bestQualityMonths);
      
      // Set thawDate and remove bestByDate for frozen items
      setFormData(prev => ({
        ...prev,
        thawDate: thawDate,
        bestByDate: undefined
      }));
      setHasManuallyChangedDate(false); // Reset flag since we're auto-setting
    } else if (!isFrozen) {
      // If unfrozen, clear thawDate and ensure bestByDate exists
      setFormData(prev => ({
        ...prev,
        thawDate: undefined,
        bestByDate: prev.bestByDate || new Date()
      }));
    }
  }, [isFrozen, freezeCategory]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 1 : value
    }));
    // Show dropdown when typing in name field
    if (name === 'name') {
      setShowNameDropdown(true);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasManuallyChangedDate(true);
    setFormData(prev => ({
      ...prev,
      bestByDate: new Date(e.target.value)
    }));
  };

  // Handle quantity increment
  const handleQuantityIncrement = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFormData(prev => ({
      ...prev,
      quantity: (prev.quantity || 1) + 1
    }));
  };

  // Handle quantity decrement
  const handleQuantityDecrement = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFormData(prev => ({
      ...prev,
      quantity: Math.max(1, (prev.quantity || 1) - 1)
    }));
  };
  
  // Note: Thaw date is calculated automatically from freeze category, so no manual change handler needed

  const handleSubmit = async (e: React.FormEvent, isDryCannedOverride?: boolean) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    
    // Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    if (!formData.name.trim()) {
      alert('Please enter a food item name');
      return;
    }
    
    // Validation: frozen items need thawDate, non-frozen items need bestByDate
    if (isFrozen) {
      if (!freezeCategory) {
        alert('Please select a freeze category');
        return;
      }
      if (!formData.thawDate) {
        alert('Thaw date is required for frozen items');
        return;
      }
    } else {
      if (!formData.bestByDate) {
        alert('Best by date is required');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Build dataToSubmit: frozen items have thawDate (no bestByDate), non-frozen have bestByDate (no thawDate)
      // Use isDryCannedOverride if provided (from button click), otherwise use formData.isDryCanned
      // IMPORTANT: isDryCannedOverride takes precedence - it's explicitly set by the button clicked
      const finalIsDryCanned = isDryCannedOverride !== undefined ? isDryCannedOverride : (formData.isDryCanned || false);
      
      const dataToSubmit: FoodItemData = {
        name: formData.name,
        barcode: formData.barcode,
        quantity: formData.quantity || 1, // Always include quantity
        quantityUnit: formData.quantityUnit || 'units', // Always include unit for all items
        category: formData.category,
        notes: formData.notes,
        isFrozen: isFrozen,
        freezeCategory: freezeCategory || undefined,
        isDryCanned: finalIsDryCanned,
        // For frozen items: include thawDate, exclude expirationDate
        // For non-frozen items: include expirationDate, exclude thawDate
        ...(isFrozen 
          ? { thawDate: formData.thawDate, bestByDate: undefined }
          : { bestByDate: formData.bestByDate, thawDate: undefined }
        )
        // Don't include photoUrl here - it will be set after upload
      };
      
      console.log('💾 Submitting item with isDryCanned:', finalIsDryCanned, 'override:', isDryCannedOverride);
      await onSubmit(dataToSubmit, undefined);
      
      // Reset form only if not editing
      if (!initialItem) {
        setFormData({
          name: '',
          barcode: '',
          bestByDate: new Date(),
          thawDate: undefined,
          quantity: 1,
          quantityUnit: 'units',
          category: '',
          notes: '',
          isFrozen: false
        });
        setIsFrozenState(false);
        setFreezeCategory(null);
        setHasManuallyChangedDate(false); // Reset flag for next item
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to add food item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); }} style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Back button, Scan icon, and Toss button at top */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#002B4D',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '0.5rem 0'
            }}
          >
            ← Back
          </button>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: onCancel ? 'auto' : '0' }}>
          {/* Scan icon button - Premium only */}
          {isPremium && (
            <button
              type="button"
              onClick={handleScanClick}
              style={{
                padding: '0',
                backgroundColor: '#48a13b',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '52px',
                height: '52px',
                overflow: 'hidden'
              }}
              aria-label="AI"
              title="AI"
            >
              <img 
                src="/icons/Scan.svg" 
                alt="Scan" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            </button>
          )}
          {onToss && (
            <button
              type="button"
              onClick={onToss}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                minWidth: '60px',
                minHeight: '36px'
              }}
              aria-label="Remove item"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      
      {/* 1. Item Name Field */}
      <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
          Item Name *
        </label>
        <input
          ref={nameInputRef}
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          onFocus={() => {
            setNameInputFocused(true);
            if (formData.name.trim()) {
              setShowNameDropdown(true);
            }
          }}
          onBlur={() => {
            setNameInputFocused(false);
            // Delay hiding dropdown to allow item clicks
            setTimeout(() => {
              setShowNameDropdown(false);
            }, 200);
          }}
          required
          placeholder="Enter item name"
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem'
          }}
        />
        {/* Dropdown for previously added items and suggestions */}
        {showNameDropdown && (nameInputFocused || formData.name.trim()) && (filteredFoodItems.length > 0 || foodKeeperSuggestions.length > 0) && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1000
            }}
            onMouseDown={(e) => {
              // Prevent blur when clicking inside dropdown
              e.preventDefault();
            }}
          >
            {/* Previously added items */}
            {filteredFoodItems.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setFormData(prev => ({ ...prev, name: item.name }));
                  setShowNameDropdown(false);
                }}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                  {item.name}
                </div>
              </div>
            ))}
            
            {/* FoodKeeper suggestions */}
            {foodKeeperSuggestions.length > 0 && (
              <>
                {filteredFoodItems.length > 0 && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#f9fafb', 
                    borderTop: '1px solid #e5e7eb',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Suggested Items
                  </div>
                )}
                {foodKeeperSuggestions.map((suggestion, index) => (
                  <div
                    key={`foodkeeper-${suggestion.name}-${index}`}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, name: suggestion.name }));
                      setShowNameDropdown(false);
                    }}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      backgroundColor: '#fef3c7' // Light yellow to distinguish from previous items
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fde68a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef3c7';
                    }}
                  >
                    <div style={{ fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
                      {suggestion.name}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {suggestion.category}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. Best By Date / Thaw Date Field */}
      {!isFrozen && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="bestByDate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
            Best By Date * (Dates are suggestions not guarantees)
          </label>
          <input
            ref={dateInputRef}
            type="date"
            id="bestByDate"
            name="bestByDate"
            value={formData.bestByDate ? formData.bestByDate.toISOString().split('T')[0] : ''}
            onChange={handleDateChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem'
            }}
          />
          {/* Show quality message for dry/canned goods */}
          {formData.isDryCanned && qualityMessage && (
            <p style={{ 
              margin: '0.5rem 0 0 0', 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              fontStyle: 'italic' 
            }}>
              {qualityMessage}
            </p>
          )}
          {/* AI best by date button - Premium only */}
          {isPremium && formData.name.trim() && (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={handleAIBestByDate}
                disabled={isAILoading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: isAILoading ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: isAILoading ? 'not-allowed' : 'pointer',
                  opacity: isAILoading ? 0.7 : 1,
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isAILoading ? (
                  <>
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>AI best by date</span>
                  </>
                )}
              </button>
              {aiError && (
                <p style={{ 
                  margin: '0.5rem 0 0 0', 
                  fontSize: '0.875rem', 
                  color: '#ef4444' 
                }}>
                  {aiError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2.5. Quantity Field - Show for all items */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="quantity" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
          Quantity
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
          {/* Quantity input with spinner controls */}
          <div style={{ position: 'relative', flex: formData.isDryCanned ? '1' : '1' }}>
            <input
              type="number"
              id="quantity"
              name="quantity"
              min="1"
              value={formData.quantity || 1}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.75rem 2.5rem 0.75rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            {/* Up/Down arrow buttons */}
            <div style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.125rem'
            }}>
              <button
                type="button"
                onClick={handleQuantityIncrement}
                style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  padding: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  lineHeight: 1
                }}
                aria-label="Increase quantity"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={handleQuantityDecrement}
                style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  padding: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  lineHeight: 1
                }}
                aria-label="Decrease quantity"
              >
                ▼
              </button>
            </div>
          </div>
          {/* Show unit dropdown for all items */}
          <select
            id="quantityUnit"
            name="quantityUnit"
            value={formData.quantityUnit || 'units'}
            onChange={handleInputChange}
            style={{
              flex: '1',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              backgroundColor: '#ffffff',
              cursor: 'pointer'
            }}
          >
            {PANTRY_UNITS.map(unit => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* 2a. Thaw Date Field (for frozen items) */}
      {isFrozen && formData.thawDate && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="thawDate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
            Thaw Date *
          </label>
          <input
            type="date"
            id="thawDate"
            name="thawDate"
            value={formData.thawDate.toISOString().split('T')[0]}
            disabled
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              backgroundColor: '#f3f4f6',
              cursor: 'not-allowed'
            }}
          />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Thaw date is calculated from the selected freeze category
          </p>
        </div>
      )}

      {/* 2.5. Freeze Checkbox */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: initialItem?.isFrozen ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={isFrozen}
            disabled={initialItem?.isFrozen === true} // Prevent unfreezing
            onChange={(e) => {
              // Don't allow unfreezing if item is already frozen
              if (initialItem?.isFrozen) {
                return;
              }
              const frozen = e.target.checked;
              
              // Check if item is not recommended to freeze
              if (frozen) {
                const normalizedName = formData.name.trim().toLowerCase();
                
                // Check for exact match OR if any list item is contained in the name
                const isNotRecommended = notRecommendedToFreeze.some(item => {
                  const normalizedItem = item.toLowerCase();
                  const exactMatch = normalizedItem === normalizedName;
                  const containsMatch = normalizedName.includes(normalizedItem);
                  return exactMatch || containsMatch;
                });
                
                if (isNotRecommended) {
                  console.log('⚠️ Freeze warning triggered for:', normalizedName);
                  // Show warning modal and don't set isFrozen yet
                  setShowFreezeWarning(true);
                  return;
                }
              }
              
              // Proceed normally if not in the list or if unchecking
              setIsFrozenState(frozen);
              // Reset category when unchecked
              if (!frozen) {
                setFreezeCategory(null);
              }
            }}
            style={{
              width: '1.25rem',
              height: '1.25rem',
              cursor: initialItem?.isFrozen ? 'not-allowed' : 'pointer',
              opacity: initialItem?.isFrozen ? 0.5 : 1
            }}
          />
          <span style={{ fontSize: '1rem', fontWeight: '500' }}>
            Freeze this item
          </span>
        </label>
      </div>

      {/* Freeze Category Dropdown (appears when freeze is checked) */}
      {isFrozen && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="freezeCategory" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
            Freeze Category *
          </label>
          <select
            id="freezeCategory"
            value={freezeCategory || ''}
            onChange={(e) => {
              const category = e.target.value as FreezeCategory;
              setFreezeCategory(category);
            }}
            required={isFrozen}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              outline: 'none',
              backgroundColor: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="">Select category...</option>
            {(Object.keys(freezeGuidelines) as FreezeCategory[]).map((category) => (
              <option key={category} value={category}>
                {freezeCategoryLabels[category]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 1. Save Buttons - Conditional based on source */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
        {/* From Shop: Show both "Add as" buttons */}
        {fromShop && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e, false);
              }}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                minHeight: '44px'
              }}
            >
              {isSubmitting ? 'Adding...' : 'Add as Perishable'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e, true);
              }}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                minHeight: '44px'
              }}
            >
              {isSubmitting ? 'Adding...' : 'Add as Dry/Canned Goods'}
            </button>
          </>
        )}
        
        {/* From Storage Tab: Show single "Save" button */}
        {fromStorageTab && !fromShop && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Auto-set isDryCanned based on storage tab
              const isDryCanned = fromStorageTab === 'dryCanned';
              handleSubmit(e, isDryCanned);
            }}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              backgroundColor: '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              minHeight: '44px'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        )}
        
        {/* Default (editing or no source): Show both save buttons */}
        {!fromShop && !fromStorageTab && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e, false);
              }}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                minHeight: '44px'
              }}
            >
              {isSubmitting ? 'Saving...' : 'Save Perishable'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e, true);
              }}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                minHeight: '44px'
              }}
            >
              {isSubmitting ? 'Saving...' : 'Pantry'}
            </button>
          </>
        )}
      </div>

      {/* 2. Change Expiration Date button (appears when suggestion is available) */}
      {formData.name.trim() && suggestedBestByDate && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => {
              // Focus the date input to open the date picker
              if (dateInputRef.current) {
                dateInputRef.current.focus();
                dateInputRef.current.showPicker?.();
              }
            }}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            {fromShop ? 'Change Expiration' : 'Change Expiration Date'}
          </button>
        </div>
      )}

      {/* Freeze Warning Modal */}
      {showFreezeWarning && (
        <FreezeWarningModal
          itemName={formData.name}
          onDismiss={handleDismissFreezeWarning}
          onProceed={handleProceedWithFreeze}
        />
      )}

      {/* Label Scanner Modal */}
      {showLabelScanner && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={handleLabelScannerClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <LabelScanner
              onScan={handleLabelScanResult}
              onError={handleLabelScannerError}
              onClose={handleLabelScannerClose}
            />
          </div>
        </div>
      )}

      {/* Upgrade Message Modal */}
      {showUpgradeMessage && (
        <UpgradeMessageModal
          onClose={() => setShowUpgradeMessage(false)}
        />
      )}

    </form>
  );
};

// Freeze Warning Modal Component
interface FreezeWarningModalProps {
  itemName: string;
  onDismiss: () => void;
  onProceed: () => void;
}

const FreezeWarningModal: React.FC<FreezeWarningModalProps> = ({ itemName, onDismiss, onProceed }) => {
  const [modalJustOpened, setModalJustOpened] = useState(true);
  
  // Prevent backdrop clicks immediately after modal opens
  useEffect(() => {
    const timer = setTimeout(() => {
      setModalJustOpened(false);
    }, 100); // Prevent clicks for 100ms after opening
    return () => clearTimeout(timer);
  }, []);
  
  // Use portal to render outside normal DOM hierarchy and ensure it's on top
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onClick={(e) => {
        // Prevent dismissal if modal just opened
        if (modalJustOpened) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Only dismiss if clicking directly on backdrop (not child elements)
        if (e.target === e.currentTarget) {
          onDismiss();
        }
      }}
      onMouseDown={(e) => {
        // Prevent mouse down from triggering click if modal just opened
        if (modalJustOpened && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          minWidth: '300px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Not Recommended to Freeze
        </h3>

        <p style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', color: '#374151', lineHeight: '1.5' }}>
          <strong>{itemName}</strong> is not recommended to freeze. Freezing may cause changes in texture, quality, or safety.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onProceed}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Upgrade Message Modal Component
interface UpgradeMessageModalProps {
  onClose: () => void;
}

const UpgradeMessageModal: React.FC<UpgradeMessageModalProps> = ({ onClose }) => {
  const [modalJustOpened, setModalJustOpened] = useState(true);
  
  // Prevent backdrop clicks immediately after modal opens
  useEffect(() => {
    const timer = setTimeout(() => {
      setModalJustOpened(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Use portal to render outside normal DOM hierarchy and ensure it's on top
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onClick={(e) => {
        // Prevent dismissal if modal just opened
        if (modalJustOpened) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Only dismiss if clicking directly on backdrop (not child elements)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseDown={(e) => {
        // Prevent mouse down from triggering click if modal just opened
        if (modalJustOpened && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          minWidth: '300px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Premium Feature
        </h3>

        <p style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', color: '#374151', lineHeight: '1.5' }}>
          Upgrade to Premium to use AI label scanning. Scan food labels to automatically populate item name, quantity, and expiration date.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddItemForm;

