import React, { useState, useRef, useEffect } from 'react';
import type { FoodItem } from '../types';
import { formatDate } from '../utils/dateUtils';

interface SwipeableListItemProps {
  item: FoodItem;
  onDelete: () => void;
  onClick?: () => void;
  onEdit?: () => void;
}

const SwipeableListItem: React.FC<SwipeableListItemProps> = ({ item, onDelete, onClick, onEdit }) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);
  const SWIPE_THRESHOLD = 100; // Minimum swipe distance to trigger delete

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    // Only allow swiping right (positive diff)
    if (diff > 0) {
      setTranslateX(Math.min(diff, SWIPE_THRESHOLD * 2));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (translateX >= SWIPE_THRESHOLD) {
      // Show confirmation before deleting
      const confirmed = window.confirm('Are you sure you want to delete this item?');
      if (confirmed) {
        onDelete();
      }
      setTranslateX(0);
      return; // Don't trigger onClick after delete
    } else {
      // Snap back
      setTranslateX(0);
      // If no swipe occurred and onClick is provided, trigger click
      if (translateX < 10 && onClick) {
        onClick();
      }
    }
  };

  // Handle mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
  };

  // Add global mouse move/up listeners when dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        if (diff > 0) {
          setTranslateX(Math.min(diff, SWIPE_THRESHOLD * 2));
        }
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
        if (translateX >= SWIPE_THRESHOLD) {
          // Show confirmation before deleting
          const confirmed = window.confirm('Are you sure you want to delete this item?');
          if (confirmed) {
            onDelete();
          }
          setTranslateX(0);
          return; // Don't trigger onClick after delete
        } else {
          setTranslateX(0);
          // If no swipe occurred and onClick is provided, trigger click
          if (translateX < 10 && onClick) {
            onClick();
          }
        }
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, startX, translateX, onDelete]);

  const deleteOpacity = Math.min(translateX / SWIPE_THRESHOLD, 1);

  return (
    <div
      ref={itemRef}
      style={{
        position: 'relative',
        width: '100%',
        marginBottom: '0.5rem',
        overflow: 'hidden',
        touchAction: 'pan-y'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      {/* Delete background indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '1rem',
          opacity: deleteOpacity,
          zIndex: 1
        }}
      >
        <span style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>
          Delete
        </span>
      </div>

      {/* Item content */}
      <div
        onClick={(e) => {
          // Only trigger onClick if not dragging/swiping and delete/edit buttons weren't clicked
          const target = e.target as HTMLElement;
          const isDeleteButton = target.closest('button[aria-label="Delete item"]');
          const isEditButton = target.closest('button[aria-label="Edit item"]');
          if (!isDragging && translateX < 10 && !isDeleteButton && !isEditButton && onClick) {
            onClick();
          }
        }}
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: isDragging ? 'grabbing' : (onClick ? 'pointer' : 'grab')
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
            {item.name}
          </span>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {item.isFrozen ? 'Thaws' : 'Expires'}
          </span>
          <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: '500' }}>
            {item.isFrozen && item.thawDate 
              ? formatDate(item.thawDate)
              : item.expirationDate 
                ? formatDate(item.expirationDate)
                : 'No date'
            }
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '36px',
                minHeight: '36px',
                zIndex: 10,
                position: 'relative'
              }}
              aria-label="Edit item"
            >
              ✏️
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Show confirmation before deleting
              const confirmed = window.confirm('Are you sure you want to delete this item?');
              if (confirmed) {
                onDelete();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
              minHeight: '36px'
            }}
            aria-label="Delete item"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwipeableListItem;

