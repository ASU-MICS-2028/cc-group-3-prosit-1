import express from "express";

const app = express();

const PORT = Number(process.env.PORT) || 3001;

app.get("/", (_req, res) => {
  res.json({
    message: "AgroConnect API is running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`AgroConnect API running on port ${PORT}`);
});