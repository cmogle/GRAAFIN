# Quick Deploy Guide - Get graafin.club Live in 5 Minutes

## If graafin.club shows nothing, follow these steps:

### Step 1: Check if Cloudflare Pages Project Exists

1. Go to: https://dash.cloudflare.com
2. Click **Pages** in left sidebar
3. Do you see a project? 
   - ✅ **Yes** → Go to Step 2
   - ❌ **No** → Go to "Create New Project" below

### Step 2: Check Latest Deployment

1. Click on your project
2. Go to **Deployments** tab
3. Look at the latest deployment:
   - ✅ **Success** → Go to Step 3
   - ❌ **Failed** → Click it, check logs, fix errors
   - ⏳ **Building** → Wait 1-2 minutes

### Step 3: Test Cloudflare Pages URL

1. In your project, find the **Preview URL** (e.g., `https://graafin-frontend-xxx.pages.dev`)
2. Visit that URL in your browser
3. Does it work?
   - ✅ **Yes** → DNS issue, go to Step 4
   - ❌ **No** → Deployment issue, check build logs

### Step 4: Check Custom Domain

1. In your project → **Custom domains**
2. Is `graafin.club` listed?
   - ✅ **Yes** → Check if it says "Active" or "Pending"
   - ❌ **No** → Add it (see below)

---

## Create New Project (If No Project Exists)

### 1. Create Project

1. Go to: https://dash.cloudflare.com → **Pages**
2. Click **Create a project**
3. Click **Connect to Git**
4. Select GitHub → Authorize → Select `GRAAFIN` repo
5. Click **Begin setup**

### 2. Configure Build

**Project name:** `graafin-frontend`

**Build settings:**
- **Framework preset:** `None`
- **Build command:** `cd frontend && node build-config.js`
- **Build output directory:** `frontend`
- **Root directory:** `/` (default)

### 3. Add Environment Variables

Click **Environment variables** → **Add variable**:

**Variable 1:**
- Name: `API_URL`
- Value: `https://graafin-web.onrender.com/api`
- Environment: `Production`

**Variable 2 (Optional - only if using auth):**
- Name: `SUPABASE_URL`
- Value: Your Supabase URL
- Environment: `Production`

**Variable 3 (Optional - only if using auth):**
- Name: `SUPABASE_ANON_KEY`
- Value: Your Supabase anon key
- Environment: `Production`

### 4. Deploy

1. Click **Save and Deploy**
2. Wait 1-2 minutes for build
3. Once successful, continue to Step 5

### 5. Add Custom Domain

1. In your project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `graafin.club`
4. Click **Continue**
5. Follow DNS instructions

### 6. Configure DNS

**Option A: Use Cloudflare Nameservers (Easiest)**

1. Cloudflare will show you nameservers (e.g., `lola.ns.cloudflare.com`)
2. Go to your domain registrar (where you bought graafin.club)
3. Change nameservers to Cloudflare's
4. Wait 24-48 hours for DNS propagation

**Option B: Add CNAME Record**

1. At your domain registrar, add CNAME:
   - **Name:** `@` (or root)
   - **Value:** Your Cloudflare Pages URL (shown in dashboard)
2. Add another for www:
   - **Name:** `www`
   - **Value:** Same Pages URL
3. Wait for DNS propagation

---

## Quick Fixes

### If Build Fails:

**Error: "Cannot find module"**
- Solution: Change build command to just: `cd frontend` (remove node build-config.js)
- Then manually set API_URL in `frontend/config.js` line 20

**Error: "No such file or directory"**
- Solution: Verify `frontend/index.html` exists in your GitHub repo
- Check build output directory is exactly `frontend` (lowercase)

### If Site is Blank:

1. **Check browser console (F12):**
   - Look for JavaScript errors
   - Check Network tab for failed requests

2. **Verify files deployed:**
   - Visit: `https://your-pages-url.pages.dev/index.html`
   - Should show the page

3. **Check _redirects file:**
   - Should be at `frontend/_redirects`
   - Content: `/*    /index.html   200`

### If DNS Not Working:

1. **Check DNS propagation:**
   ```bash
   dig graafin.club
   ```
   Should show Cloudflare IPs

2. **Wait longer:**
   - DNS can take 24-48 hours to fully propagate
   - Check again in a few hours

3. **Verify nameservers:**
   - At your registrar, confirm nameservers are Cloudflare's
   - Or verify CNAME record is correct

---

## Test Locally First

Before deploying, test locally:

```bash
cd frontend
python3 -m http.server 8000
```

Visit: http://localhost:8000

If this works, the files are correct. If it doesn't, there's an issue with the files.

---

## Still Stuck?

1. **Check Cloudflare Pages logs:**
   - Project → Deployments → Latest → View logs

2. **Verify GitHub repo:**
   - Ensure all files are committed and pushed
   - Check `frontend/` directory exists

3. **Contact:**
   - Cloudflare Community: https://community.cloudflare.com
   - Or check the detailed [DEPLOYMENT_CHECKLIST.md](./frontend/DEPLOYMENT_CHECKLIST.md)
