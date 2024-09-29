import { Hono } from "hono";
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import "dotenv/config";
import { sign } from "hono/jwt";

const app = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
}>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/api/v1/user/signup", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  const body = await c.req.json();
  try {
    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: body.password,
      },
    });

    const token = await sign({ id: user.id }, c.env.JWT_SECRET);
    return c.json({ jwt: token });
  } catch (e) {
    c.status(403);
    return c.json({ error: "Rrror while signing up", e: e });
  }
});

app.post("/api/v1/user/signin", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

  const body = await c.req.json();
  const user = await prisma.user.findUnique({
    where: { email: body.email },
  });

  if (!user) {
    c.status(404);
    c.json({ error: "User not found" });
    return;
  }
  const token = await sign({ id: user.id }, c.env.JWT_SECRET);
  return c.json({
    success: true,
    token,
  });
});

app.post("/api/v1/blog", (c) => {
  return c.text("Blog route");
});

app.put("/api/v1/blog", (c) => {
  ``;
  return c.text("Edit Blog route");
});

app.get("api/v1/blog", (c) => {
  return c.text("Get Blogs Route");
});
app.get("api/v1/blog/:id", (c) => {
  return c.text("Get Blog with id Route");
});

app.get("api/v1/blog/bulk", (c) => {
  return c.text("Get all blogs route");
});

export default app;
