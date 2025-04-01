import { Hono } from "hono";
import { userRouter } from "./routes/user";
import { blogRouter } from "./routes/blog";
import { cors } from "hono/cors";

const app = new Hono<{
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

const allowedOrigins = ["http://localhost:5173", "https://localhost:5173"];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Check if origin is from Vercel or localhost
      if (origin?.includes(".vercel.app") || allowedOrigins.includes(origin)) {
        return origin;
      }
      return ""; // Reject non-allowed origins
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
    credentials: true,
  })
);

app.route("api/v1/user", userRouter);
app.route("api/v1/blog", blogRouter);

export default app;
