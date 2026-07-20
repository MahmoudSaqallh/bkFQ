require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const itemsRoutes = require("./routes/items");
const categoriesRoutes = require("./routes/categories");
const ordersRoutes = require("./routes/orders");
const customersRoutes = require("./routes/customers");
const messagesRoutes = require("./routes/messages");
const settingsRoutes = require("./routes/settings");
const dashboardRoutes = require("./routes/dashboard");
const uploadRoutes = require("./routes/upload");
const complaintsRoutes = require("./routes/complaints");
const notificationsRoutes = require("./routes/notifications");
const reviewsRoutes = require("./routes/reviews");
const subcategoriesRoutes = require("./routes/subcategories");
const bannersRoutes = require("./routes/banners");
const couponsRoutes = require("./routes/coupons");

const app = express();
const PORT = Number(process.env.PORT || 3001);

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Dev-friendly: allow any localhost / 127.0.0.1 origin
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, try again later" },
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many orders, try again later" },
});

app.get("/", (_req, res) => {
  res.json({
    name: "FashiQue API",
    status: "ok",
    port: PORT,
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const { query } = require("./config/db");
    await query("SELECT 1 AS ok");
    return res.json({ ok: true, database: "connected" });
  } catch (err) {
    console.error("Health check failed:", err.message);
    return res.status(503).json({
      ok: false,
      database: "disconnected",
      error: "Database unavailable. Run: npm run db:init",
    });
  }
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/products", itemsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/orders", orderLimiter, ordersRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/subcategories", subcategoriesRoutes);
app.use("/api/banners", bannersRoutes);
app.use("/api/coupons", couponsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/upload", uploadRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS blocked" });
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`FashiQue API running on http://localhost:${PORT}`);
});
