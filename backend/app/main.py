from datetime import datetime, timezone
from itertools import count

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="farmer-profile-service", version="0.1.0")

# ponytail: in-memory dict until Week 4 swaps in RDS.
_farmers: dict[int, dict] = {}
_ids = count(1)


class FarmerIn(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    region: str | None = None
    language: str | None = None
    farm_size: float | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "farmer-profile-service"}


@app.post("/farmers", status_code=201)
def create_farmer(farmer: FarmerIn):
    fid = next(_ids)
    rec = farmer.model_dump() | {
        "id": fid,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _farmers[fid] = rec
    return rec


@app.get("/farmers/{farmer_id}")
def get_farmer(farmer_id: int):
    rec = _farmers.get(farmer_id)
    if not rec:
        raise HTTPException(status_code=404, detail="farmer not found")
    return rec
