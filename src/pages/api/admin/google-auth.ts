import type { APIRoute } from "astro";

const getRequiredEnv = (name: string): string => {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// GET - Initiate Google OAuth login
export const GET: APIRoute = async ({ url }) => {
  try {
    const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = `${url.origin}/api/admin/google-callback`;
    const scope = "openid email profile";
    const state = crypto.randomUUID(); // CSRF protection
    
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    // Store state in a cookie for verification
    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl.toString(),
        "Set-Cookie": `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return new Response(
      JSON.stringify({ message: "Server configuration error. Please check GOOGLE_CLIENT_ID in .env" }),
      { status: 500 }
    );
  }
};
