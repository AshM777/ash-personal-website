import type { APIRoute } from "astro";

const getRequiredEnv = (name: string): string => {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getAllowedEmails = (): string[] => {
  const emails = import.meta.env.ADMIN_ALLOWED_EMAILS || "";
  return emails.split(",").map((e: string) => e.trim()).filter(Boolean);
};

// GET - Handle Google OAuth callback
export const GET: APIRoute = async ({ url, cookies, request }) => {
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = cookies.get("oauth_state")?.value;
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(
        null,
        {
          status: 302,
          headers: {
            Location: `/admin?error=${encodeURIComponent(error)}`,
          },
        }
      );
    }

    if (!code || !state || state !== storedState) {
      return new Response(
        null,
        {
          status: 302,
          headers: {
            Location: `/admin?error=invalid_request`,
          },
        }
      );
    }

    const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
    // Use production URL for redirect in production, localhost for dev
    const isDev = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const redirectUri = isDev 
      ? `${url.origin}/api/admin/google-callback`
      : `https://ashxyz.com/api/admin/google-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error("Token exchange error:", errorData);
      return new Response(
        null,
        {
          status: 302,
          headers: {
            Location: `/admin?error=token_exchange_failed`,
          },
        }
      );
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      return new Response(
        null,
        {
          status: 302,
          headers: {
            Location: `/admin?error=user_info_failed`,
          },
        }
      );
    }

    const userInfo = await userResponse.json();
    const userEmail = userInfo.email?.toLowerCase().trim();

    // Check if email is allowed
    const allowedEmails = getAllowedEmails();
    if (allowedEmails.length > 0 && !allowedEmails.includes(userEmail)) {
      console.log(`Access denied for email: ${userEmail}. Allowed emails: ${allowedEmails.join(", ")}`);
      return new Response(
        null,
        {
          status: 302,
          headers: {
            Location: `/admin?error=unauthorized_email`,
          },
        }
      );
    }

    // Create session token
    const sessionToken = crypto.randomUUID();
    const sessionData = {
      email: userEmail,
      name: userInfo.name,
      picture: userInfo.picture,
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    // Store session (in production, use a proper session store)
    cookies.set("admin_session", sessionToken, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // In a real app, store sessionData in a database or cache
    // For now, we'll store minimal info in the cookie
    cookies.set("admin_email", userEmail, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Clear OAuth state cookie
    cookies.delete("oauth_state");

    return new Response(
      null,
      {
        status: 302,
        headers: {
          Location: `/admin?success=true`,
        },
      }
    );
  } catch (error) {
    console.error("Google callback error:", error);
    return new Response(
      null,
      {
        status: 302,
        headers: {
          Location: `/admin?error=server_error`,
        },
      }
    );
  }
};
