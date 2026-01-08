/**
 * Favorite Websites Page
 * Manage favorite and suggested recipe websites
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { recipeSiteService } from '../services';
import type { RecipeSite } from '../types/recipeImport';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { showToast } from '../components/Toast';

const FavoriteWebsites: React.FC = () => {
  const [user] = useAuthState(auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [allSites, setAllSites] = useState<RecipeSite[]>([]);
  const [favoriteSites, setFavoriteSites] = useState<RecipeSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSite, setEditingSite] = useState<RecipeSite | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editSearchTemplateUrl, setEditSearchTemplateUrl] = useState('');
  const [showAddNew, setShowAddNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newSearchTemplateUrl, setNewSearchTemplateUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Load recipe sites
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadSites = async () => {
      try {
        setLoading(true);
        const sites = await recipeSiteService.getRecipeSites();
        setAllSites(sites);
        
        // For now, treat enabled sites as favorites (can be enhanced later with user preferences)
        const enabled = sites.filter(site => site.enabled);
        setFavoriteSites(enabled);
      } catch (error) {
        console.error('Error loading recipe sites:', error);
        showToast('Failed to load recipe sites', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadSites();
  }, [user]);

  const handleToggleFavorite = async (site: RecipeSite) => {
    if (!user) return;

    try {
      // Toggle enabled status (for now, this acts as favorite)
      await recipeSiteService.updateRecipeSite(site.id, {
        enabled: !site.enabled
      });
      
      // Reload sites
      const sites = await recipeSiteService.getRecipeSites();
      setAllSites(sites);
      const enabled = sites.filter(s => s.enabled);
      setFavoriteSites(enabled);
      
      showToast(site.enabled ? 'Removed from favorites' : 'Added to favorites', 'success');
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Failed to update favorite', 'error');
    }
  };

  const handleStartEdit = (site: RecipeSite) => {
    setEditingSite(site);
    setEditLabel(site.label);
    setEditBaseUrl(site.baseUrl);
    setEditSearchTemplateUrl(site.searchTemplateUrl);
  };

  const handleCancelEdit = () => {
    setEditingSite(null);
    setEditLabel('');
    setEditBaseUrl('');
    setEditSearchTemplateUrl('');
  };

  const handleSaveEdit = async () => {
    if (!user || !editingSite) return;

    if (!editLabel.trim() || !editBaseUrl.trim()) {
      showToast('Please fill in Label and Base URL', 'error');
      return;
    }

    try {
      await recipeSiteService.updateRecipeSite(editingSite.id, {
        label: editLabel.trim(),
        baseUrl: editBaseUrl.trim(),
        searchTemplateUrl: editSearchTemplateUrl.trim() || '', // Allow empty
        enabled: editingSite.enabled
      });
      
      // Reload sites
      const sites = await recipeSiteService.getRecipeSites();
      setAllSites(sites);
      const enabled = sites.filter(s => s.enabled);
      setFavoriteSites(enabled);
      
      setEditingSite(null);
      setEditLabel('');
      setEditBaseUrl('');
      setEditSearchTemplateUrl('');
      
      showToast('Website updated successfully', 'success');
    } catch (error) {
      console.error('Error updating website:', error);
      showToast('Failed to update website', 'error');
    }
  };

  const handleAddNew = async () => {
    if (!user) return;

    if (!newLabel.trim() || !newBaseUrl.trim()) {
      showToast('Please fill in Label and Base URL', 'error');
      return;
    }

    setSaving(true);
    try {
      await recipeSiteService.createRecipeSite({
        label: newLabel.trim(),
        baseUrl: newBaseUrl.trim(),
        searchTemplateUrl: newSearchTemplateUrl.trim() || '', // Allow empty
        enabled: true // Add as favorite by default
      });
      
      // Reload sites
      const sites = await recipeSiteService.getRecipeSites();
      setAllSites(sites);
      const enabled = sites.filter(s => s.enabled);
      setFavoriteSites(enabled);
      
      setShowAddNew(false);
      setNewLabel('');
      setNewBaseUrl('');
      setNewSearchTemplateUrl('');
      
      showToast('Website added successfully', 'success');
    } catch (error) {
      console.error('Error creating website:', error);
      showToast('Failed to create website', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAddNew = () => {
    setShowAddNew(false);
    setNewLabel('');
    setNewBaseUrl('');
    setNewSearchTemplateUrl('');
  };

  const handleAddToFavorites = async (site: RecipeSite) => {
    if (!user) return;

    try {
      await recipeSiteService.updateRecipeSite(site.id, {
        enabled: true
      });
      
      // Reload sites
      const sites = await recipeSiteService.getRecipeSites();
      setAllSites(sites);
      const enabled = sites.filter(s => s.enabled);
      setFavoriteSites(enabled);
      
      showToast('Added to favorites', 'success');
    } catch (error) {
      console.error('Error adding to favorites:', error);
      showToast('Failed to add to favorites', 'error');
    }
  };

  // Get sites that are not favorites
  const nonFavoriteSites = allSites.filter(site => !site.enabled);

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to manage favorite websites.</p>
      </div>
    );
  }


  return (
    <>
      <Banner showHomeIcon={true} onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Favorite Recipe Websites</h2>
          <button
            onClick={() => setShowAddNew(true)}
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
            + Add New Website
          </button>
        </div>

        {/* Add New Website Form */}
        {showAddNew && (
          <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600' }}>Add New Website</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Label:
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., AllRecipes"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Base URL:
                </label>
                <input
                  type="url"
                  value={newBaseUrl}
                  onChange={(e) => setNewBaseUrl(e.target.value)}
                  placeholder="https://www.allrecipes.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Search Template URL (optional - use {`{query}`} for search term):
                </label>
                <input
                  type="text"
                  value={newSearchTemplateUrl}
                  onChange={(e) => setNewSearchTemplateUrl(e.target.value)}
                  placeholder="https://example.com/search?q={query} (leave empty if site has no search)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                  If left empty, the base URL will open and you can paste ingredients manually.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCancelAddNew}
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
                  onClick={handleAddNew}
                  disabled={saving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: saving ? '#9ca3af' : '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Adding...' : 'Add Website'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Favorite Websites List */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
            Favorites ({favoriteSites.length})
          </h3>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading websites...</p>
          ) : favoriteSites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <p>No favorite websites yet. Add websites below or create a new one.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {favoriteSites.map(site => (
                <div
                  key={site.id}
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                >
                  {editingSite?.id === site.id ? (
                    /* Edit Mode */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Label:
                        </label>
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Base URL:
                        </label>
                        <input
                          type="url"
                          value={editBaseUrl}
                          onChange={(e) => setEditBaseUrl(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Search Template URL (optional - use {`{query}`} for search term):
                        </label>
                        <input
                          type="text"
                          value={editSearchTemplateUrl}
                          onChange={(e) => setEditSearchTemplateUrl(e.target.value)}
                          placeholder="https://example.com/search?q={query} (leave empty if site has no search)"
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            boxSizing: 'border-box'
                          }}
                        />
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                          If left empty, the base URL will open and you can paste ingredients manually.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={handleCancelEdit}
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
                          onClick={handleSaveEdit}
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
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
                          {site.label}
                        </h3>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                          {site.baseUrl}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          {site.searchTemplateUrl ? `Search: ${site.searchTemplateUrl}` : 'No search URL - paste ingredients manually'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleStartEdit(site)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#f3f4f6',
                            color: '#1f2937',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleFavorite(site)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            minWidth: '120px'
                          }}
                        >
                          ★ Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Available Websites */}
        {nonFavoriteSites.length > 0 && (
          <div>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: '600' }}>
              Available Websites ({nonFavoriteSites.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {nonFavoriteSites.map(site => (
                <div
                  key={site.id}
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
                      {site.label}
                    </h3>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      {site.baseUrl}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                      Search: {site.searchTemplateUrl}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAddToFavorites(site)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      minWidth: '120px'
                    }}
                  >
                    ☆ Add to Favorites
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Info */}
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#1f2937' }}>
            <strong>Tip:</strong> Favorite websites will appear first when searching for recipes. You can toggle favorites by clicking the button next to each website.
          </p>
        </div>
      </div>
    </>
  );
};

export default FavoriteWebsites;
