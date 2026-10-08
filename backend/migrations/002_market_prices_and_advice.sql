-- CONTENT-CONTRACT.md: market prices and advice cards entered by admins and coordinators.

CREATE TABLE market_prices (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country      TEXT NOT NULL CHECK (country IN ('GH', 'NG', 'KE')),
  crop         TEXT NOT NULL CHECK (crop IN ('maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain')),
  price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg > 0 AND price_per_kg <= 1000000),
  currency     TEXT NOT NULL CHECK (currency IN ('GHS', 'NGN', 'KES')),
  recorded_on  DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL,
  updated_by   TEXT,
  CONSTRAINT market_prices_day_key UNIQUE (country, crop, recorded_on)
);

CREATE TABLE advice_cards (
  seq        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id         TEXT GENERATED ALWAYS AS ('AD-' || seq) STORED UNIQUE,
  crop       TEXT NOT NULL CHECK (crop IN ('maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain')),
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  by_name    TEXT NOT NULL DEFAULT '',
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  updated_by TEXT
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['market_prices', 'advice_cards'] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row()', t, t);
  END LOOP;
END $$;
