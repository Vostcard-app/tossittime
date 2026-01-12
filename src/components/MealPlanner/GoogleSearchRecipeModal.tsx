/**
 * Google Search Recipe Modal
 * Opens Google search with ingredients, allows copying recipe URLs and importing recipes
 */

import React, { useState, useEffect, useMemo } from 'react';
import { recipeImportService } from '../../services';
import type { RecipeImportResult } from '../../types/recipeImport';
import { showToast } from '../Toast';

interface GoogleSearchRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredients: string[];
  onRecipeImported: (recipe: RecipeImportResult, dishName: string) => void;
}

export const GoogleSearchRecipeModal: React.FC<GoogleSearchRecipeModalProps> = ({
  isOpen,
  onClose,
  ingredients,
  onRecipeImported
}) => {
  const [copiedUrl, setCopiedUrl] = useState('');
  const [pastedUrl, setPastedUrl] = useState('');
  const [importingRecipe, setImportingRecipe] = useState(false);
  const [importedRecipe, setImportedRecipe] = useState<RecipeImportResult | null>(null);
  const [dishName, setDishName] = useState('');
  const [saving, setSaving] = useState(false);

  // Build Google search URL with ingredients
  const searchUrl = useMemo(() => {
    if (ingredients.length === 0) return '';
    const query = `${ingredients.join(' ')} recipe`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }, [ingredients]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCopiedUrl('');
      setPastedUrl('');
      setImportedRecipe(null);
      setDishName('');
      setImportingRecipe(false);
      setSaving(false);
    }
  }, [isOpen]);

  // Auto-set dish name from imported recipe
  useEffect(() => {
    if (importedRecipe && importedRecipe.title && !dishName.trim()) {
      setDishName(importedRecipe.title);
    }
  }, [importedRecipe, dishName]);

  const handleCopyUrl = async () => {
    if (!copiedUrl.trim()) {
      showToast('Please enter a URL to copy', 'warning');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(copiedUrl);
      showToast('URL copied to clipboard!', 'success');
    } catch (error) {
      console.error('Failed to copy URL:', error);
      showToast('Failed to copy URL. Please try again.', 'error');
    }
  };

  const handlePasteUrl = async () => {
    if (!pastedUrl.trim()) {
      showToast('Please paste a recipe URL', 'warning');
      return;
    }

    // Validate URL
    try {
      new URL(pastedUrl);
    } catch {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    setImportingRecipe(true);
    try {
      const recipe = await recipeImportService.importRecipe(pastedUrl);
      setImportedRecipe(recipe);
      if (recipe.title && !dishName.trim()) {
        setDishName(recipe.title);
      }
      showToast('Recipe imported successfully!', 'success');
    } catch (error: any) {
      console.error('Error importing recipe:', error);
      showToast(error.message || 'Failed to import recipe. Please try again.', 'error');
    } finally {
      setImportingRecipe(false);
    }
  };

  const handleSaveRecipe = () => {
    if (!dishName.trim()) {
      showToast('Please enter a dish name', 'error');
      return;
    }

    if (!importedRecipe) {
      showToast('Please import a recipe first', 'error');
      return;
    }

    setSaving(true);
    try {
      onRecipeImported(importedRecipe, dishName.trim());
      showToast('Recipe added to dish ingredients!', 'success');
      onClose();
    } catch (error) {
      console.error('Error saving recipe:', error);
      showToast('Failed to save recipe. Please try again.', 'error');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1004,
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          maxWidth: '1200px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid #e5e7eb', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
            Search Recipes on Google
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem 0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Search Info */}
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>
              Searching for:
            </p>
            <p style={{ margin: 0, fontSize: '1rem', color: '#1f2937', fontWeight: '600' }}>
              {ingredients.join(', ')} recipe
            </p>
          </div>

          {/* Google Search iframe */}
          <div style={{ flex: 1, minHeight: '500px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
            <iframe
              src={searchUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: '500px'
              }}
              title="Google Recipe Search"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          </div>

          {/* Copy URL Section */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Copy Recipe URL from Google Results:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={copiedUrl}
                onChange={(e) => setCopiedUrl(e.target.value)}
                placeholder="Paste recipe URL here after copying from Google results..."
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  color: '#1f2937'
                }}
              />
              <button
                onClick={handleCopyUrl}
                disabled={!copiedUrl.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: copiedUrl.trim() ? '#002B4D' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: copiedUrl.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Paste URL and Import Section */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Paste Recipe URL to Import Ingredients:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="url"
                value={pastedUrl}
                onChange={(e) => setPastedUrl(e.target.value)}
                placeholder="https://example.com/recipe"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  color: '#1f2937'
                }}
              />
              <button
                onClick={handlePasteUrl}
                disabled={!pastedUrl.trim() || importingRecipe}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: (!pastedUrl.trim() || importingRecipe) ? '#9ca3af' : '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: (!pastedUrl.trim() || importingRecipe) ? 'not-allowed' : 'pointer'
                }}
              >
                {importingRecipe ? 'Importing...' : 'Import Recipe'}
              </button>
            </div>

            {importedRecipe && (
              <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#166534', fontWeight: '500' }}>
                  ✓ Recipe imported: {importedRecipe.title}
                </p>
                {importedRecipe.ingredients && importedRecipe.ingredients.length > 0 && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#15803d' }}>
                    {importedRecipe.ingredients.length} ingredient{importedRecipe.ingredients.length !== 1 ? 's' : ''} found
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Dish Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
              Dish Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="Enter dish name (required)"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                color: '#1f2937'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '1.5rem', 
          borderTop: '1px solid #e5e7eb', 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'flex-end' 
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveRecipe}
            disabled={!dishName.trim() || !importedRecipe || saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: (!dishName.trim() || !importedRecipe || saving) ? '#9ca3af' : '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: (!dishName.trim() || !importedRecipe || saving) ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Add to Dish'}
          </button>
        </div>
      </div>
    </div>
  );
};
