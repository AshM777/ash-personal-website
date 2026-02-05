import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { verifyAdminSession } from "@lib/auth";

const getRequiredEnv = (name: string): string => {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const toBase64 = (input: string | Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return typeof input === "string"
      ? Buffer.from(input, "utf-8").toString("base64")
      : Buffer.from(input).toString("base64");
  }
  if (typeof input === "string") {
    return btoa(unescape(encodeURIComponent(input)));
  }
  let binary = "";
  for (let i = 0; i < input.length; i += 1) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary);
};

const fromBase64 = (input: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64").toString("utf-8");
  }
  return decodeURIComponent(escape(atob(input)));
};

const sanitizeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\\/]+/g, "-").replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
};

const sanitizeFilename = (name: string): string => {
  const base = name.split("/").pop() || "image";
  return base.replace(/[\\]+/g, "").replace(/[^\w.\-]/g, "_");
};

const escapeYaml = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const buildApiPath = (path: string): string =>
  path.split("/").map((segment) => encodeURIComponent(segment)).join("/");

const fetchGitHubFile = async (repo: string, path: string, token: string, branch: string) => {
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`);
  return await response.json();
};

const upsertGitHubFile = async (repo: string, path: string, token: string, branch: string, message: string, contentBase64: string) => {
  const existing = await fetchGitHubFile(repo, path, token, branch);
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(path)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch,
      ...(existing?.sha ? { sha: existing.sha } : {}),
    }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`GitHub write failed: ${response.status} ${errorBody?.message || ""}`.trim());
  }
};

const deleteGitHubFile = async (repo: string, path: string, token: string, branch: string, message: string, sha: string) => {
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(path)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ message, branch, sha }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`GitHub delete failed: ${response.status} ${errorBody?.message || ""}`.trim());
  }
};

export const GET: APIRoute = async (context) => {
  try {
    const auth = verifyAdminSession(context);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ message: "Unauthorized. Please sign in." }), { status: 401 });
    }
    const params = context.params;
    const slug = params?.slug || "";
    if (!slug) {
      return new Response(JSON.stringify({ message: "Slug is required." }), { status: 400 });
    }
    const threads = await getCollection("threads");
    const thread = threads.find((t) => t.slug === slug);
    if (!thread) {
      return new Response(JSON.stringify({ message: "Thread not found." }), { status: 404 });
    }
    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content/threads";
    const format = thread.id.endsWith(".mdx") ? "mdx" : "md";
    const contentPath = `${contentRoot}/${slug}/index.${format}`;
    const file = await fetchGitHubFile(repo, contentPath, token, branch);
    let body = "";
    if (file?.content) {
      const content = fromBase64(file.content);
      const frontmatterEnd = content.indexOf("---", 3);
      if (frontmatterEnd > 0) {
        body = content.slice(frontmatterEnd + 3).trim();
      }
    }
    return new Response(JSON.stringify({ thread: { id: thread.id, slug: thread.slug, data: thread.data, body } }), { status: 200 });
  } catch (error) {
    console.error("Thread GET error:", error);
    return new Response(JSON.stringify({ message: "Server error. Please check logs." }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  try {
    const auth = verifyAdminSession(context);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ message: "Unauthorized. Please sign in." }), { status: 401 });
    }
    const params = context.params;
    const form = await context.request.formData();
    const slug = params?.slug || "";
    if (!slug) {
      return new Response(JSON.stringify({ message: "Slug is required." }), { status: 400 });
    }
    const title = form.get("title")?.toString().trim() || "";
    const description = form.get("description")?.toString().trim() || "";
    const date = form.get("date")?.toString().trim() || "";
    const draft = form.get("draft")?.toString() === "true";
    const format = form.get("format")?.toString() === "mdx" ? "mdx" : "md";
    const content = form.get("content")?.toString() || "";
    if (!title || !description || !date) {
      return new Response(JSON.stringify({ message: "Title, description, and date are required." }), { status: 400 });
    }
    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content/threads";
    const files = form.getAll("images").filter(Boolean);
    const uploadedImageRefs: string[] = [];
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      if (!file.type.startsWith("image/")) {
        return new Response(JSON.stringify({ message: "Only image uploads are supported." }), { status: 400 });
      }
      const filename = sanitizeFilename(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const imageContent = toBase64(new Uint8Array(arrayBuffer));
      const imagePath = `${contentRoot}/${slug}/${filename}`;
      await upsertGitHubFile(repo, imagePath, token, branch, `Update image for thread: ${title}`, imageContent);
      uploadedImageRefs.push(`![${filename}](./${filename})`);
    }
    const frontmatterLines = [
      "---",
      `title: "${escapeYaml(title)}"`,
      `description: "${escapeYaml(description)}"`,
      `date: "${escapeYaml(date)}"`,
      draft ? "draft: true" : null,
      "---",
    ].filter(Boolean);
    const body = content.trim();
    const fileContent = `${frontmatterLines.join("\n")}\n\n${body}\n`;
    const contentPath = `${contentRoot}/${slug}/index.${format}`;
    await upsertGitHubFile(repo, contentPath, token, branch, `Update thread: ${title}`, toBase64(fileContent));
    return new Response(JSON.stringify({ message: "Thread updated successfully.", slug }), { status: 200 });
  } catch (error) {
    console.error("Thread PUT error:", error);
    return new Response(JSON.stringify({ message: "Server error. Please check logs." }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const auth = verifyAdminSession(context);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ message: "Unauthorized. Please sign in." }), { status: 401 });
    }
    const params = context.params;
    const slug = params?.slug || "";
    if (!slug) {
      return new Response(JSON.stringify({ message: "Slug is required." }), { status: 400 });
    }
    const threads = await getCollection("threads");
    const thread = threads.find((t) => t.slug === slug);
    if (!thread) {
      return new Response(JSON.stringify({ message: "Thread not found." }), { status: 404 });
    }
    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content/threads";
    const format = thread.id.endsWith(".mdx") ? "mdx" : "md";
    const contentPath = `${contentRoot}/${slug}/index.${format}`;
    const file = await fetchGitHubFile(repo, contentPath, token, branch);
    if (!file?.sha) {
      return new Response(JSON.stringify({ message: "File not found." }), { status: 404 });
    }
    await deleteGitHubFile(repo, contentPath, token, branch, `Delete thread: ${thread.data.title}`, file.sha);
    return new Response(JSON.stringify({ message: "Thread deleted successfully." }), { status: 200 });
  } catch (error) {
    console.error("Thread DELETE error:", error);
    return new Response(JSON.stringify({ message: "Server error. Please check logs." }), { status: 500 });
  }
};
