import React from 'react';
import type { FoodItem } from '../types';
import { formatDate, formatRelativeDate } from '../utils/dateUtils';
import StatusBadge from './StatusBadge';

interface FoodItemCardProps {
  item: FoodItem;
  onClick?: () => void;
  onDelete?: () => void;
  onMarkUsed?: () => void;
}

const FoodItemCard: React.FC<FoodItemCardProps> = ({ item, onClick, onDelete, onMarkUsed }) => {

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '1rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
        border: `1px solid ${item.status === 'expired' ? '#fee2e2' : item.status === 'expiring_soon' ? '#fef3c7' : '#dcfce7'}`,
        marginBottom: '1rem'
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#1f2937', flex: 1 }}>
          {item.name}
        </h3>
        <StatusBadge status={item.status} />
      </div>

      {item.photoUrl && (
        <img
          src={item.photoUrl}
          alt={item.name}
          style={{
            width: '100%',
            height: '150px',
            objectFit: 'cover',
            borderRadius: '8px',
            marginBottom: '0.75rem'
          }}
        />
      )}

      <div style={{ marginBottom: '0.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
          <strong>{item.isFrozen ? 'Thaws' : 'Expires'}:</strong> {
            item.isFrozen && item.thawDate 
              ? formatDate(item.thawDate)
              : item.expirationDate 
                ? formatDate(item.expirationDate)
                : 'No date'
          }
        </p>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
          {item.isFrozen && item.thawDate
            ? formatRelativeDate(item.thawDate)
            : item.expirationDate
              ? formatRelativeDate(item.expirationDate)
              : ''
          }
        </p>
      </div>

      {item.quantity && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          <strong>Quantity:</strong> {item.quantity}
        </p>
      )}

      {item.category && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
          <strong>Category:</strong> {item.category}
        </p>
      )}

      {item.notes && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
          {item.notes}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        {onMarkUsed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkUsed();
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Mark as Used
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
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
        )}
      </div>
    </div>
  );
};

export default FoodItemCard;

