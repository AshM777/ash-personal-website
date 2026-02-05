import type { APIRoute } from "astro";

// POST - Logout (clear session)
export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete("admin_session");
  cookies.delete("admin_email");
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
