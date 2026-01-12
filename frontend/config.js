// API Configuration
// This file can be customized for different environments
// For Cloudflare Pages, set the API_URL environment variable
// It will be injected at build time or can be set via window.__API_BASE__

(function() {
  // Check for window variable (can be set via script tag in HTML)
  if (window.__API_BASE__) {
    window.API_BASE = window.__API_BASE__;
    return;
  }

  // Check for environment variable (set during build)
  // Cloudflare Pages will replace %API_URL% during build
  const envApiUrl = '%API_URL%';
  if (envApiUrl && envApiUrl !== '%API_URL%') {
    window.API_BASE = envApiUrl;
    return;
  }

  // Default fallback
  // For production, update this URL to your backend API
  // Or use build-config.js script to inject API_URL environment variable
  window.API_BASE = window.API_BASE || 'https://graafin-web.onrender.com/api';
})();
