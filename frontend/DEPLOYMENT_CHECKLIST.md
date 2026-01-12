# Cloudflare Pages Deployment Checklist

If `graafin.club` shows nothing, follow this checklist:

## Step 1: Verify Cloudflare Pages Project Exists

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** in the left sidebar
3. Check if you have a project connected to your GitHub repo
4. **If no project exists:** See "Initial Setup" below

## Step 2: Check Deployment Status

1. In your Cloudflare Pages project, go to **Deployments**
2. Check the latest deployment:
   - ✅ **Success** (green) - Deployment worked
   - ❌ **Failed** (red) - Check build logs
   - ⏳ **Building** - Wait for it to complete

### If Deployment Failed:
- Click on the failed deployment
- Check **Build logs** for errors
- Common issues:
  - Build command error
  - Missing files
  - Node.js version issues

## Step 3: Verify Build Settings

In your Cloudflare Pages project → **Settings** → **Builds & deployments**:

**Required Settings:**
- **Framework preset:** `None` or `Plain HTML`
- **Build command:** 
  - Option A: Leave empty (if using manual config)
  - Option B: `cd frontend && node build-config.js` (if using env vars)
- **Build output directory:** `frontend`
- **Root directory:** `/` (root of repo)

## Step 4: Check Custom Domain Configuration

1. In your Cloudflare Pages project → **Custom domains**
2. Verify `graafin.club` is listed
3. Check status:
   - ✅ **Active** - Domain is connected
   - ⚠️ **Pending** - DNS propagation in progress (can take up to 48 hours)
   - ❌ **Error** - DNS not configured correctly

### If Domain Not Connected:
1. Click **Set up a custom domain**
2. Enter `graafin.club`
3. Cloudflare will show DNS instructions
4. Add the DNS record at your domain registrar

## Step 5: Verify DNS Configuration

### Option A: Using Cloudflare Nameservers (Recommended)

1. At your domain registrar (where you bought graafin.club):
   - Change nameservers to Cloudflare's (shown in Cloudflare dashboard)
   - Usually something like:
     - `lola.ns.cloudflare.com`
     - `mike.ns.cloudflare.com`

2. Wait for DNS propagation (can take 24-48 hours)

### Option B: Using CNAME Record

1. At your domain registrar:
   - Add a CNAME record:
     - **Name:** `@` (or root domain)
     - **Value:** Your Cloudflare Pages URL (e.g., `graafin-frontend.pages.dev`)
   - Add another for www:
     - **Name:** `www`
     - **Value:** Same Cloudflare Pages URL

2. Wait for DNS propagation

### Check DNS Status:
```bash
# Check if DNS is resolving
dig graafin.club
# or
nslookup graafin.club
```

Should show Cloudflare IPs or CNAME to pages.dev

## Step 6: Verify Files Are Deployed

1. Visit your Cloudflare Pages preview URL (e.g., `https://graafin-frontend.pages.dev`)
2. If this works but graafin.club doesn't → DNS issue
3. If this doesn't work → Deployment issue

### Check if index.html exists:
Visit: `https://your-pages-url.pages.dev/index.html`

Should show the landing page.

## Step 7: Check Browser Console

1. Visit `graafin.club` (even if blank)
2. Open browser DevTools (F12)
3. Check **Console** tab for JavaScript errors
4. Check **Network** tab for failed requests

Common errors:
- `Failed to load resource` - API URL might be wrong
- `CORS error` - Backend CORS not configured
- `404 Not Found` - Files not deployed correctly

## Initial Setup (If No Project Exists)

### Create Cloudflare Pages Project:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages**
2. Click **Create a project**
3. Click **Connect to Git**
4. Select your GitHub account
5. Select the `GRAAFIN` repository
6. Click **Begin setup**

### Configure Project:

**Project name:** `graafin-frontend` (or any name)

**Build settings:**
- **Framework preset:** `None`
- **Build command:** `cd frontend && node build-config.js`
- **Build output directory:** `frontend`
- **Root directory:** `/` (leave as default)

### Add Environment Variables:

Click **Environment variables** and add:

1. **API_URL**
   - Value: `https://graafin-web.onrender.com/api` (or your backend URL)
   - Environment: Production

2. **SUPABASE_URL** (optional, if using auth)
   - Value: Your Supabase project URL
   - Environment: Production

3. **SUPABASE_ANON_KEY** (optional, if using auth)
   - Value: Your Supabase anon key
   - Environment: Production

### Save and Deploy:

1. Click **Save and Deploy**
2. Wait for first deployment (usually 1-2 minutes)
3. Once deployed, add custom domain (Step 4 above)

## Quick Diagnostic Commands

### Check if site is accessible:
```bash
curl -I https://graafin.club
```

Should return `200 OK` if working.

### Check DNS:
```bash
dig graafin.club +short
```

Should return Cloudflare IPs.

### Check Cloudflare Pages URL:
```bash
curl -I https://your-project-name.pages.dev
```

Replace `your-project-name` with your actual Cloudflare Pages project name.

## Common Issues & Solutions

### Issue: "404 Not Found" or blank page

**Possible causes:**
1. Build output directory wrong → Should be `frontend`
2. index.html not in root of output → Should be at `frontend/index.html`
3. _redirects file missing → Should be in `frontend/_redirects`

**Solution:**
- Verify `frontend/index.html` exists in your repo
- Check build output directory is set to `frontend`
- Ensure `_redirects` file is in `frontend/` directory

### Issue: "This site can't be reached" or DNS error

**Possible causes:**
1. DNS not configured
2. DNS still propagating
3. Wrong nameservers

**Solution:**
- Check DNS records at your registrar
- Wait 24-48 hours for propagation
- Verify nameservers point to Cloudflare

### Issue: Site loads but shows errors in console

**Possible causes:**
1. API_URL not configured
2. CORS issues
3. Missing environment variables

**Solution:**
- Check browser console for specific errors
- Verify API_URL in Cloudflare Pages environment variables
- Check backend CORS settings allow `https://graafin.club`

### Issue: Build fails

**Possible causes:**
1. Node.js version incompatible
2. Missing dependencies
3. Build command error

**Solution:**
- Check build logs in Cloudflare Pages
- Verify build command is correct
- Ensure `build-config.js` doesn't require npm packages (it uses Node.js built-ins)

## Still Not Working?

1. **Check Cloudflare Pages logs:**
   - Go to your project → Deployments → Latest deployment → View logs

2. **Test locally first:**
   ```bash
   cd frontend
   python3 -m http.server 8000
   ```
   Visit `http://localhost:8000` - should show the site

3. **Verify files are in repo:**
   - Check GitHub that `frontend/index.html` exists
   - Check `frontend/css/styles.css` exists
   - Check `frontend/js/` directory has all files

4. **Contact support:**
   - Cloudflare Pages support: https://support.cloudflare.com
   - Or check Cloudflare Community forums
