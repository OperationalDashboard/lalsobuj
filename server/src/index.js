require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth");
const busesRoutes = require("./routes/buses");
const staffRoutes = require("./routes/staff");
const rotationsRoutes = require("./routes/rotations");
const attendanceRoutes = require("./routes/attendance");
const accountsRoutes = require("./routes/accounts");
const maintenanceRoutes = require("./routes/maintenance");
const tripsRoutes = require("./routes/trips");
const activityLogsRoutes = require("./routes/activityLogs");
const chatRoutes = require("./routes/chat");
const hotelsRoutes = require("./routes/hotels");
const settingsRoutes = require("./routes/settings");
const routesRoutes = require("./routes/routes");
const countersRoutes = require("./routes/counters");
const permissionsRoutes = require("./routes/permissions");
const discountTypesRoutes = require("./routes/discountTypes");
const salaryRoutes = require("./routes/salary");
const onlineAccountsRoutes = require("./routes/onlineAccounts");

const app = express();
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'");
  next();
});
app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store, private"); next(); });
const loginAttempts = new Map();
app.use("/api/auth/login", (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, started: now };
  if (now - record.started > 15 * 60 * 1000) { record.count = 0; record.started = now; }
  record.count += 1; loginAttempts.set(key, record);
  if (record.count > 10) return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  res.on("finish", () => { if (res.statusCode < 400) loginAttempts.delete(key); });
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, name: "Lal Sabuj Paribahan API" }));

app.use("/api/auth", authRoutes);
app.use("/api/buses", busesRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/rotations", rotationsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/trips", tripsRoutes);
app.use("/api/activity-logs", activityLogsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/hotels", hotelsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/routes", routesRoutes);
app.use("/api/counters", countersRoutes);
app.use("/api/roles", permissionsRoutes);
app.use("/api/discount-types", discountTypesRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/online-accounts", onlineAccountsRoutes);

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Serve the built React frontend (client/dist) and let client-side routing
// handle any non-API path. Build it first with `npm run build` in client/.
const clientDist = path.join(__dirname, "../../client/dist");
app.use("/assets", express.static(path.join(clientDist, "assets"), {
  immutable: true,
  maxAge: "1y",
}));
app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html"), {
  headers: { "Cache-Control": "no-cache" },
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`LSP API running on http://localhost:${PORT}`));
