// App-wide settings. Set VITE_APP_NAME in .env.local to rename the app
// (build-time — rebuild after changing it).
export const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || 'Essentials'
