from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
OUTPUT = DATA / "output"
REFERENCE = DATA / "reference"
SQL_DIR = ROOT / "pipeline" / "sql"

UTM40N = 32640  # metre-accurate CRS for Dubai
SQFT_PER_SQM = 10.7639

# Data-quality thresholds
MIN_RECORDS = 10
MIN_UNIT_SQM, MAX_UNIT_SQM = 15, 5000
DETAIL_YEARS = 5  # row-level detail window

# Location Score weights
SCORE_WEIGHTS = {
    "transit": 0.20,
    "amenities": 0.20,
    "yield": 0.20,
    "momentum": 0.15,
    "rental_demand": 0.15,
    "supply_risk": 0.10,
}
SCORE_AMENITY_RADIUS_M = 1500
AMENITY_WEIGHTS = {
    "school": 1.0,
    "healthcare": 1.0,
    "retail": 1.0,
    "park": 1.0,
    "beach": 1.0,
    "restaurant": 0.5,
    "office": 0.25,
}
H3_RES = 8
