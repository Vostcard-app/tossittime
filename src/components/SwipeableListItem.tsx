import React, { useState, useRef, useEffect } from 'react';
import type { FoodItem } from '../types';
import { formatDate } from '../utils/dateUtils';

interface SwipeableListItemProps {
  item: FoodItem;
  onDelete: () => void;
}

const SwipeableListItem: React.FC<SwipeableListItemProps> = ({ item, onDelete }) => {
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
      // Trigger delete
      onDelete();
      setTranslateX(0);
    } else {
      // Snap back
      setTranslateX(0);
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
          onDelete();
          setTranslateX(0);
        } else {
          setTranslateX(0);
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
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div style={{ flex: 1, fontSize: '1rem', fontWeight: '500', color: '#1f2937' }}>
          {item.name}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
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
            marginLeft: '0.5rem'
          }}
          aria-label="Delete item"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

export default SwipeableListItem;

