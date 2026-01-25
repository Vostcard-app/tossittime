/**
 * SwipeableListItem Component
 * A list item that can be swiped right to reveal delete action
 * 
 * @example
 * ```tsx
 * <SwipeableListItem 
 *   item={foodItem}
 *   onDelete={() => handleDelete()}
 *   onClick={() => navigate('/item-detail')}
 * />
 * ```
 */

import React, { useState, useRef, useEffect } from 'react';
import type { FoodItem } from '../../types';
import { formatDate } from '../../utils/dateUtils';

interface SwipeableListItemProps {
  /** The food item to display */
  item: FoodItem;
  /** Callback when item is swiped and deleted */
  onDelete: () => void;
  /** Callback when item is clicked/tapped */
  onClick?: () => void;
  /** Callback when freeze button is clicked */
  onFreeze?: () => void;
  /** Optional: explicitly mark item as reserved (overrides usedByMeals check) */
  isReserved?: boolean;
  /** Callback when scan button is clicked (for Premium users) */
  onScan?: () => void;
  /** Whether to show scan button (Premium users only) */
  showScanButton?: boolean;
}

/**
 * SwipeableListItem component with swipe-to-delete functionality
 */
const SwipeableListItem: React.FC<SwipeableListItemProps> = React.memo(({ item, onDelete, onClick, onFreeze, isReserved, onScan, showScanButton }) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);
  const [, setGestureLock] = useState<'horizontal' | 'vertical' | null>(null); // Direction-locking state (using ref for value, state for updates)
  const itemRef = useRef<HTMLDivElement>(null);
  const translateXRef = useRef(0); // Track current translateX value to avoid stale state
  const gestureLockRef = useRef<'horizontal' | 'vertical' | null>(null); // Track current gestureLock value to avoid stale state
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timer for long press detection
  const SWIPE_THRESHOLD = 100; // Minimum swipe distance to trigger delete
  const DIRECTION_THRESHOLD = 12; // Minimum movement to determine gesture direction
  const LONG_PRESS_DURATION = 600; // milliseconds for long press
  const LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - cancel if moved more than this

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only handle if touch starts on this item
    if (!itemRef.current?.contains(e.target as Node)) return;
    
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsDragging(true);
    setIsHorizontalSwipe(false);
    setGestureLock(null); // Reset gesture lock on new touch
    gestureLockRef.current = null; // Reset ref as well
    translateXRef.current = 0;
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      // Long press detected - trigger delete
      const confirmed = window.confirm('Are you sure you want to remove this item?');
      if (confirmed) {
        onDelete();
      }
      // Reset states
      setIsDragging(false);
      setTranslateX(0);
      translateXRef.current = 0;
      setIsHorizontalSwipe(false);
      setGestureLock(null);
      gestureLockRef.current = null;
      longPressTimerRef.current = null;
    }, LONG_PRESS_DURATION);
  };

  // Use global touch listeners to capture events even from scrollable containers
  useEffect(() => {
    if (isDragging) {
      const handleGlobalTouchMove = (e: TouchEvent) => {
        // Only handle if we're dragging and the touch is related to our item
        if (!itemRef.current) return;
        
        const touch = e.touches[0];
        if (!touch) return;
        
        const currentX = touch.clientX;
        const currentY = touch.clientY;
        const diffX = currentX - startX;
        const diffY = currentY - startY;
        
        // Cancel long press if user moved too much
        if (Math.abs(diffX) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(diffY) > LONG_PRESS_MOVE_THRESHOLD) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
        
        // Calculate absolute distances
        const dx = Math.abs(diffX);
        const dy = Math.abs(diffY);
        
        // Direction-locking: detect gesture intent early
        // Use ref to get current value (state might be stale in closure)
        if (gestureLockRef.current === null) {
          // Determine direction based on first 12px of movement
          if (dx > dy && dx > DIRECTION_THRESHOLD) {
            setGestureLock('horizontal');
            gestureLockRef.current = 'horizontal';
            setIsHorizontalSwipe(true);
          } else if (dy > dx && dy > DIRECTION_THRESHOLD) {
            setGestureLock('vertical');
            gestureLockRef.current = 'vertical';
            // Reset any horizontal swipe state
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setIsDragging(false);
            return; // Allow vertical scroll
          }
        }
        
        // If locked to horizontal, handle swipe
        if (gestureLockRef.current === 'horizontal') {
          e.preventDefault(); // Prevent scrolling
          e.stopPropagation();
          
          // Allow swiping both left and right
          const maxSwipe = SWIPE_THRESHOLD * 2;
          const newTranslateX = Math.abs(diffX) <= maxSwipe ? diffX : (diffX > 0 ? maxSwipe : -maxSwipe);
          setTranslateX(newTranslateX);
          translateXRef.current = newTranslateX;
        }
        // If locked to vertical, do nothing - allow scroll
      };

      const handleGlobalTouchEnd = (e: TouchEvent) => {
        // Always clear long press timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        const finalTranslateX = translateXRef.current;
        setIsDragging(false);
        
        // Only handle swipe if gesture was locked to horizontal
        // Use ref to get current value (state might be stale in closure)
        if (gestureLockRef.current === 'horizontal') {
          if (Math.abs(finalTranslateX) >= SWIPE_THRESHOLD) {
            e.preventDefault();
            e.stopPropagation();
            // Show confirmation before removing
            const confirmed = window.confirm('Are you sure you want to remove this item?');
            if (confirmed) {
              onDelete();
            }
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setGestureLock(null);
            gestureLockRef.current = null;
            return;
          } else {
            // Snap back - didn't swipe far enough
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setGestureLock(null);
            gestureLockRef.current = null;
          }
        } else {
          // Vertical scroll or no gesture - just reset
          setTranslateX(0);
          translateXRef.current = 0;
          setIsHorizontalSwipe(false);
          setGestureLock(null);
          gestureLockRef.current = null;
        }
      };

      // Use capture phase to catch events before scrollable container
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false, capture: true });
      document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false, capture: true });
      document.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: false, capture: true });

      return () => {
        document.removeEventListener('touchmove', handleGlobalTouchMove, { capture: true });
        document.removeEventListener('touchend', handleGlobalTouchEnd, { capture: true });
        document.removeEventListener('touchcancel', handleGlobalTouchEnd, { capture: true });
        // Cleanup
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setIsDragging(false);
        setTranslateX(0);
        translateXRef.current = 0;
        setIsHorizontalSwipe(false);
        setGestureLock(null);
        gestureLockRef.current = null;
      };
    }
  }, [isDragging, startX, startY, isHorizontalSwipe, onDelete]);

  const handleTouchEnd = () => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // This is handled by global listener, but we keep it for compatibility
    setIsDragging(false);
  };

  // Handle mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setStartY(e.clientY);
    setIsDragging(true);
    setIsHorizontalSwipe(false);
    setGestureLock(null); // Reset gesture lock on new mouse down
    gestureLockRef.current = null; // Reset ref as well
    
    // Start long press timer for desktop testing
    longPressTimerRef.current = setTimeout(() => {
      // Long press detected - trigger delete
      const confirmed = window.confirm('Are you sure you want to remove this item?');
      if (confirmed) {
        onDelete();
      }
      // Reset states
      setIsDragging(false);
      setTranslateX(0);
      translateXRef.current = 0;
      setIsHorizontalSwipe(false);
      setGestureLock(null);
      gestureLockRef.current = null;
      longPressTimerRef.current = null;
    }, LONG_PRESS_DURATION);
  };

  // Add global mouse move/up listeners when dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const diffX = e.clientX - startX;
        const diffY = e.clientY - startY;
        
        // Cancel long press if user moved too much
        if (Math.abs(diffX) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(diffY) > LONG_PRESS_MOVE_THRESHOLD) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
        
        // Calculate absolute distances
        const dx = Math.abs(diffX);
        const dy = Math.abs(diffY);
        
        // Direction-locking: detect gesture intent early
        // Use ref to get current value (state might be stale in closure)
        if (gestureLockRef.current === null) {
          // Determine direction based on first 12px of movement
          if (dx > dy && dx > DIRECTION_THRESHOLD) {
            setGestureLock('horizontal');
            gestureLockRef.current = 'horizontal';
            setIsHorizontalSwipe(true);
          } else if (dy > dx && dy > DIRECTION_THRESHOLD) {
            setGestureLock('vertical');
            gestureLockRef.current = 'vertical';
            // Reset any horizontal swipe state
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setIsDragging(false);
            return; // Allow vertical scroll
          }
        }
        
        // If locked to horizontal, handle swipe
        if (gestureLockRef.current === 'horizontal') {
          // Allow swiping both left and right
          const maxSwipe = SWIPE_THRESHOLD * 2;
          const newTranslateX = Math.abs(diffX) <= maxSwipe ? diffX : (diffX > 0 ? maxSwipe : -maxSwipe);
          setTranslateX(newTranslateX);
          translateXRef.current = newTranslateX;
        }
        // If locked to vertical, do nothing - allow scroll
      };

      const handleGlobalMouseUp = () => {
        // Always clear long press timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        setIsDragging(false);
        const finalTranslateX = translateXRef.current;
        
        // Only handle swipe if gesture was locked to horizontal
        // Use ref to get current value (state might be stale in closure)
        if (gestureLockRef.current === 'horizontal') {
          if (Math.abs(finalTranslateX) >= SWIPE_THRESHOLD) {
            // Show confirmation before removing
            const confirmed = window.confirm('Are you sure you want to remove this item?');
            if (confirmed) {
              onDelete();
            }
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setGestureLock(null);
            gestureLockRef.current = null;
            return;
          } else {
            // Snap back - didn't swipe far enough
            setTranslateX(0);
            translateXRef.current = 0;
            setIsHorizontalSwipe(false);
            setGestureLock(null);
            gestureLockRef.current = null;
          }
        } else {
          // Vertical scroll or no gesture - just reset
          setTranslateX(0);
          translateXRef.current = 0;
          setIsHorizontalSwipe(false);
          setGestureLock(null);
          gestureLockRef.current = null;
        }
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        // Cleanup: ensure dragging state is reset
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setIsDragging(false);
        setTranslateX(0);
        translateXRef.current = 0;
        setIsHorizontalSwipe(false);
        setGestureLock(null);
        gestureLockRef.current = null;
      };
    }
  }, [isDragging, startX, startY, translateX, isHorizontalSwipe, onDelete]);

  const deleteOpacity = Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1);

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
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      {/* Remove background indicator - shows on both sides */}
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
          justifyContent: 'center',
          opacity: deleteOpacity,
          zIndex: 1
        }}
      >
        <span style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem' }}>
          Remove
        </span>
      </div>

      {/* Item content */}
      <div
        style={{
          position: 'relative',
          backgroundColor: (isReserved !== undefined ? isReserved : (item.usedByMeals && item.usedByMeals.length > 0)) ? '#f3f4f6' : '#ffffff',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        {/* First line: Quantity, Title, and Purchased date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Always show quantity for all items - with unit if specified, bold and before title */}
          <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '700' }}>
            {item.quantity || 1} {item.quantityUnit ? item.quantityUnit : ''}
          </span>
          <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
            {item.name}
          </span>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Purchased
          </span>
          <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: '500' }}>
            {item.addedDate ? formatDate(item.addedDate) : 'No date'}
          </span>
        </div>

        {/* Second line: Best by date and buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {item.isFrozen ? 'Thaws' : 'Best By'}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: '500' }}>
              {item.isFrozen && item.thawDate 
                ? formatDate(item.thawDate)
                : item.bestByDate 
                  ? formatDate(item.bestByDate)
                  : 'No date'
              }
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative', zIndex: 10 }}>
            {/* Scan button for Premium users */}
            {showScanButton && onScan && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onScan();
                }}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '44px',
                  minHeight: '36px'
                }}
                aria-label="AI"
                title="AI"
                type="button"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ display: 'inline-block', verticalAlign: 'middle' }}
                >
                  {/* Top-left corner bracket */}
                  <path d="M4 4V8H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Top-right corner bracket */}
                  <path d="M20 4V8H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Bottom-left corner bracket */}
                  <path d="M4 20V16H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Bottom-right corner bracket */}
                  <path d="M20 20V16H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Barcode pattern - vertical lines of varying widths */}
                  <line x1="8" y1="8" x2="8" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="10" y1="8" x2="10" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <line x1="11.5" y1="8" x2="11.5" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="13" y1="8" x2="13" y2="16" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round"/>
                  <line x1="14" y1="8" x2="14" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="15.5" y1="8" x2="15.5" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <line x1="16.5" y1="8" x2="16.5" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            {/* Only show Freeze button for non-dry/canned items that aren't already frozen */}
            {onFreeze && !item.isDryCanned && !item.thawDate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onFreeze();
                }}
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '44px',
                  minHeight: '36px'
                }}
                aria-label="Freeze item"
                title="Freeze item"
                type="button"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ display: 'inline-block', verticalAlign: 'middle' }}
                >
                  <path d="M12 2V22M12 2L10 6L12 8L14 6L12 2ZM12 22L10 18L12 16L14 18L12 22ZM2 12H22M2 12L6 10L8 12L6 14L2 12ZM22 12L18 10L16 12L18 14L22 12ZM7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Edit button should trigger onClick to navigate to edit page
                if (onClick) {
                  onClick();
                }
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                minWidth: '60px',
                minHeight: '36px'
              }}
              aria-label="Edit item"
              type="button"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

SwipeableListItem.displayName = 'SwipeableListItem';

export default SwipeableListItem;

