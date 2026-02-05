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

const sanitizeSlug = (value: string): string => {
  return value.trim().toLowerCase().replace(/[\\/]+/g, "-").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").trim();
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
    const portfolioItems = await getCollection("portfolio");
    const item = portfolioItems.find((item) => item.slug === slug);
    if (!item) {
      return new Response(JSON.stringify({ message: "Portfolio item not found." }), { status: 404 });
    }
    return new Response(JSON.stringify({ item: { id: item.slug, slug: item.slug, data: item.data } }), { status: 200 });
  } catch (error) {
    console.error("Portfolio GET error:", error);
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
    const url = form.get("url")?.toString().trim() || "";
    const category = form.get("category")?.toString().trim() || "";
    const size = form.get("size")?.toString().trim() || "small";
    const order = parseInt(form.get("order")?.toString() || "0", 10);
    if (!title || !description || !url || !category) {
      return new Response(JSON.stringify({ message: "Title, description, URL, and category are required." }), { status: 400 });
    }
    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content";
    const portfolioItems = await getCollection("portfolio");
    const existingItem = portfolioItems.find((item) => item.slug === slug);
    const oldCategorySlug = existingItem ? sanitizeSlug(existingItem.data.category) : "";
    const categorySlug = sanitizeSlug(category);
    const itemPath = `${contentRoot}/portfolio/${categorySlug}/${slug}.md`;
    const imageFile = form.get("image") as File | null;
    const imagesFiles = form.getAll("images").filter((f): f is File => f instanceof File);
    let imageUrl = existingItem?.data.image || "";
    const imageUrls: string[] = existingItem?.data.images || [];
    if (imageFile && imageFile.size > 0) {
      const filename = sanitizeFilename(imageFile.name);
      const arrayBuffer = await imageFile.arrayBuffer();
      const imageContent = toBase64(new Uint8Array(arrayBuffer));
      const imagePath = `${contentRoot}/portfolio/${categorySlug}/${slug}/${filename}`;
      await upsertGitHubFile(repo, imagePath, token, branch, `Update image for portfolio item: ${title}`, imageContent);
      imageUrl = `/images/portfolio/${categorySlug}/${slug}/${filename}`;
    }
    if (imagesFiles.length > 0) {
      for (const file of imagesFiles) {
        if (file.size === 0) continue;
        const filename = sanitizeFilename(file.name);
        const arrayBuffer = await file.arrayBuffer();
        const imageContent = toBase64(new Uint8Array(arrayBuffer));
        const imagePath = `${contentRoot}/portfolio/${categorySlug}/${slug}/${filename}`;
        await upsertGitHubFile(repo, imagePath, token, branch, `Add gallery image for portfolio item: ${title}`, imageContent);
        imageUrls.push(`/images/portfolio/${categorySlug}/${slug}/${filename}`);
      }
    }
    const frontmatterLines = [
      "---",
      `title: "${escapeYaml(title)}"`,
      `description: "${escapeYaml(description)}"`,
      `url: "${escapeYaml(url)}"`,
      `category: "${escapeYaml(category)}"`,
      imageUrl ? `image: "${escapeYaml(imageUrl)}"` : null,
      imageUrls.length > 0 ? `images:\n${imageUrls.map(url => `  - "${escapeYaml(url)}"`).join("\n")}` : null,
      `size: "${size}"`,
      `order: ${order}`,
      "---",
    ].filter(Boolean);
    const fileContent = `${frontmatterLines.join("\n")}\n\n`;
    const contentBase64 = toBase64(fileContent);
    await upsertGitHubFile(repo, itemPath, token, branch, `Update portfolio item: ${title}`, contentBase64);
    if (oldCategorySlug && oldCategorySlug !== categorySlug) {
      const oldPath = `${contentRoot}/portfolio/${oldCategorySlug}/${slug}.md`;
      const oldFile = await fetchGitHubFile(repo, oldPath, token, branch);
      if (oldFile?.sha) {
        await deleteGitHubFile(repo, oldPath, token, branch, `Move portfolio item: ${title}`, oldFile.sha);
      }
    }
    return new Response(JSON.stringify({ message: "Portfolio item updated successfully.", slug }), { status: 200 });
  } catch (error) {
    console.error("Portfolio PUT error:", error);
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
    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content";
    const portfolioItems = await getCollection("portfolio");
    const item = portfolioItems.find((item) => item.slug === slug);
    if (!item) {
      return new Response(JSON.stringify({ message: "Portfolio item not found." }), { status: 404 });
    }
    const categorySlug = sanitizeSlug(item.data.category);
    const itemPath = `${contentRoot}/portfolio/${categorySlug}/${slug}.md`;
    const file = await fetchGitHubFile(repo, itemPath, token, branch);
    if (!file?.sha) {
      return new Response(JSON.stringify({ message: "File not found." }), { status: 404 });
    }
    await deleteGitHubFile(repo, itemPath, token, branch, `Delete portfolio item: ${item.data.title}`, file.sha);
    return new Response(JSON.stringify({ message: "Portfolio item deleted successfully." }), { status: 200 });
  } catch (error) {
    console.error("Portfolio DELETE error:", error);
    return new Response(JSON.stringify({ message: "Server error. Please check logs." }), { status: 500 });
  }
};
