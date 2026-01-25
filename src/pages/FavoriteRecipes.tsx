/**
 * Favorite Recipes Page
 * Display and manage favorite recipes with Plan functionality
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { favoriteRecipeService } from '../services';
import type { FavoriteRecipe } from '../types';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { showToast } from '../components/Toast';

const FavoriteRecipes: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [favoriteRecipes, setFavoriteRecipes] = useState<FavoriteRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  // Load favorite recipes
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = favoriteRecipeService.subscribeToFavoriteRecipes(
      user.uid,
      (recipes) => {
        setFavoriteRecipes(recipes);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handlePlanRecipe = (recipe: FavoriteRecipe) => {
    // Navigate to planned meal calendar with recipe data
    navigate('/planned-meal-calendar', {
      state: {
        favoriteRecipe: recipe
      }
    });
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!user) return;

    try {
      await favoriteRecipeService.deleteFavoriteRecipe(recipeId);
      showToast('Recipe removed from favorites', 'success');
    } catch (error) {
      console.error('Error deleting favorite recipe:', error);
      showToast('Failed to remove recipe from favorites', 'error');
    }
  };

  if (loading) {
    return (
      <>
        <Banner onMenuClick={() => setMenuOpen(true)} />
        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Loading favorite recipes...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Banner onMenuClick={() => setMenuOpen(true)} />
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.75rem', fontWeight: '600' }}>
          Favorite Recipes
        </h1>

        {favoriteRecipes.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No favorite recipes yet. Add recipes to favorites when saving dishes.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {favoriteRecipes.map((recipe) => (
              <div
                key={recipe.id}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}
              >
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>
                    {recipe.recipeTitle || recipe.dishName}
                  </h3>
                  {recipe.recipeSourceUrl && (
                    <a
                      href={recipe.recipeSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.875rem',
                        color: '#3b82f6',
                        textDecoration: 'none'
                      }}
                    >
                      {recipe.recipeSourceDomain || recipe.recipeSourceUrl}
                    </a>
                  )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '500', color: '#374151' }}>
                    Ingredients:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    {recipe.recipeIngredients.map((ingredient, index) => (
                      <li key={index}>{ingredient}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => handlePlanRecipe(recipe)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#002B4D',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Plan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default FavoriteRecipes;
