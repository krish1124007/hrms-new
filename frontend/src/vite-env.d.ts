/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Support address shown on the support page and in the privacy copy. */
  readonly VITE_SUPPORT_EMAIL?: string;
  /** Support phone number shown on the support page. */
  readonly VITE_SUPPORT_PHONE?: string;
  /** Socket.io server origin; defaults to the origin of VITE_API_URL. */
  readonly VITE_SOCKET_URL?: string;
  /** Map tile URL template (Leaflet `{s}/{z}/{x}/{y}`); defaults to OpenStreetMap. */
  readonly VITE_MAP_TILE_URL?: string;
  /** Attribution HTML for the tiles above. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
  /** Nominatim-compatible address search endpoint; empty hides address search. */
  readonly VITE_GEOCODE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
