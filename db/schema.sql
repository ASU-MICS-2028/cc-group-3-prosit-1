-- A1 — Farmers: one row per registered farmer
CREATE TABLE farmers (
  id                  SERIAL PRIMARY KEY,        -- auto-numbered unique id
  name                TEXT NOT NULL,
  phone               TEXT UNIQUE NOT NULL,      -- one farmer, one registration
  region              TEXT,
  language            TEXT,
  farm_size_hectares  NUMERIC,
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);

-- A2 — Farms: one row per plot. A farmer may have many.
CREATE TABLE farms (
  id            SERIAL PRIMARY KEY,
  farmer_id     INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  soil_type     TEXT,
  size_hectares NUMERIC,
  in_use        BOOLEAN DEFAULT true,            -- is the plot active
  created_at    TIMESTAMP DEFAULT now()
);

-- A3 — Crops: one row per crop grown on a farm (a farm may grow several)
CREATE TABLE farm_crops (
  id         SERIAL PRIMARY KEY,
  farm_id    INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_type  TEXT NOT NULL
);

-- A4 — Media: image references only. The files live in object storage.
CREATE TABLE farm_media (
  id          SERIAL PRIMARY KEY,
  farm_id     INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  object_key  TEXT NOT NULL,                     -- e.g. farms/42/photo-1.jpg in S3
  caption     TEXT,
  uploaded_at TIMESTAMP DEFAULT now()
);
