/**
 * StatusBadge Component
 * Displays a colored badge indicating the status of a food item
 * 
 * @example
 * ```tsx
 * <StatusBadge status="bestBySoon" />
 * ```
 */

import React from 'react';
import type { FoodItemStatus } from '../../types';
import { getStatusColor, getStatusLabel, getStatusBgColor } from '../../utils/statusUtils';

interface StatusBadgeProps {
  /** The status of the food item */
  status: FoodItemStatus;
  /** Optional CSS class name */
  className?: string;
}

/**
 * StatusBadge component that displays a colored badge for food item status
 */
const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({ status, className = '' }) => {
  const color = getStatusColor(status);
  const bgColor = getStatusBgColor(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={`status-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        backgroundColor: bgColor,
        color: color,
        border: `1px solid ${color}`
      }}
    >
      {label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;

