/**
 * Shared with client process-session — keep free of server-only imports.
 * Outline oneshot on large books can take ~2 min; lease must outlive the call
 * (or be renewed via heartbeat while the call runs).
 */
export const MAP_LEASE_MS = 240_000;
