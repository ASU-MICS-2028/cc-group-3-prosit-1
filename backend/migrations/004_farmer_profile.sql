-- Prosit 1 "Real Data Requirements": farm details (soil, seasons), technology access, financial profile,
-- and extension history / needs. All optional, so records registered before this migration stay valid.
-- Arrays are checked against their allowed values with <@ (contained by).

ALTER TABLE farmers
  ADD COLUMN soil_type            TEXT CHECK (soil_type IN ('loamy', 'sandy', 'clay', 'silt', 'unknown')),
  ADD COLUMN seasons              TEXT[] NOT NULL DEFAULT '{}' CHECK (seasons <@ ARRAY['major', 'minor', 'dry']),
  ADD COLUMN phone_type           TEXT CHECK (phone_type IN ('smartphone', 'feature', 'none')),
  ADD COLUMN data_plan            TEXT CHECK (data_plan IN ('none', 'daily', 'weekly', 'monthly')),
  ADD COLUMN contact_channel      TEXT CHECK (contact_channel IN ('app', 'sms', 'call', 'whatsapp', 'agent')),
  ADD COLUMN income_sources       TEXT[] NOT NULL DEFAULT '{}' CHECK (income_sources <@ ARRAY['crops', 'livestock', 'trading', 'wage', 'remittance', 'other']),
  ADD COLUMN has_bank_account     BOOLEAN,
  ADD COLUMN mobile_money_use     TEXT CHECK (mobile_money_use IN ('none', 'sometimes', 'regular')),
  ADD COLUMN needs                TEXT[] NOT NULL DEFAULT '{}' CHECK (needs <@ ARRAY['inputs', 'credit', 'market', 'training', 'storage', 'irrigation', 'pests', 'weather']),
  ADD COLUMN last_extension_visit TEXT CHECK (last_extension_visit IN ('never', 'this_year', 'over_a_year'));
