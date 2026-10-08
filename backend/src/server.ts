import express from "express";

const app = express();

const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());

type Farmer = {
  id: number;
  name: string;
  phone: string;
  region: string | null;
  language: string | null;
  farm_size: number | null;
  created_at: string;
};

// In-memory store until Week 4 swaps in RDS.
const farmers = new Map<number, Farmer>();
let nextId = 1;

app.get("/", (_req, res) => {
  res.json({
    service: "farmer-profile-service",
    version: "0.1.0",
    description: "AgroConnect Ghana — farmer profile API (ICS 534, Group 3)",
    endpoints: [
      { method: "GET", path: "/", description: "service metadata" },
      { method: "GET", path: "/health", description: "liveness probe" },
      { method: "POST", path: "/farmers", description: "create a farmer" },
      { method: "GET", path: "/farmers/{farmer_id}", description: "fetch a farmer" },
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.post("/farmers", (req, res) => {
  const { name, phone, region, language, farm_size } = req.body ?? {};

  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "name is required" });
  }
  if (typeof phone !== "string" || phone.trim() === "") {
    return res.status(400).json({ error: "phone is required" });
  }

  const id = nextId++;
  const farmer: Farmer = {
    id,
    name,
    phone,
    region: region ?? null,
    language: language ?? null,
    farm_size: farm_size ?? null,
    created_at: new Date().toISOString(),
  };
  farmers.set(id, farmer);

  return res.status(201).json(farmer);
});

app.get("/farmers/:farmer_id", (req, res) => {
  const farmer = farmers.get(Number(req.params.farmer_id));
  if (!farmer) {
    return res.status(404).json({ error: "farmer not found" });
  }

  return res.json(farmer);
});

app.listen(PORT, () => {
  console.log(`AgroConnect API running on port ${PORT}`);
});
