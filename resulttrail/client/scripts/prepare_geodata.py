"""Build small, attributed state-level boundary assets for the reviewer map.

The inputs are public geoBoundaries/GRID3 data. Run from any directory with
`python client/scripts/prepare_geodata.py` to regenerate the checked-in files.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

PUBLIC = Path(__file__).resolve().parents[1] / "public"
ADM1 = PUBLIC / "nigeria-adm1.geojson"
ADM2_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2_simplified.geojson"
WARD_URL = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/GRID3_NGA_operational_wards_v4_0/FeatureServer/0/query"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [ring for polygon in geometry["coordinates"] for ring in polygon]


def inside_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for current, following in zip(ring, ring[1:] + ring[:1]):
        x1, y1 = current[:2]
        x2, y2 = following[:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def inside_geometry(point: tuple[float, float], geometry: dict) -> bool:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return any(inside_ring(point, polygon[0]) and not any(inside_ring(point, hole) for hole in polygon[1:]) for polygon in polygons)


def area(ring: list[list[float]]) -> float:
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) / 2


def interior_point(geometry: dict) -> tuple[float, float]:
    exterior = max(rings(geometry), key=area)
    ys = [point[1] for point in exterior]
    for fraction in (.5, .33, .67, .2, .8):
        y = min(ys) + (max(ys) - min(ys)) * fraction
        crosses = sorted(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
                         for a, b in zip(exterior, exterior[1:] + exterior[:1])
                         if (a[1] > y) != (b[1] > y))
        spans = [(crosses[i + 1] - crosses[i], (crosses[i] + crosses[i + 1]) / 2)
                 for i in range(0, len(crosses) - 1, 2)]
        if spans:
            point = (max(spans)[1], y)
            if inside_geometry(point, geometry):
                return point
    raise ValueError("Could not locate interior point")


def write_collection(path: Path, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")


LGA_ALIASES = {"Jigawa": {"kirikasamma": "Kiri Kasama", "birniwa": "Biriniwa"},
               "Kano": {"garummallam": "Garun Malam"}, "Kebbi": {"bagudo": "Bagudu"},
               "Bauchi": {"damban": "Dambam"}}


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def fetch_wards(state: str, lga_names: list[str]) -> tuple[str, list[dict]]:
    source_state = "FCT, Abuja" if state == "Abuja Federal Capital Territory" else state
    params = {"where": f"state='{source_state.replace(chr(39), chr(39) * 2)}'", "outFields": "state,lga,ward",
              "returnGeometry": "true", "outSR": 4326, "geometryPrecision": 4,
              "maxAllowableOffset": .003, "f": "geojson", "resultRecordCount": 2000}
    response = requests.get(WARD_URL, params=params, timeout=90)
    response.raise_for_status()
    payload = response.json()
    if "error" in payload or payload.get("properties", {}).get("exceededTransferLimit"):
        raise ValueError(f"Incomplete ward response for {state}: {payload.get('error')}")
    by_name = {normalize(name): name for name in lga_names}
    by_name.update(LGA_ALIASES.get(state, {}))
    features = []
    for item in payload["features"]:
        if not item.get("geometry") or not item["properties"].get("ward"):
            continue
        raw_lga = item["properties"]["lga"]
        if normalize(raw_lga) not in by_name:
            raise ValueError(f"Ward LGA unmatched: {state}/{raw_lga}")
        features.append({"type": "Feature", "properties": {"name": item["properties"]["ward"],
                         "lga": by_name[normalize(raw_lga)]}, "geometry": item["geometry"]})
    return state, features


def main() -> None:
    states = json.loads(ADM1.read_text(encoding="utf-8"))["features"]
    response = requests.get(ADM2_URL, timeout=90)
    response.raise_for_status()
    lgas = response.json()["features"]
    by_state: dict[str, list[dict]] = {feature["properties"]["shapeName"]: [] for feature in states}
    for item in lgas:
        point = interior_point(item["geometry"])
        matches = [state["properties"]["shapeName"] for state in states if inside_geometry(point, state["geometry"])]
        if len(matches) != 1:
            raise ValueError(f"LGA {item['properties']['shapeName']} mapped to {matches}")
        by_state[matches[0]].append({"type": "Feature", "properties": {"name": item["properties"]["shapeName"],
                                    "id": item["properties"]["shapeID"]}, "geometry": item["geometry"]})
    if sum(map(len, by_state.values())) != 774:
        raise ValueError("Expected 774 LGA polygons")
    for state, features in by_state.items():
        write_collection(PUBLIC / "geo" / "lgas" / f"{slug(state)}.json", features)
    ward_index: dict[str, dict[str, list[str]]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(fetch_wards, state, [item["properties"]["name"] for item in features])
                   for state, features in by_state.items()]
        for future in as_completed(futures):
            state, features = future.result()
            write_collection(PUBLIC / "geo" / "wards" / f"{slug(state)}.json", features)
            names: dict[str, set[str]] = {}
            for feature in features:
                names.setdefault(feature["properties"]["lga"], set()).add(feature["properties"]["name"])
            ward_index[state] = {lga: sorted(wards) for lga, wards in names.items()}
            print(state, len(by_state[state]), "LGAs,", len(features), "wards")
    index = {state: sorted({feature["properties"]["name"] for feature in features}) for state, features in by_state.items()}
    (PUBLIC / "geo" / "lga-index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    (PUBLIC / "geo" / "ward-index.json").write_text(json.dumps(ward_index, separators=(",", ":")), encoding="utf-8")
    print("Total:", len(lgas), "LGAs; assets generated in", PUBLIC / "geo")


if __name__ == "__main__":
    main()
