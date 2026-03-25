/**
 * Feature flags for optional UI enhancements.
 *
 * Each flag is a simple boolean constant. Set to `false` to revert the
 * associated feature globally — no other code changes required.
 */

/**
 * GLOBAL_CONTAINER_HEADERS
 *
 * Wraps every screen header in a floating card container that mirrors the
 * Bento Box / Recent Files card style (border, border-radius, margin).
 *
 * When true  → all headers render inside a rounded, bordered card.
 * When false → all headers render in their original flush layout.
 *
 * Controlled centrally via AppHeaderContainer — flipping this flag once
 * reverts every screen simultaneously without touching individual files.
 */
export const GLOBAL_CONTAINER_HEADERS = true;
