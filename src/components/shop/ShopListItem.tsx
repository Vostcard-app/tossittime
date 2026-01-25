/**
 * Shop List Item Component
 * Individual shopping list item with swipe actions, edit, scan, and add to calendar
 */

import React, { useState, useEffect, useRef } from 'react';
import type { ShoppingListItem } from '../../types';
import { buttonStyles, combineStyles } from '../../styles/componentStyles';
import { colors, spacing } from '../../styles/designTokens';
import { PANTRY_UNITS } from '../../utils/units';

interface ShopListItemProps {
  item: ShoppingListItem;
  isPremium: boolean;
  editingQuantityItemId: string | null;
  editingQuantityValue: string;
  onQuantityClick: (item: ShoppingListItem) => void;
  onQuantityChange: (value: string) => void;
  onQuantityBlur: (item: ShoppingListItem) => void;
  onQuantityKeyDown: (e: React.KeyboardEvent, item: ShoppingListItem) => void;
  editingUnitItemId: string | null;
  editingUnitValue: string;
  onUnitClick: (item: ShoppingListItem) => void;
  onUnitChange: (value: string) => void;
  onUnitBlur: (item: ShoppingListItem) => void;
  editingNameItemId: string | null;
  editingNameValue: string;
  onNameClick: (item: ShoppingListItem) => void;
  onNameChange: (value: string) => void;
  onNameBlur: (item: ShoppingListItem) => void;
  onNameKeyDown: (e: React.KeyboardEvent, item: ShoppingListItem) => void;
  onMarkAsCrossedOff: (item: ShoppingListItem) => void;
  onScanLabel: (item: ShoppingListItem) => void;
  onAddToCalendar: (item: ShoppingListItem) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  cursorPositionRef: React.MutableRefObject<{ start: number; end: number } | null>;
}

