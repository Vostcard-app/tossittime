/**
 * Website Selection Modal
 * Displays recipe websites with tabs for favorites and suggested sites
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipeSiteService } from '../../services';
import type { RecipeSite } from '../../types/recipeImport';
import type { MealType } from '../../types';
import { RecipeImportScreen } from './RecipeImportScreen';
import { CustomMealIngredientScreen } from './CustomMealIngredientScreen';
import { showToast } from '../Toast';

interface WebsiteSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIngredients: string[];
  selectedDate: Date;
  selectedMealType: MealType;
}

export const WebsiteSelectionModal: React.FC<WebsiteSelectionModalProps> = ({
  isOpen,
  onClose,
  selectedIngredients,
  selectedDate,
  selectedMealType
}) => {
  const navigate = useNavigate();
  const [favoriteSites, setFavoriteSites] = useState<RecipeSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'google' | 'favorites' | 'createMyOwn'>('google');
  const [showRecipeImport, setShowRecipeImport] = useState(false);
  const [showCustomMeal, setShowCustomMeal] = useState(false);
  const [customIngredients, setCustomIngredients] = useState<string[]>([]);
  const [newIngredientInput, setNewIngredientInput] = useState('');

  // Load recipe sites
  useEffect(() => {
    if (!isOpen) return;

    const loadSites = async () => {
      try {
        setLoading(true);
        const allSites = await recipeSiteService.getRecipeSites();
        
        // For now, treat enabled sites as favorites (can be enhanced later with user preferences)
        const enabled = allSites.filter(site => site.enabled);
        setFavoriteSites(enabled);
      } catch (error) {
        console.error('Error loading recipe sites:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSites();
  }, [isOpen]);

  // Initialize custom ingredients from selected ingredients
  useEffect(() => {
    if (isOpen) {
      setCustomIngredients([...selectedIngredients]);
      setNewIngredientInput('');
    }
  }, [isOpen, selectedIngredients]);

  const handleAddIngredient = () => {
    const trimmed = newIngredientInput.trim();
    if (trimmed && !customIngredients.includes(trimmed)) {
      setCustomIngredients([...customIngredients, trimmed]);
      setNewIngredientInput('');
    }
  };

  const handleRemoveIngredient = (index: number) => {
    setCustomIngredients(customIngredients.filter((_, i) => i !== index));
  };

  const handleContinueToChecklist = () => {
    if (customIngredients.length === 0) {
      showToast('Please add at least one ingredient', 'error');
      return;
    }
    setShowCustomMeal(true);
  };

  const handleSearchSite = (site: RecipeSite) => {
    const query = selectedIngredients.join(' ');
    // Always open base URL - users will paste ingredients manually on the site
    window.open(site.baseUrl, '_blank');
    // Show reminder with ingredients to paste
    showToast(`Opened ${site.label}. Paste your ingredients: ${query}`, 'info');
  };

  const handleGoogleSearch = () => {
    const query = selectedIngredients.join(' ') + ' recipe';
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(googleSearchUrl, '_blank');
  };

  const handleManageFavorites = () => {
    navigate('/favorite-websites');
    onClose();
  };

  if (!isOpen) return null;

  // If showing recipe import screen, render that instead
  if (showRecipeImport) {
    return (
      <RecipeImportScreen
        isOpen={showRecipeImport}
        onClose={() => {
          setShowRecipeImport(false);
          onClose();
        }}
        selectedDate={selectedDate}
        selectedMealType={selectedMealType}
        selectedIngredients={selectedIngredients}
      />
    );
  }

  // If showing custom meal screen, render that instead
  if (showCustomMeal) {
    return (
      <CustomMealIngredientScreen
        isOpen={showCustomMeal}
        onClose={() => {
          setShowCustomMeal(false);
          onClose();
        }}
        selectedDate={selectedDate}
        selectedMealType={selectedMealType}
        ingredients={customIngredients}
      />
    );
  }

  const displayedSites = activeTab === 'favorites' ? favoriteSites : [];

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
        zIndex: 1001,
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
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Select Recipe</h2>
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
        <div style={{ padding: '1.5rem' }}>
          {/* Instructions */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '6px' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#1f2937' }}>
              <strong>Selected ingredients:</strong> {selectedIngredients.join(', ')}
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Click on a website to search for recipes. Once you find a recipe, copy its URL and return here to paste it.
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setActiveTab('google')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: activeTab === 'google' ? '#002B4D' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'google' ? '2px solid #002B4D' : '2px solid transparent',
                fontSize: '1rem',
                fontWeight: activeTab === 'google' ? '600' : '500',
                cursor: 'pointer'
              }}
            >
              Google
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: activeTab === 'favorites' ? '#002B4D' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'favorites' ? '2px solid #002B4D' : '2px solid transparent',
                fontSize: '1rem',
                fontWeight: activeTab === 'favorites' ? '600' : '500',
                cursor: 'pointer'
              }}
            >
              Favorites
            </button>
            <button
              onClick={() => setActiveTab('createMyOwn')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: activeTab === 'createMyOwn' ? '#002B4D' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'createMyOwn' ? '2px solid #002B4D' : '2px solid transparent',
                fontSize: '1rem',
                fontWeight: activeTab === 'createMyOwn' ? '600' : '500',
                cursor: 'pointer'
              }}
            >
              Create My Own
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'createMyOwn' ? (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
                Add Ingredients
              </h3>
              
              {/* Selected Ingredients List */}
              {customIngredients.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#6b7280' }}>
                    Ingredients ({customIngredients.length})
                  </div>
                  <div style={{ 
                    border: '1px solid #e5e7eb', 
                    borderRadius: '6px', 
                    padding: '0.5rem',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {customIngredients.map((ingredient, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '4px',
                          marginBottom: '0.25rem'
                        }}
                      >
                        <span style={{ flex: 1, fontSize: '0.875rem' }}>{ingredient}</span>
                        <button
                          onClick={() => handleRemoveIngredient(index)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: '500'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Ingredient Input */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={newIngredientInput}
                    onChange={(e) => setNewIngredientInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddIngredient();
                      }
                    }}
                    placeholder="Enter ingredient name"
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={handleAddIngredient}
                    disabled={!newIngredientInput.trim()}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: newIngredientInput.trim() ? '#002B4D' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: newIngredientInput.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Continue Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleContinueToChecklist}
                  disabled={customIngredients.length === 0}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: customIngredients.length === 0 ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: customIngredients.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : activeTab === 'google' ? (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={handleGoogleSearch}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  backgroundColor: '#f9fafb',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                  e.currentTarget.style.borderColor = '#002B4D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: '600', color: '#4285F4' }}>G</div>
                <div style={{ fontWeight: '600', fontSize: '1.125rem', color: '#1f2937' }}>Search Google</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Search for recipes with: {selectedIngredients.join(', ')}
                </div>
              </button>
            </div>
          ) : loading ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading websites...</p>
          ) : displayedSites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                No favorite websites available.
              </p>
              <button
                onClick={handleManageFavorites}
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
                Manage Favorites
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {displayedSites.map(site => (
                <button
                  key={site.id}
                  onClick={() => handleSearchSite(site)}
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                >
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{site.label}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{site.baseUrl}</div>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={handleManageFavorites}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f3f4f6',
                color: '#1f2937',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Manage Favorites
            </button>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#f3f4f6',
                  color: '#1f2937',
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
                onClick={() => setShowRecipeImport(true)}
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
                Paste Recipe URL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
