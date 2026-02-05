# Ash Website

Personal website hosted at [ashxyz.com](https://ashxyz.com)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

3. Required environment variables:
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
- `ADMIN_ALLOWED_EMAILS` - Comma-separated list of allowed admin emails
- `GITHUB_REPO` - GitHub repository (e.g., `AshM777/ash-personal-website-vercel`)
- `GITHUB_TOKEN` - GitHub personal access token with repo permissions
- `GITHUB_BRANCH` - Branch name (default: `main`)
- `GITHUB_CONTENT_PATH` - Path to content directory (default: `src/content`)

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

The site is configured to deploy to `ashxyz.com`. Make sure to:

1. Set up Google OAuth credentials with authorized redirect URI: `https://ashxyz.com/api/admin/google-callback`
2. Configure environment variables in your hosting platform
3. Push changes to GitHub main branch for automatic deployment
