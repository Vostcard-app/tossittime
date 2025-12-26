import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { userCategoriesService } from '../services/firebaseService';
import type { UserCategory, UserCategoryData } from '../types';
import HamburgerMenu from '../components/HamburgerMenu';

const EditCategories: React.FC = () => {
  const [user] = useAuthState(auth);
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<UserCategory | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to user categories
  useEffect(() => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }

    const unsubscribe = userCategoriesService.subscribeToUserCategories(
      user.uid,
      (cats) => {
        setCategories(cats);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  const handleEdit = (category: UserCategory) => {
    setEditingCategory(category);
  };

  const handleSave = async (updatedData: UserCategoryData) => {
    if (!user || !editingCategory) return;

    try {
      setError(null);
      await userCategoriesService.updateCategory(editingCategory.id, updatedData);
      setEditingCategory(null);
    } catch (err: any) {
      console.error('Error updating category:', err);
      setError(err.message || 'Failed to update category. Please try again.');
    }
  };

  const handleDelete = async (category: UserCategory) => {
    if (!user) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${category.name}"? This will remove it from your categories.`
    );

    if (!confirmed) return;

    try {
      await userCategoriesService.deleteCategory(category.id);
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category. Please try again.');
    }
  };

  const handleAdd = async (data: UserCategoryData) => {
    if (!user) return;

    try {
      setError(null);
      await userCategoriesService.createCategory(user.uid, data);
      setShowAddForm(false);
    } catch (err: any) {
      console.error('Error adding category:', err);
      setError(err.message || 'Failed to add category. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading categories...</p>
      </div>
    );
  }

  return (
    <>
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link 
              to="/shop" 
              style={{ 
                color: '#ffffff', 
                textDecoration: 'none', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#002B4D',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 43, 77, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#002B4D';
              }}
              aria-label="Go to shop"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* House base */}
                <rect x="6" y="12" width="12" height="8" fill="white" />
                {/* House roof */}
                <path d="M12 4L4 10H20L12 4Z" fill="white" />
                {/* Door */}
                <rect x="10" y="16" width="4" height="4" fill="#002B4D" />
              </svg>
            </Link>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
              TossItTime
            </h1>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Open menu"
          >
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            Edit Categories
          </h2>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
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
              Add Category
            </button>
          )}
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            color: '#991b1b'
          }}>
            {error}
          </div>
        )}

        {showAddForm && (
          <AddCategoryForm
            onSave={handleAdd}
            onCancel={() => {
              setShowAddForm(false);
              setError(null);
            }}
          />
        )}

        {categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              No categories yet.
            </p>
            <p>
              Add categories to organize your food items.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {categories.map((category) => (
              <div
                key={category.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
                    {category.name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleEdit(category)}
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
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={handleSave}
        />
      )}

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

// Add Category Form Component
interface AddCategoryFormProps {
  onSave: (data: UserCategoryData) => void;
  onCancel: () => void;
}

const AddCategoryForm: React.FC<AddCategoryFormProps> = ({ onSave, onCancel }) => {
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
    <div style={{
      padding: '1rem',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      marginBottom: '1rem'
    }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
        Add New Category
      </h3>

      {error && (
        <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
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
            onClick={onCancel}
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
  );
};

// Edit Category Modal Component
interface EditCategoryModalProps {
  category: UserCategory;
  onClose: () => void;
  onSave: (data: UserCategoryData) => void;
}

const EditCategoryModal: React.FC<EditCategoryModalProps> = ({ category, onClose, onSave }) => {
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(category.name);
  }, [category]);

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
        zIndex: 1000
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
          Edit Category
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
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCategories;

