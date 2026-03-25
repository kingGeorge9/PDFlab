/**
 * editorFontService.ts
 *
 * Handles loading bundled fonts for both the native RN UI (font picker preview)
 * and the WebView editor (via @font-face CSS injection).
 *
 * Fonts are bundled as .ttf files in assets/fonts/ (copied from @expo-google-fonts).
 * They are loaded natively with expo-font and injected into the WebView using
 * file:// URIs (fast — no base64 conversion needed).
 */

import { Asset } from "expo-asset";
import * as Font from "expo-font";

// ── Font asset references ─────────────────────────────────────────────────
// require() returns a numeric asset ID that expo-asset can resolve.

const FONT_ASSETS = {
  Inter_400Regular: require("@/assets/fonts/Inter_400Regular.ttf"),
  Inter_700Bold: require("@/assets/fonts/Inter_700Bold.ttf"),
  Roboto_400Regular: require("@/assets/fonts/Roboto_400Regular.ttf"),
  Roboto_700Bold: require("@/assets/fonts/Roboto_700Bold.ttf"),
  OpenSans_400Regular: require("@/assets/fonts/OpenSans_400Regular.ttf"),
  OpenSans_700Bold: require("@/assets/fonts/OpenSans_700Bold.ttf"),
  Lato_400Regular: require("@/assets/fonts/Lato_400Regular.ttf"),
  Lato_700Bold: require("@/assets/fonts/Lato_700Bold.ttf"),
  Montserrat_400Regular: require("@/assets/fonts/Montserrat_400Regular.ttf"),
  Montserrat_700Bold: require("@/assets/fonts/Montserrat_700Bold.ttf"),
  Merriweather_400Regular: require("@/assets/fonts/Merriweather_400Regular.ttf"),
  Merriweather_700Bold: require("@/assets/fonts/Merriweather_700Bold.ttf"),
  Poppins_400Regular: require("@/assets/fonts/Poppins_400Regular.ttf"),
  Poppins_700Bold: require("@/assets/fonts/Poppins_700Bold.ttf"),
};

/** Map of CSS font-family name → asset keys (regular + bold). */
const FONT_FAMILY_MAP: Record<
  string,
  { regular: keyof typeof FONT_ASSETS; bold: keyof typeof FONT_ASSETS }
> = {
  Inter: { regular: "Inter_400Regular", bold: "Inter_700Bold" },
  Roboto: { regular: "Roboto_400Regular", bold: "Roboto_700Bold" },
  "Open Sans": { regular: "OpenSans_400Regular", bold: "OpenSans_700Bold" },
  Lato: { regular: "Lato_400Regular", bold: "Lato_700Bold" },
  Montserrat: {
    regular: "Montserrat_400Regular",
    bold: "Montserrat_700Bold",
  },
  Merriweather: {
    regular: "Merriweather_400Regular",
    bold: "Merriweather_700Bold",
  },
  Poppins: { regular: "Poppins_400Regular", bold: "Poppins_700Bold" },
};

// ── Native font loading (for RN UI font picker previews) ─────────────────

let _nativeFontsLoaded = false;

/**
 * Load all bundled fonts into the native RN text system (via expo-font).
 * Call this once at app startup (e.g. in _layout.tsx).
 * Returns a boolean: true once fonts are ready.
 */
export async function loadNativeFonts(): Promise<boolean> {
  if (_nativeFontsLoaded) return true;
  try {
    await Font.loadAsync(FONT_ASSETS);
    _nativeFontsLoaded = true;
    return true;
  } catch (e) {
    console.warn("[editorFontService] Failed to load native fonts:", e);
    return false;
  }
}

/** Synchronous check — already loaded? */
export function areFontsLoaded(): boolean {
  return _nativeFontsLoaded;
}

// ── WebView font CSS generation ───────────────────────────────────────────

let _fontFaceCSSCache: string | null = null;

/**
 * Safely download a single asset, returning null on failure.
 * Prevents one broken font from crashing the entire batch.
 */
async function safeDownloadAsset(
  mod: number,
): Promise<{ mod: number; asset: Asset } | null> {
  try {
    const a = Asset.fromModule(mod);
    await a.downloadAsync();
    return { mod, asset: a };
  } catch (err) {
    console.warn(
      `[editorFontService] Failed to download font asset (module ${mod}):`,
      err,
    );
    return null;
  }
}

/**
 * Build @font-face CSS rules using file:// URIs pointing to locally
 * downloaded asset files. This is nearly instant — no base64 conversion.
 * Fonts that fail to download are silently skipped (system fallback used).
 */
export async function buildWebViewFontCSS(): Promise<string> {
  if (_fontFaceCSSCache) return _fontFaceCSSCache;

  // Download all assets in parallel — each wrapped in try/catch
  const moduleIds = Object.values(FONT_ASSETS);
  const results = await Promise.all(
    moduleIds.map((mod) => safeDownloadAsset(mod as unknown as number)),
  );

  // Build a localUri lookup: asset module id → file:// URI
  const uriMap = new Map<number, string>();
  for (const result of results) {
    if (result && result.asset.localUri) {
      uriMap.set(result.mod, result.asset.localUri);
    }
  }

  const rules: string[] = [];

  for (const [family, { regular, bold }] of Object.entries(FONT_FAMILY_MAP)) {
    const regUri = uriMap.get(FONT_ASSETS[regular] as unknown as number);
    if (regUri) {
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:400;` +
          `src:url('${regUri}') format('truetype');}`,
      );
    }

    const boldUri = uriMap.get(FONT_ASSETS[bold] as unknown as number);
    if (boldUri) {
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:700;` +
          `src:url('${boldUri}') format('truetype');}`,
      );
    }
  }

  _fontFaceCSSCache = rules.join("\n");
  return _fontFaceCSSCache;
}

/**
 * Returns a JavaScript snippet that, when injected into the WebView,
 * adds a <style> element with all @font-face rules.
 */
export async function getWebViewFontInjectionScript(): Promise<string> {
  const css = await buildWebViewFontCSS();
  // Escape backticks and backslashes for safe JS template literal
  const escaped = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return `(function(){
    if(document.getElementById('__bundled_fonts__')) return;
    var s=document.createElement('style');
    s.id='__bundled_fonts__';
    s.textContent=\`${escaped}\`;
    document.head.appendChild(s);
  })(); true;`;
}
