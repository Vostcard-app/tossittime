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
  const [favoriteSites, setFavoriteSites] = useState<RecipeSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSite, setEditingSite] = useState<RecipeSite | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editSearchTemplateUrl, setEditSearchTemplateUrl] = useState('');

  // Load recipe sites
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadSites = async () => {
      try {
        setLoading(true);
        const allSites = await recipeSiteService.getRecipeSites();
        
        // For now, treat enabled sites as favorites (can be enhanced later with user preferences)
        const enabled = allSites.filter(site => site.enabled);
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
      const allSites = await recipeSiteService.getRecipeSites();
      const enabled = allSites.filter(s => s.enabled);
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

    if (!editLabel.trim() || !editBaseUrl.trim() || !editSearchTemplateUrl.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    try {
      await recipeSiteService.updateRecipeSite(editingSite.id, {
        label: editLabel.trim(),
        baseUrl: editBaseUrl.trim(),
        searchTemplateUrl: editSearchTemplateUrl.trim(),
        enabled: editingSite.enabled
      });
      
      // Reload sites
      const allSites = await recipeSiteService.getRecipeSites();
      const enabled = allSites.filter(s => s.enabled);
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
        <h2 style={{ marginBottom: '1rem' }}>Favorite Recipe Websites</h2>

        {/* Website List */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading websites...</p>
        ) : favoriteSites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <p>No favorite websites available.</p>
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
                        Search Template URL (use {`{query}`} for search term):
                      </label>
                      <input
                        type="text"
                        value={editSearchTemplateUrl}
                        onChange={(e) => setEditSearchTemplateUrl(e.target.value)}
                        placeholder="https://example.com/search?q={query}"
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
                        Search: {site.searchTemplateUrl}
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
