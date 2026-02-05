import type { APIRoute } from "astro";

const getAllowedEmails = (): string[] => {
  const emails = import.meta.env.ADMIN_ALLOWED_EMAILS || "";
  return emails.split(",").map((e: string) => e.trim()).filter(Boolean);
};

// GET - Verify if user has valid session
export const GET: APIRoute = async ({ cookies }) => {
  try {
    const sessionToken = cookies.get("admin_session")?.value;
    const userEmail = cookies.get("admin_email")?.value;

    if (!sessionToken || !userEmail) {
      return new Response(
        JSON.stringify({ authenticated: false }),
        { status: 200 }
      );
    }

    // Check if email is allowed
    const allowedEmails = getAllowedEmails();
    if (allowedEmails.length > 0 && !allowedEmails.includes(userEmail.toLowerCase())) {
      return new Response(
        JSON.stringify({ authenticated: false }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ 
        authenticated: true,
        email: userEmail,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Session verification error:", error);
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 200 }
    );
  }
};
