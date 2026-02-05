import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { verifyAdminSession } from "@lib/auth";

type GitHubFile = {
  sha?: string;
};

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
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
};

const sanitizeFilename = (name: string): string => {
  const base = name.split("/").pop() || "image";
  return base
    .replace(/[\\]+/g, "")
    .replace(/[^\w.\-]/g, "_");
};

const escapeYaml = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const buildApiPath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const fetchGitHubFile = async (
  repo: string,
  path: string,
  token: string,
  branch: string
): Promise<GitHubFile | null> => {
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(
    path
  )}?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  return (await response.json()) as GitHubFile;
};

const upsertGitHubFile = async (
  repo: string,
  path: string,
  token: string,
  branch: string,
  message: string,
  contentBase64: string
): Promise<void> => {
  const existing = await fetchGitHubFile(repo, path, token, branch);
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(
    path
  )}`;

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
    throw new Error(
      `GitHub write failed: ${response.status} ${errorBody?.message || ""}`.trim()
    );
  }
};

const deleteGitHubFile = async (
  repo: string,
  path: string,
  token: string,
  branch: string,
  message: string,
  sha: string
): Promise<void> => {
  const url = `https://api.github.com/repos/${repo}/contents/${buildApiPath(
    path
  )}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message,
      branch,
      sha,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      `GitHub delete failed: ${response.status} ${errorBody?.message || ""}`.trim()
    );
  }
};

// GET - List all portfolio items
export const GET: APIRoute = async (context) => {
  try {
    const auth = verifyAdminSession(context);
    if (!auth.authenticated) {
      return new Response(
        JSON.stringify({ message: "Unauthorized. Please sign in." }),
        { status: 401 }
      );
    }

    const portfolioItems = await getCollection("portfolio");
    const items = portfolioItems.map((item) => ({
      id: item.slug,
      slug: item.slug,
      data: item.data,
    }));

    return new Response(JSON.stringify({ items }), { status: 200 });
  } catch (error) {
    console.error("Portfolio GET error:", error);
    return new Response(
      JSON.stringify({ message: "Server error. Please check logs." }),
      { status: 500 }
    );
  }
};

// POST - Create new portfolio item
export const POST: APIRoute = async (context) => {
  try {
    const auth = verifyAdminSession(context);
    if (!auth.authenticated) {
      return new Response(
        JSON.stringify({ message: "Unauthorized. Please sign in." }),
        { status: 401 }
      );
    }

    const form = await context.request.formData();

    const title = form.get("title")?.toString().trim() || "";
    const description = form.get("description")?.toString().trim() || "";
    const url = form.get("url")?.toString().trim() || "";
    const category = form.get("category")?.toString().trim() || "";
    const size = form.get("size")?.toString().trim() || "small";
    const order = parseInt(form.get("order")?.toString() || "0", 10);

    if (!title || !description || !url || !category) {
      return new Response(
        JSON.stringify({ message: "Title, description, URL, and category are required." }),
        { status: 400 }
      );
    }

    const repo = getRequiredEnv("GITHUB_REPO");
    const token = getRequiredEnv("GITHUB_TOKEN");
    const branch = import.meta.env.GITHUB_BRANCH || "main";
    const contentRoot = import.meta.env.GITHUB_CONTENT_PATH || "src/content";

    const slug = sanitizeSlug(title);
    const categorySlug = sanitizeSlug(category);
    const itemPath = `${contentRoot}/portfolio/${categorySlug}/${slug}.md`;

    // Handle image uploads
    const imageFile = form.get("image") as File | null;
    const imagesFiles = form.getAll("images").filter((f): f is File => f instanceof File);
    let imageUrl = "";
    const imageUrls: string[] = [];

    if (imageFile && imageFile.size > 0) {
      const filename = sanitizeFilename(imageFile.name);
      const arrayBuffer = await imageFile.arrayBuffer();
      const imageContent = toBase64(new Uint8Array(arrayBuffer));
      const imagePath = `${contentRoot}/portfolio/${categorySlug}/${slug}/${filename}`;

      await upsertGitHubFile(
        repo,
        imagePath,
        token,
        branch,
        `Add image for portfolio item: ${title}`,
        imageContent
      );

      imageUrl = `/images/portfolio/${categorySlug}/${slug}/${filename}`;
    }

    if (imagesFiles.length > 0) {
      for (const file of imagesFiles) {
        if (file.size === 0) continue;
        const filename = sanitizeFilename(file.name);
        const arrayBuffer = await file.arrayBuffer();
        const imageContent = toBase64(new Uint8Array(arrayBuffer));
        const imagePath = `${contentRoot}/portfolio/${categorySlug}/${slug}/${filename}`;

        await upsertGitHubFile(
          repo,
          imagePath,
          token,
          branch,
          `Add gallery image for portfolio item: ${title}`,
          imageContent
        );

        imageUrls.push(`/images/portfolio/${categorySlug}/${slug}/${filename}`);
      }
    }

    // Build frontmatter
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

    await upsertGitHubFile(
      repo,
      itemPath,
      token,
      branch,
      `Add portfolio item: ${title}`,
      contentBase64
    );

    return new Response(
      JSON.stringify({
        message: "Portfolio item created successfully.",
        slug,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Portfolio POST error:", error);
    return new Response(
      JSON.stringify({ message: "Server error. Please check logs." }),
      { status: 500 }
    );
  }
};

