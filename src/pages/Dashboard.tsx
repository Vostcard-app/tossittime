import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { foodItemService } from '../services/firebaseService';
import FoodItemCard from '../components/FoodItemCard';
import HamburgerMenu from '../components/HamburgerMenu';

type FilterType = 'all' | 'fresh' | 'expiring_soon' | 'expired';

const Dashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const filteredItems = useMemo(() => {
    if (filter === 'all') return foodItems;
    return foodItems.filter(item => item.status === filter);
  }, [foodItems, filter]);

  const handleDelete = async (itemId: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await foodItemService.deleteFoodItem(itemId);
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item. Please try again.');
      }
    }
  };

  const handleMarkUsed = async (itemId: string) => {
    try {
      await foodItemService.deleteFoodItem(itemId);
    } catch (error) {
      console.error('Error marking item as used:', error);
      alert('Failed to mark item as used. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading your food items...</p>
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
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
            My Food Items
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={() => navigate('/add')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: '44px', // Touch target size for mobile
                minWidth: '44px'
              }}
            >
              + Add Item
            </button>
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
                width: '44px', // Touch target size for mobile
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
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['all', 'fresh', 'expiring_soon', 'expired'] as FilterType[]).map((filterType) => (
          <button
            key={filterType}
            onClick={() => setFilter(filterType)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filter === filterType ? '#002B4D' : '#f3f4f6',
              color: filter === filterType ? 'white' : '#1f2937',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {filterType.replace('_', ' ')} ({filterType === 'all' ? foodItems.length : foodItems.filter(i => i.status === filterType).length})
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
            {filter === 'all' ? 'No food items yet.' : `No ${filter.replace('_', ' ')} items.`}
          </p>
          <p style={{ marginBottom: '1.5rem' }}>
            {filter === 'all' ? 'Add your first food item to start tracking expiration dates!' : 'Try a different filter.'}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => navigate('/add')}
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
              Add Your First Item
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {filteredItems.map((item) => (
            <FoodItemCard
              key={item.id}
              item={item}
              onClick={() => navigate(`/item/${item.id}`)}
              onDelete={() => handleDelete(item.id)}
              onMarkUsed={() => handleMarkUsed(item.id)}
            />
          ))}
        </div>
      )}
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Dashboard;

