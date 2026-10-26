# Changelog

## 1.0.0 – 2026-10-03

First release of the kitchen planner.

**Planning**
- 2D floor plan editor: draw walls (length input, angle and endpoint snapping), doors and windows, room from dimensions
  (rectangle, L-shape), floor plan image as template with scale calibration
- Catalog with base, wall and tall cabinets, appliances, cooking island, side panels, vertical grip profiles and furniture;
  snapping to walls and neighbours, free width via drag handles, undo/redo
- Handleless kitchens with grip channels (horizontal/vertical), fronts (doors, single door/flap, 1–4 drawers),
  cooking island with custom column widths, back side as breakfast bar or doors, overhangs, downdraft hob
- Sink BLANCO SUBLINE 500-U (undermount) and tap BLANCO KANO-S Vario as models

**Materials**
- Library with lacquers, wood, stone, ceramic, metal, tiles, floors (scans from Poly Haven, CC0), Silgranit
- Upload custom textures (including normal/roughness maps), custom colours via colour wheel (matt/satin/high gloss)
- Online libraries Poly Haven and ambientCG with import to the server
- Texture alignment per area and element (stretch/tile, size, rotation in degrees, offset)
- Colour adjustment (hue, saturation, brightness, contrast, recolouring, gloss)

**3D**
- Real time with shadows, ambient occlusion, time of day, lighting controls (sun, sky, lamps, softness)
- Photorealistic mode (GPU path tracing), walk-through, showroom view with guided tour and full screen

**Accounts & sharing**
- Login, the first user becomes administrator; sign-up on/off, approval requirement, user management
- Save, open, rename, copy and delete plans in your account
- Showroom link for viewing without login (read-only, revocable)

**Operation**
- Docker image (Node 22, Express, SQLite), runs behind a reverse proxy such as Zoraxy
