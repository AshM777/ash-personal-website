/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly ADMIN_ALLOWED_EMAILS?: string;
  readonly GITHUB_TOKEN?: string;
  readonly GITHUB_REPO?: string;
  readonly GITHUB_BRANCH?: string;
  readonly GITHUB_CONTENT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
