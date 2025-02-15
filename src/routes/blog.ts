import { Hono } from "hono";
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { verify } from "hono/jwt";
import { createBlogInput, updateBlogInput } from "@sarthak.dev/medium-common";

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
    return c.json({ error: "Incorrect input formatting" });
  }
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  const userId = c.get("userId");

  const blog = await prisma.post.create({
    data: {
      title: body.title,
      content: body.content,
      published: body.published || true,
      authorId: userId,
    },
  });
  return c.json({ blogId: blog.id });
});

//Update the blog
blogRouter.put(":id", async (c) => {
  try {
    const id = c.req.param("id");
    const prisma = new PrismaClient({
      datasourceUrl: c.env.DATABASE_URL,
    }).$extends(withAccelerate());

    const existingBlog = await prisma.post.findUnique({
      where: { id },
    });

    if (!existingBlog) {
      c.status(404);
      return c.json({ success: false, error: "Blog post not found" });
    }

    const body = await c.req.json();
    const result = updateBlogInput.safeParse(body);
    if (!result.success) {
      c.status(400);
      return c.json({
        success: false,
        error: "Invalid input",
        details: result.error.format(),
      });
    }
    const updateData = {
      title: result.data.title ?? existingBlog.title,
      content: result.data.content ?? existingBlog.title,
    };

    const blog = await prisma.post.update({
      data: updateData,
      where: {
        id: id,
      },
      include: {
        author: {
          select: {
            name: true,
          },
        },
      },
    });
    return c.json({
      success: true,
      message: "Blog updated successfully",
      blog: {
        id: blog.id,
        title: blog.title,
        content: blog.content,
        publishedDate: blog.createdAt.toISOString(),
        authorName: blog.author.name,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error: any) {
    console.error("Error updating blog:", error);
    c.status(500);
    return c.json({
      success: false,
      error: "Failed to update blog post",
    });
  }
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
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        authorId: true,
        author: {
          select: {
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
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
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  try {
    const id = c.req.param("id");
    const blog = await prisma.post.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        authorId: true,
        author: {
          select: {
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
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

//Delete Blog Route

blogRouter.delete(":id", async (c) => {
  try {
    const blogId = c.req.param("id");
    const prisma = new PrismaClient({
      datasourceUrl: c.env.DATABASE_URL,
    }).$extends(withAccelerate());

    const blog = await prisma.post.findUnique({
      where: {
        id: blogId,
      },
    });
    if (!blog) {
      c.status(404);
      return c.json({
        success: false,
        error: "Blog not found!",
      });
    }
    await prisma.post.delete({
      where: {
        id: blogId,
      },
    });

    return c.json({
      success: true,
      message: `Blog post deleted Successfully!`,
    });
  } catch (e: any) {
    console.error(
      e instanceof Error
        ? e.message
        : "Failed to delete Blog. Please Contact System Administrator."
    );
    c.status(500);
    return c.json({
      success: false,
      error: "Failed to delete blog. Please try again later.",
    });
  }
});
