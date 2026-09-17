const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from /public
app.use(express.static(path.join(__dirname, "public")));

// Lightweight health check for Railway
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Admin dashboard (clean URL: /admin)
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Fallback: always return the landing page
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BodyHyrox-3D is running on port ${PORT}`);
});
