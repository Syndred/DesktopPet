# Optional NASA GIBS basemap

This change keeps OpenStreetMap as the default. The existing **Exploration settings → Basemap** selector can explicitly select NASA Blue Marble. It does not enable location, create an account, alter game coordinates, or change discovery/capture authorization.

## Source and usage review (2026-10-27)

- [GIBS introduction and data-use acknowledgement](https://nasa-gibs.github.io/gibs-api-docs/) documents integration into applications and utilities. This application credits imagery from NASA GIBS (part of ESDIS) and MODIS Blue Marble, with a visible source link.
- [Map libraries and scripted access](https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/) explicitly describes programmatic clients. Its bulk-download section defines bulk as more than one million imagery tiles in 24 hours, requiring advance coordination. This is not a bulk/offline-download feature: only the active view is requested, six requests maximum in flight and a seven-day local cache. Native acceptance must impose its own small finite request budget and a fixed number of viewport operations.
- [Official WMTS capabilities](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml) was read directly. `BlueMarble_NextGeneration` links `GoogleMapsCompatible_Level8`, EPSG:3857, 256 × 256 tiles, native levels 0–8, and `image/jpeg`. The fixed REST template uses row before column. The application exposes levels 2–19, but MapLibre requests no raster level above 8: higher camera zoom only magnifies the existing raster.
- [NASA description of Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) identifies historical 2004 satellite composites and approximately 500 m source detail. The UI therefore explicitly says historical imagery, not a street map, and warns that magnification adds no detail. No current-road, navigation, current-imagery, or NASA endorsement claim is made.

No API key, paid account, new cloud service, user location, or third-party identity is needed. Automated OSM tile fetching is **not** used for this acceptance route; the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) remains separately applicable to the unchanged OSM option.

## Endpoint, cache and switch boundaries

Only compiled, fixed provider descriptors are accepted. Renderer requests carry a provider ID and integer tile coordinates, not a URL. Both the IPC entry and completion validate that the selected provider still matches; stale requests cannot paint the replacement map. The local protocol encodes the provider ID. MapLibre tears down the old map on provider changes.

The cache namespace includes provider, layer, matrix and format. JPEG and PNG have distinct MIME and file extensions. HTTP redirects are rejected, responses must preserve the exact requested URL and MIME, and image signatures/size are checked. No failed request falls back to a different provider. No arbitrary renderer endpoint or cache path is accepted.

## Verification scope

`node --test apps/pc-app/runtime/features/discovery/tests/map-provider.test.cjs` verifies default/provider selection, fixed row/column URL, MIME/cache separation, source bounds, invalid URL rejection, redirect/wrong-image rejection, request deduplication and stale-provider response rejection. UI type checking is separate.

These engineering checks do not establish M01/G01/M07 native acceptance. The new audited executable still needs actual raster rendering, zoom/pan, game-boundary geometry, visible source/low-resolution notice, failure and recovery checks. Historical coarse imagery cannot be presented as proof of street-level accuracy, GPS accuracy, production cloud discovery, or a passed unexecuted case.
