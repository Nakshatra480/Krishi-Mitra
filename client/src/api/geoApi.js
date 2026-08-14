import api from './axiosInstance';

// Geocoding runs through our own server so the browser never talks to a third
// party directly and repeated lookups hit the server-side cache.
export const reverseGeocode = (lat, lon) => api.get('/geo/reverse', { params: { lat, lon } });
export const searchPlaces = (q) => api.get('/geo/search', { params: { q } });
