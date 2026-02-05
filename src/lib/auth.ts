import type { APIContext } from "astro";

const getAllowedEmails = (): string[] => {
  const emails = import.meta.env.ADMIN_ALLOWED_EMAILS || "";
  return emails.split(",").map((e: string) => e.trim()).filter(Boolean);
};

export const verifyAdminSession = (context: APIContext): { authenticated: boolean; email?: string } => {
  const sessionToken = context.cookies.get("admin_session")?.value;
  const userEmail = context.cookies.get("admin_email")?.value;

  if (!sessionToken || !userEmail) {
    return { authenticated: false };
  }

  // Check if email is allowed
  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length > 0 && !allowedEmails.includes(userEmail.toLowerCase())) {
    return { authenticated: false };
  }

  return { authenticated: true, email: userEmail };
};
