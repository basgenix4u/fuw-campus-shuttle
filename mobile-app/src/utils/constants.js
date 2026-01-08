// src/utils/constants.js

export const COLORS = {
  primary: '#4F46E5',
  secondary: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  dark: '#1F2937',
  light: '#F3F4F6',
  white: '#FFFFFF',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
};

export const RIDE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ARRIVING: 'arriving',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const USER_ROLES = {
  PASSENGER: 'passenger',
  DRIVER: 'driver',
  ADMIN: 'admin',
};

// Campus center coordinates (Federal University Wukari)
export const CAMPUS_CENTER = {
  latitude: 7.8540,
  longitude: 9.7835,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};