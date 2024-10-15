import { Hono } from "hono";
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { verify } from "hono/jwt";
import { createBlogInput, updatedBlogInput } from "@sarthak.dev/medium-common";

export const blogRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    userId: any;
  };
}>();

blogRouter.use("/*", async (c, next) => {
  const header = c.req.header("Authorization") || "";
  if (!header) {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }
  const token = header.split("Bearer ")[1];
  const payload = await verify(token, c.env.JWT_SECRET);
  if (!payload) {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }

  c.set("userId", payload.id);

  await next();
});

blogRouter.post("", async (c) => {
  const body = await c.req.json();
  const { success } = createBlogInput.safeParse(body);
  if (!success) {
    c.status(411);
    c.json({ error: "Incorrect input formatting" });
  }
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  const userId = c.get("userId");

  const blog = await prisma.post.create({
    data: {
      title: body.title,
      content: body.content,
      published: body.published,
      authorId: userId,
    },
  });
  return c.json({ blogId: blog.id });
});

blogRouter.put("", async (c) => {
  const body = await c.req.json();
  const { success } = updatedBlogInput.safeParse(body);
  if (!success) {
    c.status(411);
    c.json({ error: "Incorrect input formatting" });
  }

  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  const blog = await prisma.post.update({
    data: {
      title: body.title,
      content: body.content,
    },
    where: {
      id: body.id,
    },
  });
  return c.json({ blogId: blog.id });
});

blogRouter.get("bulk", async (c) => {
  const page: any = c.req.query("page") || 1;
  const limit = 10;
  const startIndex = (page - 1) * limit;

  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  try {
    const blogs = await prisma.post.findMany({
      skip: startIndex,
      take: limit,
    });
    console.log("here");
    if (blogs.length === 0) {
      c.status(404);
      return c.json({ error: "No blogs found" });
    }

    return c.json({ blogs: blogs });
  } catch (e) {
    c.status(500);
    console.log(e);
    return c.json({ error: "Some error occured while fetching the blog" });
  }
});

blogRouter.get(":id", async (c) => {
  const primsa = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  try {
    const id = c.req.param("id");
    const blog = await primsa.post.findFirst({
      where: {
        id,
      },
    });
    if (!blog) {
      c.status(404);
      return c.json({ error: "Blog Not found" });
    }
    return c.json({ blog: blog });
  } catch (e) {
    c.status(500);
    console.log(e);
    return c.json({ error: "Some error occured while fetching the blog" });
  }
});
