import { Hono } from "hono";
import { userRouter } from "./routes/user";
import { blogRouter } from "./routes/blog";
import { cors } from "hono/cors";

const app = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    userId: any;
  };
}>();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://medium-blog-fe.vercel.app",
      "https://medium-blog-fe-sarthaksarangis-projects.vercel.app",
      "https://medium-blog-fe-git-main-sarthaksarangis-projects.vercel.app",
    ],
    credentials: true,
  })
);

app.route("api/v1/user", userRouter);
app.route("api/v1/blog", blogRouter);

export default app;
