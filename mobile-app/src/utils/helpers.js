// src/utils/helpers.js

// Calculate distance between two coordinates using Haversine formula
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value) => {
  return (value * Math.PI) / 180;
};

// Format distance for display
export const formatDistance = (km) => {
  if (!km) return '--';
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
};

// Format time duration
export const formatDuration = (minutes) => {
  if (!minutes) return '--';
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
};

// Format date/time
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Get status color
export const getStatusColor = (status) => {
  const colors = {
    pending: '#F59E0B',
    accepted: '#3B82F6',
    arriving: '#8B5CF6',
    in_progress: '#10B981',
    completed: '#6B7280',
    cancelled: '#EF4444',
  };
  return colors[status] || '#6B7280';
};

// Get status text
export const getStatusText = (status) => {
  const texts = {
    pending: 'Finding Driver...',
    accepted: 'Driver Assigned',
    arriving: 'Driver Arriving',
    in_progress: 'On Trip',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return texts[status] || status;
};