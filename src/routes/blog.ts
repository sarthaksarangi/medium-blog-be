import { Hono } from "hono";
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { verify } from "hono/jwt";
import { createBlogInput, updateBlogInput } from "@sarthak.dev/medium-common";
import { encodeBase64 } from "hono/utils/encode";

export const blogRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
  };
  Variables: {
    userId: any;
  };
}>();

async function createSHA1Hash(message: string) {
  // Convert string to ArrayBuffer
  const msgBuffer = new TextEncoder().encode(message);

  // Create hash using SubtleCrypto API (available in Workers)
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

blogRouter.use("/*", async (c, next) => {
  const header = c.req.header("Authorization") || "";
  if (!header) {
    c.status(401);
    return c.json({ error: "Unauthorized no header" });
  }
  const token = header.split("Bearer ")[1];
  const payload = await verify(token, c.env.JWT_SECRET);
  if (!payload) {
    c.status(401);
    return c.json({ error: "Unauthorized no payload" });
  }

  c.set("userId", payload.id);

  await next();
});

blogRouter.post("upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const image = body["image"];

    if (!image || typeof image === "string") {
      return c.json({
        error: "No image provided or invalid image",
      });
    }

    const byteArrayBuffer = await image.arrayBuffer();
    const base64String = encodeBase64(byteArrayBuffer);

    const mimeType = image.type || "image/png";
    const base64Data = `data:${mimeType};base64,${base64String}`;

    const cloudName = c.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = c.env.CLOUDINARY_API_KEY;
    const apiSecret = c.env.CLOUDINARY_API_SECRET;
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "blog_images";
    const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;

    const signature = await createSHA1Hash(stringToSign);

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("folder", folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    console.log(response);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Cloudinary API error:", errorData);
      return c.json({ error: "Failed to upload to Cloudinary" }, 500);
    }

    const result: any = await response.json();

    return c.json({
      success: true,
      secure_url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (e) {
    console.error("Upload error:", e);
    return c.json({ error: "Failed to upload image" }, 500);
  }
});

blogRouter.post("", async (c) => {
  try {
    const body = await c.req.json();
    console.log(body);
    const { success } = createBlogInput.safeParse(body);
    if (!success) {
      c.status(411);
      return c.json({ error: "Incorrect input formatting" });
    }
    const prisma = new PrismaClient({
      datasourceUrl: c.env.DATABASE_URL,
    }).$extends(withAccelerate());

    const userId = c.get("userId");
    //Starting a transaction
    const result = await prisma.$transaction(async (tx) => {
      const blog = await tx.post.create({
        data: {
          title: body.title,
          content: body.content,
          published: body.published || true,
          authorId: userId,
        },
      });

      if (body.image && body.image_id) {
        await tx.image.create({
          data: {
            url: body.image,
            key: body.image_id,
            postId: blog.id,
          },
        });
      }

      return blog;
    });

    return c.json({ blogId: result.id });
  } catch (e) {
    console.log(e);
  }
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
    console.log(body);
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
        image: {
          select: {
            url: true,
            key: true,
            postId: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

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
        image: {
          select: {
            url: true,
            key: true,
            postId: true,
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
