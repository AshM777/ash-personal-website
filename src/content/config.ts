import { defineCollection, z } from "astro:content";

const threads = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional()
  }),
});

const work = defineCollection({
  type: "content",
  schema: z.object({
    company: z.string(),
    role: z.string(),
    dateStart: z.coerce.date(),
    dateEnd: z.union([z.coerce.date(), z.string()]),
  }),
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    demoURL: z.string().optional(),
    repoURL: z.string().optional()
  }),
});

const essays = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
  }),
});

const library = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    author: z.string(),
    coverImage: z.string(),
    date: z.coerce.date().optional(),
  }),
});

const gallery = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    imageUrl: z.string(),
    category: z.string().optional(),
  }),
});

const portfolio = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
    category: z.string(),
    image: z.string().url().optional(),
    images: z.array(z.string().url()).optional(),
    size: z.enum(["small", "wide", "tall", "large"]).default("small"),
    order: z.number().default(0),
  }),
});

export const collections = { threads, work, projects, essays, library, gallery, portfolio };
