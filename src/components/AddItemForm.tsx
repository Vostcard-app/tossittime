import React, { useState, useRef, useEffect } from 'react';
import type { FoodItemData, FoodItem } from '../types';

interface AddItemFormProps {
  onSubmit: (data: FoodItemData, photoFile?: File, noExpiration?: boolean) => Promise<void>;
  onCancel?: () => void;
  initialBarcode?: string;
  onScanBarcode?: () => void;
  initialItem?: FoodItem | null;
  initialName?: string;
}

const AddItemForm: React.FC<AddItemFormProps> = ({ onSubmit, initialBarcode, onScanBarcode, initialItem, onCancel, initialName }) => {
  const [formData, setFormData] = useState<FoodItemData>({
    name: initialItem?.name || initialName || '',
    barcode: initialBarcode || initialItem?.barcode || '',
    expirationDate: initialItem?.expirationDate ? new Date(initialItem.expirationDate) : new Date(),
    quantity: initialItem?.quantity || 1,
    category: initialItem?.category || '',
    notes: initialItem?.notes || ''
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialItem?.photoUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noExpiration, setNoExpiration] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form data when initialItem or initialName changes
  useEffect(() => {
    if (initialItem) {
      setFormData({
        name: initialItem.name,
        barcode: initialItem.barcode || '',
        expirationDate: new Date(initialItem.expirationDate),
        quantity: initialItem.quantity || 1,
        category: initialItem.category || '',
        notes: initialItem.notes || ''
      });
      setPhotoPreview(initialItem.photoUrl || null);
    } else if (initialName && !formData.name) {
      setFormData(prev => ({ ...prev, name: initialName }));
    }
  }, [initialItem, initialName]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 1 : value
    }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      expirationDate: new Date(e.target.value)
    }));
  };

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

    setIsSubmitting(true);
    try {
      const dataToSubmit: FoodItemData = {
        ...formData
        // Don't include photoUrl here - it will be set after upload
      };
      await onSubmit(dataToSubmit, photoFile || undefined);
      
      // Reset form only if not editing
      if (!initialItem) {
        setFormData({
          name: '',
          barcode: '',
          expirationDate: new Date(),
          quantity: 1,
          category: '',
          notes: ''
        });
        setPhotoFile(null);
        setPhotoPreview(null);
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

      {/* 2. No Expiration Checkbox */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={noExpiration}
            onChange={(e) => {
              setNoExpiration(e.target.checked);
              if (e.target.checked) {
                // Clear expiration date when "no expiration" is checked
                setFormData(prev => ({ ...prev, expirationDate: new Date() }));
              }
            }}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer'
            }}
          />
          <span style={{ fontSize: '1rem', fontWeight: '500' }}>No expiration date</span>
        </label>
      </div>

      {/* 3. Expiration Date Field */}
      {!noExpiration && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="expirationDate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '1rem' }}>
            Expiration Date *
          </label>
          <input
            type="date"
            id="expirationDate"
            name="expirationDate"
            value={formData.expirationDate.toISOString().split('T')[0]}
            onChange={handleDateChange}
            required={!noExpiration}
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

      {/* 4. Save Button */}
      <div style={{ marginBottom: '2rem' }}>
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
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* 5. Photo/Barcode Section */}
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
    </form>
  );
};

export default AddItemForm;

