import React, { useState, useRef, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import type { FoodItemData, FoodItem, UserCategory, UserCategoryData, UserItem } from '../types';
import { getSuggestedExpirationDate } from '../services/foodkeeperService';
import { freezeGuidelines, freezeCategoryLabels, type FreezeCategory } from '../data/freezeGuidelines';
import { userCategoriesService, userItemsService } from '../services/firebaseService';
import { addMonths, addDays } from 'date-fns';

interface AddItemFormProps {
  onSubmit: (data: FoodItemData, photoFile?: File, noExpiration?: boolean) => Promise<void>;
  onCancel?: () => void;
  initialBarcode?: string;
  onScanBarcode?: () => void;
  initialItem?: FoodItem | null;
  initialName?: string;
  fromShoppingList?: boolean;
  forceFreeze?: boolean;
}

const AddItemForm: React.FC<AddItemFormProps> = ({ onSubmit, initialBarcode, onScanBarcode, initialItem, onCancel, initialName, fromShoppingList, forceFreeze }) => {
  const [user] = useAuthState(auth);
  const [formData, setFormData] = useState<FoodItemData>({
    name: initialItem?.name || initialName || '',
    barcode: initialBarcode || initialItem?.barcode || '',
    expirationDate: initialItem?.isFrozen ? undefined : (initialItem?.expirationDate ? new Date(initialItem.expirationDate) : new Date()),
    thawDate: initialItem?.isFrozen && initialItem?.thawDate ? new Date(initialItem.thawDate) : undefined,
    quantity: initialItem?.quantity || 1,
    category: initialItem?.category || '',
    notes: initialItem?.notes || '',
    isFrozen: initialItem?.isFrozen || false,
    freezeCategory: initialItem?.freezeCategory as FreezeCategory | undefined
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialItem?.photoUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedExpirationDate, setSuggestedExpirationDate] = useState<Date | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezeCategory, setFreezeCategory] = useState<FreezeCategory | null>(null);
  const [hasManuallyChangedDate, setHasManuallyChangedDate] = useState(false);
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Load categories
  useEffect(() => {
    if (!user) return;

    const unsubscribe = userCategoriesService.subscribeToUserCategories(
      user.uid,
      (cats) => {
        setCategories(cats);
      }
    );

    return () => unsubscribe();
  }, [user]);

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

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__add_category__') {
      setShowAddCategoryModal(true);
    } else {
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleAddCategory = async (data: UserCategoryData) => {
    if (!user) return;
    try {
      await userCategoriesService.createCategory(user.uid, data);
      setShowAddCategoryModal(false);
      // The category will be automatically selected when the list refreshes
      setTimeout(() => {
        setFormData(prev => ({ ...prev, category: data.name }));
      }, 100);
    } catch (err: any) {
      alert(err.message || 'Failed to add category. Please try again.');
    }
  };

  // Update form data when initialItem or initialName changes
  useEffect(() => {
    if (initialItem) {
      const shouldFreeze = forceFreeze !== undefined ? forceFreeze : initialItem.isFrozen;
      setFormData({
        name: initialItem.name,
        barcode: initialItem.barcode || '',
        expirationDate: shouldFreeze ? undefined : (initialItem.expirationDate ? new Date(initialItem.expirationDate) : new Date()),
        thawDate: shouldFreeze && initialItem.thawDate ? new Date(initialItem.thawDate) : undefined,
        quantity: initialItem.quantity || 1,
        category: initialItem.category || '',
        notes: initialItem.notes || '',
        isFrozen: shouldFreeze,
        freezeCategory: initialItem.freezeCategory as FreezeCategory | undefined
      });
      setPhotoPreview(initialItem.photoUrl || null);
      setIsFrozen(shouldFreeze);
      setFreezeCategory(initialItem.freezeCategory as FreezeCategory | null);
      setHasManuallyChangedDate(true); // Don't auto-apply when editing existing item
    } else if (initialName && !formData.name) {
      setFormData(prev => ({ ...prev, name: initialName }));
      setHasManuallyChangedDate(false); // Reset flag for new items
    }
  }, [initialItem, initialName, forceFreeze]);

  // Handle forceFreeze when no initialItem
  useEffect(() => {
    if (forceFreeze && !initialItem) {
      setIsFrozen(true);
      setFormData(prev => ({ ...prev, isFrozen: true }));
    }
  }, [forceFreeze, initialItem]);

  // Watch formData.name and isFrozen to calculate suggested expiration date and auto-apply it
  useEffect(() => {
    if (formData.name.trim()) {
      const storageType = isFrozen ? 'freezer' : 'refrigerator';
      
      // First check userItems for a matching item
      const normalizedName = formData.name.trim().toLowerCase();
      const userItem = userItems.find(
        item => item.name.trim().toLowerCase() === normalizedName
      );
      
      let suggestion: Date | null = null;
      
      if (userItem && !isFrozen) {
        // Use user's custom expirationLength
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        suggestion = addDays(today, userItem.expirationLength);
      } else {
        // Fall back to foodkeeper.json
        suggestion = getSuggestedExpirationDate(formData.name.trim(), storageType);
      }
      
      setSuggestedExpirationDate(suggestion);
      
      // Auto-apply suggestion if available and user hasn't manually changed the date
      // BUT: Don't auto-apply if freeze is checked (we'll use category-based calculation instead)
      if (suggestion && !hasManuallyChangedDate && !isFrozen && formData.expirationDate) {
        // Only auto-apply if current date is today (default) or if we're editing and date hasn't been manually changed
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentDate = new Date(formData.expirationDate);
        currentDate.setHours(0, 0, 0, 0);
        const isDefaultDate = currentDate.getTime() === today.getTime();
        
        // Auto-apply if it's the default date or if we're not editing an existing item
        if (isDefaultDate || !initialItem) {
          setFormData(prev => ({
            ...prev,
            expirationDate: suggestion
          }));
        }
      }
    } else {
      setSuggestedExpirationDate(null);
    }
  }, [formData.name, isFrozen, hasManuallyChangedDate, initialItem, userItems]);

  // Calculate thaw date when freeze category is selected
  useEffect(() => {
    if (isFrozen && freezeCategory) {
      const bestQualityMonths = freezeGuidelines[freezeCategory];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Calculate thaw date = today + bestQualityMonths
      const thawDate = addMonths(today, bestQualityMonths);
      
      // Set thawDate and remove expirationDate for frozen items
      setFormData(prev => ({
        ...prev,
        thawDate: thawDate,
        expirationDate: undefined
      }));
      setHasManuallyChangedDate(false); // Reset flag since we're auto-setting
    } else if (!isFrozen) {
      // If unfrozen, clear thawDate and ensure expirationDate exists
      setFormData(prev => ({
        ...prev,
        thawDate: undefined,
        expirationDate: prev.expirationDate || new Date()
      }));
    }
  }, [isFrozen, freezeCategory]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 1 : value
    }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasManuallyChangedDate(true);
    setFormData(prev => ({
      ...prev,
      expirationDate: new Date(e.target.value)
    }));
  };
  
  // Note: Thaw date is calculated automatically from freeze category, so no manual change handler needed

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Please enter a food item name');
      return;
    }
    
    // Validation: frozen items need thawDate, non-frozen items need expirationDate
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
      if (!formData.expirationDate) {
        alert('Expiration date is required');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Build dataToSubmit: frozen items have thawDate (no expirationDate), non-frozen have expirationDate (no thawDate)
      const dataToSubmit: FoodItemData = {
        name: formData.name,
        barcode: formData.barcode,
        quantity: formData.quantity,
        category: formData.category,
        notes: formData.notes,
        isFrozen: isFrozen,
        freezeCategory: freezeCategory || undefined,
        // For frozen items: include thawDate, exclude expirationDate
        // For non-frozen items: include expirationDate, exclude thawDate
        ...(isFrozen 
          ? { thawDate: formData.thawDate, expirationDate: undefined }
          : { expirationDate: formData.expirationDate, thawDate: undefined }
        )
        // Don't include photoUrl here - it will be set after upload
      };
      await onSubmit(dataToSubmit, photoFile || undefined);
      
      // Reset form only if not editing
      if (!initialItem) {
        setFormData({
          name: '',
          barcode: '',
          expirationDate: new Date(),
          thawDate: undefined,
          quantity: 1,
          category: '',
          notes: '',
          isFrozen: false
        });
        setPhotoFile(null);
        setPhotoPreview(null);
        setIsFrozen(false);
        setFreezeCategory(null);
        setHasManuallyChangedDate(false); // Reset flag for next item
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to add food item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Cancel button at top */}
      {onCancel && (
        <div style={{ marginBottom: '1rem' }}>
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
        </div>
      )}
      
      {/* 1. Item Name Field */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
          Item Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
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
      </div>

      {/* 2. Expiration Date / Thaw Date Field */}
      {!isFrozen && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="expirationDate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
            Expiration Date *
          </label>
          <input
            ref={dateInputRef}
            type="date"
            id="expirationDate"
            name="expirationDate"
            value={formData.expirationDate ? formData.expirationDate.toISOString().split('T')[0] : ''}
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
        </div>
      )}
      
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
              setIsFrozen(frozen);
              // Update formData with isFrozen flag
              setFormData(prev => ({ ...prev, isFrozen: frozen }));
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
            Freeze {initialItem?.isFrozen && '(Cannot be unfrozen)'}
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

      {/* Category Dropdown */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="category" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
          Category (optional)
        </label>
        <select
          id="category"
          value={formData.category || ''}
          onChange={handleCategoryChange}
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
          <option value="">None</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
          <option value="__add_category__">Add Category</option>
        </select>
      </div>

      {/* 3. Change Expiration Date button (appears when suggestion is available) */}
      {formData.name.trim() && suggestedExpirationDate && (
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
            Change Expiration Date
          </button>
        </div>
      )}

      {/* 4. Save Button */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="submit"
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
            minHeight: '44px' // Touch target size for mobile
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save to Calendar'}
        </button>
      </div>

      {/* 5. Remove/ No Exp. button (only when coming from shopping list) */}
      {fromShoppingList && (
        <div style={{ marginBottom: '2rem' }}>
          <button
            type="button"
            onClick={async () => {
              try {
                await onSubmit({ ...formData, expirationDate: new Date() }, undefined, true);
              } catch (error) {
                console.error('Error removing from list:', error);
              }
            }}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Remove/ No Exp.
          </button>
        </div>
      )}

      {/* 6. Photo/Barcode Section */}
      <div style={{ 
        paddingTop: '1.5rem', 
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {onScanBarcode && (
          <button
            type="button"
            onClick={onScanBarcode}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              minHeight: '44px' // Touch target size for mobile
            }}
          >
            📷 Scan Barcode
          </button>
        )}
        
        <div>
          <label htmlFor="photo" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
            Take Photo (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            id="photo"
            name="photo"
            accept="image/*"
            onChange={handlePhotoChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Preview"
              style={{
                width: '100%',
                maxWidth: '300px',
                height: 'auto',
                marginTop: '0.5rem',
                borderRadius: '8px'
              }}
            />
          )}
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <AddCategoryModal
          onSave={handleAddCategory}
          onClose={() => setShowAddCategoryModal(false)}
        />
      )}
    </form>
  );
};

// Add Category Modal Component
interface AddCategoryModalProps {
  onSave: (data: UserCategoryData) => void;
  onClose: () => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Category name cannot be empty.');
      return;
    }

    onSave({
      name: name.trim()
    });
  };

  return (
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
        zIndex: 2000
      }}
      onClick={onClose}
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
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
          Add Category
        </h3>

        {error && (
          <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Category Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                outline: 'none'
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
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
              Cancel
            </button>
            <button
              type="submit"
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
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemForm;