export const ShopListItem: React.FC<ShopListItemProps> = ({
  item,
  isPremium,
  editingQuantityItemId,
  editingQuantityValue,
  onQuantityClick,
  onQuantityChange,
  onQuantityBlur,
  onQuantityKeyDown,
  editingUnitItemId,
  editingUnitValue,
  onUnitClick,
  onUnitChange,
  onUnitBlur,
  editingNameItemId,
  editingNameValue,
  onNameClick,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  onMarkAsCrossedOff,
  onScanLabel,
  onAddToCalendar,
  nameInputRef,
  cursorPositionRef,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);
  const SWIPE_THRESHOLD = 100;

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    const clampedDiff = Math.max(-SWIPE_THRESHOLD * 2, Math.min(diff, SWIPE_THRESHOLD * 2));
    setTranslateX(clampedDiff);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(translateX) >= SWIPE_THRESHOLD) {
      onMarkAsCrossedOff(item);
      setTranslateX(0);
      return;
    } else {
      setTranslateX(0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        const clampedDiff = Math.max(-SWIPE_THRESHOLD * 2, Math.min(diff, SWIPE_THRESHOLD * 2));
        setTranslateX(clampedDiff);
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
        if (Math.abs(translateX) >= SWIPE_THRESHOLD) {
          onMarkAsCrossedOff(item);
          setTranslateX(0);
          return;
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
  }, [isDragging, startX, translateX, item, onMarkAsCrossedOff]);

  const swipeOpacity = Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1);
  const isSwiped = Math.abs(translateX) >= SWIPE_THRESHOLD;
  const isLeftSwipe = translateX < 0;

  return (
    <div
      ref={itemRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        backgroundColor: item.mealId ? colors.gray[100] : colors.white,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Swipe background indicator */}
      {translateX !== 0 && (
        <div
          style={{
            position: 'absolute',
            ...(isLeftSwipe ? { right: 0 } : { left: 0 }),
            top: 0,
            bottom: 0,
            width: `${Math.min(Math.abs(translateX), SWIPE_THRESHOLD)}px`,
            backgroundColor: colors.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isLeftSwipe ? 'flex-end' : 'flex-start',
            ...(isLeftSwipe ? { paddingRight: spacing.md } : { paddingLeft: spacing.md }),
            color: colors.white,
            fontSize: '0.875rem',
            fontWeight: 500,
            opacity: swipeOpacity,
            transition: isDragging ? 'none' : 'opacity 0.2s'
          }}
        >
          {isSwiped ? '✓ Added' : (isLeftSwipe ? '← Swipe' : '→ Swipe')}
        </div>
      )}
      
      {/* Item content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          padding: `${spacing.xs} ${spacing.md}`,
          border: `1px solid ${colors.gray[200]}`,
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: item.mealId ? colors.gray[100] : colors.white,
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ fontSize: '1.25rem', fontWeight: 500, color: colors.gray[900], display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {/* Amount field */}
          {editingQuantityItemId === item.id ? (
            <input
              type="number"
              min="1"
              value={editingQuantityValue}
              onChange={(e) => onQuantityChange(e.target.value)}
              onBlur={() => onQuantityBlur(item)}
              onKeyDown={(e) => onQuantityKeyDown(e, item)}
              autoFocus
              style={{
                width: '50px',
                padding: `${spacing.xs} ${spacing.sm}`,
                border: `2px solid ${colors.primary}`,
                borderRadius: '4px',
                fontSize: '1.25rem',
                fontWeight: 600,
                textAlign: 'center',
                outline: 'none'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onQuantityClick(item);
              }}
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: colors.primary,
                cursor: 'pointer',
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: '4px',
                backgroundColor: '#f0f8ff',
                minWidth: '40px',
                textAlign: 'center',
                display: 'inline-block'
              }}
              title="Tap to edit quantity"
            >
              {item.quantity || 1}
            </span>
          )}
          {/* Unit field - dropdown between amount and name */}
          {editingUnitItemId === item.id ? (
            <select
              value={editingUnitValue}
              onChange={(e) => onUnitChange(e.target.value)}
              onBlur={() => onUnitBlur(item)}
              autoFocus
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: `2px solid ${colors.primary}`,
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 500,
                backgroundColor: colors.white,
                cursor: 'pointer',
                outline: 'none',
                minWidth: '80px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">No unit</option>
              {PANTRY_UNITS.map(unit => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onUnitClick(item);
              }}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: item.quantityUnit ? colors.gray[700] : colors.gray[400],
                padding: `${spacing.xs} ${spacing.sm}`,
                cursor: 'pointer',
                borderRadius: '4px',
                backgroundColor: item.quantityUnit ? '#f0f8ff' : 'transparent',
                minWidth: '60px',
                textAlign: 'center',
                display: 'inline-block'
              }}
              title="Tap to edit unit"
            >
              {item.quantityUnit || 'unit'}
            </span>
          )}
          {/* Name field */}
          {editingNameItemId === item.id ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editingNameValue}
              onChange={(e) => {
                const input = e.target;
                cursorPositionRef.current = {
                  start: input.selectionStart || 0,
                  end: input.selectionEnd || 0
                };
                onNameChange(e.target.value);
                setTimeout(() => {
                  if (nameInputRef.current && cursorPositionRef.current) {
                    const { start, end } = cursorPositionRef.current;
                    const textLength = nameInputRef.current.value.length;
                    const safeStart = Math.min(start, textLength);
                    const safeEnd = Math.min(end, textLength);
                    nameInputRef.current.setSelectionRange(safeStart, safeEnd);
                  }
                }, 0);
              }}
              onBlur={() => onNameBlur(item)}
              onKeyDown={(e) => onNameKeyDown(e, item)}
              autoFocus
              style={{
                flex: 1,
                padding: `${spacing.xs} ${spacing.sm}`,
                border: `2px solid ${colors.primary}`,
                borderRadius: '4px',
                fontSize: '1.25rem',
                fontWeight: 500,
                outline: 'none',
                minWidth: '150px'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onNameClick(item);
              }}
              style={{
                cursor: 'pointer',
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.gray[100];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Tap to edit name"
            >
              {item.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          {isPremium && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onScanLabel(item);
              }}
              style={combineStyles(
                buttonStyles.success,
                {
                  padding: '0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  height: '36px',
                  width: '36px'
                }
              )}
              aria-label="AI"
              title="AI"
            >
              <img 
                src="/icons/Scan.svg" 
                alt="Scan" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCalendar(item);
            }}
            style={combineStyles(buttonStyles.primary, { display: 'flex', alignItems: 'center', gap: spacing.sm })}
            aria-label="Add to calendar"
          >
            <span>+</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: 'inline-block', verticalAlign: 'middle' }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
