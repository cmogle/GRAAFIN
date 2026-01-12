# GRAAFIN Frontend

This is the frontend application for GRAAFIN.club, designed to be deployed on Cloudflare Pages.

## Local Development

1. Serve the files using any static file server:
   ```bash
   # Using Python
   cd frontend
   python3 -m http.server 8000
   
   # Using Node.js (http-server)
   npx http-server frontend -p 8000
   ```

2. Update `config.js` to point to your local backend:
   ```javascript
   window.API_BASE = 'http://localhost:3000/api';
   ```

## Deployment to Cloudflare Pages

### Option 1: Manual Configuration (Simplest)

1. Edit `config.js` and update the default API URL to your backend:
   ```javascript
   window.API_BASE = window.API_BASE || 'https://graafin-web.onrender.com/api';
   ```
2. Push to Git repository
3. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > Pages
4. Click "Create a project" > "Connect to Git"
5. Build settings:
   - **Build command**: (leave empty)
   - **Build output directory**: `frontend`

### Option 2: Automated Build Script

1. Push to Git repository
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > Pages
3. Click "Create a project" > "Connect to Git"
4. Build settings:
   - **Build command**: `cd frontend && node build-config.js`
   - **Build output directory**: `frontend`
5. Add environment variable:
   - **Variable name**: `API_URL`
   - **Value**: Your backend API URL (e.g., `https://graafin-web.onrender.com/api`)

## Custom Domain Setup

1. In Cloudflare Pages project settings, go to "Custom domains"
2. Add `graafin.club` and `www.graafin.club`
3. Update your domain's DNS records to point to Cloudflare Pages:
   - Add an A record or CNAME pointing to Cloudflare Pages
   - Cloudflare will provide the exact DNS settings

## Configuration

The API base URL is configured via `config.js`. For production, set the `API_URL` environment variable in Cloudflare Pages, which will be injected during deployment.
