import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import type { FoodItem } from '../types';
import { foodItemService } from '../services';
import { formatDate, formatRelativeDate } from '../utils/dateUtils';
import { getDryGoodsShelfLife } from '../services/shelfLifeService';
import { findFoodItem } from '../services/foodkeeperService';
import StatusBadge from '../components/ui/StatusBadge';

const ItemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [item, setItem] = useState<FoodItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadItem = async () => {
      if (!id || !user) return;

      try {
        const docRef = doc(db, 'foodItems', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const foodItem: FoodItem = {
            id: docSnap.id,
            ...data,
            bestByDate: data.expirationDate?.toDate(), // Map Firestore expirationDate to bestByDate
            addedDate: data.addedDate.toDate()
          } as FoodItem;

          if (foodItem.userId !== user.uid) {
            alert('You do not have permission to view this item');
            navigate('/dashboard');
            return;
          }

          setItem(foodItem);
          
          // Get quality message for dry/canned goods
          if (foodItem.isDryCanned && foodItem.bestByDate) {
            const foodKeeperItem = findFoodItem(foodItem.name);
            const shelfLifeResult = getDryGoodsShelfLife(foodItem.name, foodKeeperItem || null);
            if (shelfLifeResult && shelfLifeResult.qualityMessage) {
              setQualityMessage(shelfLifeResult.qualityMessage);
            }
          }
        } else {
          alert('Food item not found');
          navigate('/');
        }
      } catch (error) {
        console.error('Error loading item:', error);
        alert('Failed to load food item');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    loadItem();
  }, [id, user, navigate]);

  const handleDelete = async () => {
    if (!item || !window.confirm('Are you sure you want to delete this item?')) return;

    try {
      await foodItemService.deleteFoodItem(item.id);
      navigate('/');
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleMarkUsed = async () => {
    if (!item) return;

    try {
      await foodItemService.deleteFoodItem(item.id);
      navigate('/');
    } catch (error) {
      console.error('Error marking item as used:', error);
      alert('Failed to mark item as used. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: 'transparent',
          color: '#002B4D',
          border: '1px solid #002B4D',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: 'pointer',
          marginBottom: '1.5rem'
        }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
            {item.name}
          </h1>
          <StatusBadge status={item.status} />
        </div>

        {item.photoUrl && (
          <img
            src={item.photoUrl}
            alt={item.name}
            style={{
              width: '100%',
              maxHeight: '400px',
              objectFit: 'cover',
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}
          />
        )}

        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
            {item.isFrozen ? 'Thaw Date' : 'Best By Date'}
          </h3>
          <p style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937' }}>
            {item.isFrozen && item.thawDate
              ? formatDate(item.thawDate)
              : item.bestByDate
                ? formatDate(item.bestByDate)
                : 'No date'
            }
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
            {item.isFrozen && item.thawDate
              ? formatRelativeDate(item.thawDate)
              : item.bestByDate
                ? formatRelativeDate(item.bestByDate)
                : ''
            }
          </p>
          {/* Show quality message for dry/canned goods */}
          {item.isDryCanned && qualityMessage && (
            <p style={{ 
              margin: '0.5rem 0 0 0', 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              fontStyle: 'italic' 
            }}>
              {qualityMessage}
            </p>
          )}
        </div>

        {item.quantity && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
              Quantity
            </h3>
            <p style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937' }}>
              {item.quantity} {item.isDryCanned && item.quantityUnit ? item.quantityUnit : ''}
            </p>
          </div>
        )}

        {item.category && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
              Category
            </h3>
            <p style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937' }}>
              {item.category}
            </p>
          </div>
        )}

        {item.barcode && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
              Barcode
            </h3>
            <p style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937', fontFamily: 'monospace' }}>
              {item.barcode}
            </p>
          </div>
        )}

        {item.notes && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
              Notes
            </h3>
            <p style={{ margin: 0, fontSize: '1.125rem', color: '#1f2937', whiteSpace: 'pre-wrap' }}>
              {item.notes}
            </p>
          </div>
        )}

        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleMarkUsed}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Mark as Used
          </button>
          <button
            onClick={handleDelete}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemDetail;

