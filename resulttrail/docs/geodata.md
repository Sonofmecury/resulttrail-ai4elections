# Geographic boundary attribution

The state and FCT outlines in the reviewer map are from geoBoundaries, `gbOpen`, Nigeria ADM1 simplified GeoJSON, licensed CC BY 4.0. Source: https://www.geoboundaries.org/ and https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson . The local copy is `client/public/nigeria-adm1.geojson`.

The 774 LGA outlines are derived from the matching geoBoundaries `gbOpen` Nigeria ADM2 simplified GeoJSON at https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2_simplified.geojson , also CC BY 4.0. `client/scripts/prepare_geodata.py` assigns each LGA to a state by polygon containment and produces small state files under `client/public/geo/lgas/`.

Ward outlines are derived from **GRID3 NGA – Operational Wards v4.0**, copyright 2026 The Trustees of Columbia University in the City of New York, licensed CC BY-SA 4.0. Source: https://www.arcgis.com/home/item.html?id=74cf76766bec4481aa03523e0e1fdddc and https://data.grid3.org/ . The simplified, state-split derivative files in `client/public/geo/wards/` are distributed under CC BY-SA 4.0. The same build script uses a precision/offset suitable for a compact interactive overview and harmonizes five LGA name variants with the geoBoundaries names. The full GRID3 geometries remain available at the source link.

GRID3 describes these ward boundaries as operational and not yet fully validated by government authorities. They may not align perfectly with the 2022 state/LGA layer or with electoral ward boundaries. They are provided for geographic context, not as legal or official boundaries. See the source metadata and license before reusing the ward derivative files.

The map overlays only ResultTrail's illustrative received reports. It does not use an official election result feed, independently confirm geographic assignments, or infer any real election outcome.
