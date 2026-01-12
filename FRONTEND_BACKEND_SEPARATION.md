# Frontend/Backend Separation Summary

This document summarizes the changes made to separate the frontend and backend for GRAAFIN.club hosting.

## Changes Made

### 1. Frontend Extraction
- **Created:** `frontend/` directory with standalone frontend files
- **Files:**
  - `frontend/index.html` - Main UI (extracted from `src/public/index.html`)
  - `frontend/config.js` - API configuration with environment variable support
  - `frontend/_redirects` - Cloudflare Pages SPA routing rules
  - `frontend/build-config.js` - Optional build script for API URL injection
  - `frontend/README.md` - Frontend-specific documentation

### 2. Backend CORS Configuration
- **Modified:** `src/server.ts`
- **Changes:** Updated CORS to allow requests from `graafin.club` and `www.graafin.club`
- **Behavior:** 
  - Allows requests from GRAAFIN.club domains
  - Falls back to `CORS_ORIGIN` environment variable if set
  - Maintains backward compatibility

### 3. Optional Static File Serving
- **Modified:** `src/server.ts`
- **Changes:** Added `ENABLE_STATIC_FILES` environment variable to control static file serving
- **Behavior:**
  - Default: `true` (enabled for backward compatibility)
  - Set to `false` for API-only mode when frontend is deployed separately
  - When disabled, backend returns 404 for non-API routes
  - Health check endpoint (`/api/health`) indicates static file serving status
- **Benefits:**
  - Complete separation of frontend and backend
  - Backend can run as pure API when frontend is on Cloudflare Pages
  - Maintains backward compatibility for existing deployments

### 4. Configuration Files
- **render.yaml:** Added comment about `CORS_ORIGIN` environment variable
  - Note: Add `CORS_ORIGIN` manually in Render.com dashboard
  - Set to: `https://graafin.club,https://www.graafin.club`

### 5. Documentation
- **Created:** `DEPLOYMENT_GUIDE.md` - Comprehensive deployment instructions
- **Updated:** `frontend/README.md` - Frontend-specific setup guide
- **Updated:** `render.yaml` - Added documentation for `ENABLE_STATIC_FILES` and `CORS_ORIGIN`

## File Structure

```
GRAAFIN/
├── frontend/                    # NEW: Standalone frontend
│   ├── index.html              # Main UI
│   ├── config.js               # API configuration
│   ├── _redirects              # Cloudflare Pages config
│   ├── build-config.js         # Build script (optional)
│   └── README.md               # Frontend docs
├── src/
│   ├── server.ts               # MODIFIED: CORS updated, optional static files
│   └── public/
│       └── index.html          # Original (kept for backward compatibility)
├── render.yaml                  # MODIFIED: ENABLE_STATIC_FILES and CORS_ORIGIN documented
├── DEPLOYMENT_GUIDE.md          # NEW: Deployment instructions
└── FRONTEND_BACKEND_SEPARATION.md  # This file
```

## Next Steps

1. **Deploy Backend to Render.com:**
   - Push code to GitHub
   - Create Render.com service from `render.yaml`
   - Add environment variables:
     - `CORS_ORIGIN` - Set to: `https://graafin.club,https://www.graafin.club`
     - `ENABLE_STATIC_FILES` - Set to `false` for API-only mode (recommended when frontend is on Cloudflare Pages)
   - All other existing environment variables remain the same

2. **Deploy Frontend to Cloudflare Pages:**
   - Connect GitHub repo to Cloudflare Pages
   - Set build output directory to `frontend`
   - Configure custom domain: `graafin.club`
   - Update `config.js` with backend API URL (or use build script with `API_URL` env var)

3. **Configure DNS:**
   - Point `graafin.club` to Cloudflare Pages
   - Optionally set up `api.graafin.club` subdomain for backend

## Environment Variables

### Backend (Render.com)
- `CORS_ORIGIN` - Set to: `https://graafin.club,https://www.graafin.club`
- `ENABLE_STATIC_FILES` - Set to `false` to disable static file serving (API-only mode). Recommended when frontend is deployed separately to Cloudflare Pages. Default: `true` (enabled for backward compatibility)
- All existing environment variables remain the same

### Frontend (Cloudflare Pages)
- `API_URL` - Backend API URL (only needed if using build script)
- Or manually update `config.js` with API URL

## Testing

1. **Test with Static Files Enabled (Default):**
   - Backend should serve `index.html` for non-API routes
   - Health check (`/api/health`) should show `staticFilesEnabled: true`
   - Visit backend URL directly - should show frontend UI

2. **Test with Static Files Disabled (API-Only Mode):**
   - Set `ENABLE_STATIC_FILES=false` in backend environment
   - Backend should return 404 for non-API routes
   - Health check should show `staticFilesEnabled: false`
   - Frontend on Cloudflare Pages should work independently

3. **Local Frontend:**
   ```bash
   cd frontend
   python3 -m http.server 8000
   # Update config.js to point to local backend
   ```

4. **Backend CORS:**
   - Test from browser console on `graafin.club`
   - Should allow requests without CORS errors
   - Verify `CORS_ORIGIN` is set correctly

5. **End-to-End:**
   - Deploy both services
   - Visit `https://graafin.club`
   - Verify API calls work correctly
   - Check browser console for any CORS errors

## Notes

- Original `src/public/index.html` is kept for backward compatibility
- Static file serving is **enabled by default** for backward compatibility
- When frontend is deployed to Cloudflare Pages, set `ENABLE_STATIC_FILES=false` on backend for pure API mode
- Frontend is completely independent and can be deployed separately
- No breaking changes to existing functionality
- Build process (`npm run build`) copies `src/public` to `dist/public` for backward compatibility
- When static files are disabled, the backend returns 404 for non-API routes instead of serving `index.html`