# Deployment Guide for ashxyz.com

## Step 1: Push to GitHub

Your changes are committed locally. Push them to GitHub:

```bash
git push origin main
```

## Step 2: Set Up Hosting

You have several options for hosting:

### Option A: Vercel (Recommended - Easiest)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project"
3. Import your repository: `AshM777/ash`
4. Configure:
   - **Framework Preset**: Astro
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret
   - `ADMIN_ALLOWED_EMAILS` - `aashishmanchanda777@gmail.com`
   - `GITHUB_REPO` - `AshM777/ash` (or your repo)
   - `GITHUB_TOKEN` - Your GitHub personal access token
   - `GITHUB_BRANCH` - `main`
   - `GITHUB_CONTENT_PATH` - `src/content`
6. Click "Deploy"
7. After deployment, go to Project Settings → Domains
8. Add your custom domain: `ashxyz.com`
9. Follow DNS instructions to point your domain to Vercel

### Option B: Netlify

1. Go to [netlify.com](https://netlify.com) and sign in with GitHub
2. Click "Add new site" → "Import an existing project"
3. Select your repository: `AshM777/ash`
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Add Environment Variables (same as Vercel above)
6. Deploy
7. Add custom domain: `ashxyz.com` in Site Settings → Domain Management

### Option C: Cloudflare Pages

1. Go to Cloudflare Dashboard → Pages
2. Connect to Git → Select `AshM777/ash`
3. Configure:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Add Environment Variables (same as above)
5. Deploy
6. Add custom domain: `ashxyz.com`

## Step 3: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Go to "APIs & Services" → "Credentials"
4. Edit your OAuth 2.0 Client ID
5. Add Authorized redirect URIs:
   - **Development**: `http://localhost:4321/api/admin/google-callback`
   - **Production**: `https://ashxyz.com/api/admin/google-callback`
6. Save changes

## Step 4: DNS Configuration

Point your domain `ashxyz.com` to your hosting provider:

### For Vercel:
- Add an A record pointing to Vercel's IP (they'll provide this)
- Or add a CNAME record pointing to `cname.vercel-dns.com`

### For Netlify:
- Add a CNAME record: `ashxyz.com` → `your-site.netlify.app`

### For Cloudflare Pages:
- Add a CNAME record: `ashxyz.com` → `your-site.pages.dev`

## Step 5: SSL Certificate

Most hosting providers (Vercel, Netlify, Cloudflare) automatically provision SSL certificates. Just ensure your DNS is configured correctly.

## Step 6: Verify Deployment

1. Visit `https://ashxyz.com` - should show your site
2. Visit `https://ashxyz.com/admin` - should show Google login
3. Test admin functionality after logging in

## Environment Variables Summary

Make sure these are set in your hosting platform:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
ADMIN_ALLOWED_EMAILS=aashishmanchanda777@gmail.com
GITHUB_REPO=AshM777/ash
GITHUB_TOKEN=your-github-token
GITHUB_BRANCH=main
GITHUB_CONTENT_PATH=src/content
```

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **OAuth doesn't work**: Verify redirect URIs match exactly in Google Console
- **Domain not working**: Wait 24-48 hours for DNS propagation, or check DNS records
- **Admin panel shows errors**: Check environment variables are set correctly
