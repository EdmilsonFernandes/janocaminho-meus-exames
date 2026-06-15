export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';

export const token = () => localStorage.getItem('token');
