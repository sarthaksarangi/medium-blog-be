import { Hono } from "hono";
import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { sign, verify } from "hono/jwt";

export const userRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    userId: any;
  };
}>();

userRouter.get("/auth", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
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
  const user = await prisma.user.findUnique({
    where: {
      id: c.get("userId"),
    },
  });

  if (!user) {
    return c.json({ error: "User not found" });
  }
});

userRouter.post("/signup", async (c) => {
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
    return c.json({ error: "Error while signing up", e: e });
  }
});

userRouter.post("/signin", async (c) => {
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
