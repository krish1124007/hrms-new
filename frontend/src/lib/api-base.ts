/**
 * The API's base URL. `VITE_API_URL` (frontend/.env, git-ignored) names it;
 * without it a production build calls the API on its own origin
 * (`/api/v1`, which nginx proxies to the backend) — never a developer's
 * `localhost`, which would break the live site for everyone. Only the dev
 * server falls back to the local API.
 */
export function resolveApiBase(env: { VITE_API_URL?: string; PROD?: boolean }): string {
  const fromEnv = env.VITE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1';
}

export const API_BASE_URL = resolveApiBase(import.meta.env);
