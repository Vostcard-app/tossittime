/**
 * Component Type Definitions
 * Standardized prop interfaces and types for React components
 */

import type { ReactNode, CSSProperties } from 'react';

/**
 * Base props for all components
 */
export interface BaseComponentProps {
  className?: string;
  'data-testid'?: string;
}

/**
 * Common button props
 */
export interface ButtonProps extends BaseComponentProps {
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'text';
  size?: 'small' | 'medium' | 'large';
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Common modal props
 */
export interface ModalProps extends BaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'full';
  showCloseButton?: boolean;
}

/**
 * Common form field props
 */
export interface FormFieldProps extends BaseComponentProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}

/**
 * Common input props
 */
export interface InputProps extends FormFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel' | 'url';
  autoFocus?: boolean;
  maxLength?: number;
}

/**
 * Common select/option props
 */
export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> extends FormFieldProps {
  value: T | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
}

/**
 * Common checkbox props
 */
export interface CheckboxProps extends BaseComponentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Common list item props
 */
export interface ListItemProps extends BaseComponentProps {
  onClick?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  disabled?: boolean;
}

/**
 * Common card props
 */
export interface CardProps extends BaseComponentProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}

/**
 * Common loading/spinner props
 */
export interface LoadingProps extends BaseComponentProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

/**
 * Common error display props
 */
export interface ErrorDisplayProps extends BaseComponentProps {
  error: string | Error;
  onRetry?: () => void;
  title?: string;
}

/**
 * Common empty state props
 */
export interface EmptyStateProps extends BaseComponentProps {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Common confirmation dialog props
 */
export interface ConfirmationDialogProps extends ModalProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

