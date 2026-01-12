# Quick Setup Reference

## 1. Get Supabase Credentials (5 minutes)

1. **Supabase Dashboard** → **Settings** → **API**
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

2. **Generate Admin Key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   → `ADMIN_API_KEY`

## 2. Run Database Migration (2 minutes)

1. **Supabase Dashboard** → **SQL Editor** → **New query**
2. Copy contents of `src/db/migrations/001_initial_schema.sql`
3. Paste and click **Run**

## 3. Configure OAuth (10-15 minutes)

### Google OAuth:
1. [Google Cloud Console](https://console.cloud.google.com/) → Create OAuth Client
2. **Authorized redirect URI:** `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Copy Client ID & Secret → **Supabase** → **Settings** → **Authentication** → **Google**

### GitHub OAuth:
1. [GitHub Settings](https://github.com/settings/developers) → **New OAuth App**
2. **Callback URL:** `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Copy Client ID & Secret → **Supabase** → **Settings** → **Authentication** → **GitHub**

### Apple OAuth:
1. [Apple Developer](https://developer.apple.com/account/) → **Identifiers** → Create **Services ID**
2. Enable **Sign in with Apple**, configure callback: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Create **Key** for Sign in with Apple, download `.p8` file
4. Copy Services ID, Team ID, Key ID → **Supabase** → **Settings** → **Authentication** → **Apple**

### Facebook OAuth:
1. [Facebook Developers](https://developers.facebook.com/) → **Create App** → **Facebook Login**
2. **Valid OAuth Redirect URIs:** `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Copy App ID & Secret → **Supabase** → **Settings** → **Authentication** → **Facebook**

## 4. Set Environment Variables (2 minutes)

Create `.env` file:
```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_API_KEY=your_generated_key
PORT=3000
```

## 5. Test (1 minute)

```bash
npm run dev:server
# Visit http://localhost:3000
```

---

**Full details:** See `SUPABASE_SETUP.md` for complete instructions.
