/**
 * Bundle epub.js and jszip minified scripts as base64 constants
 * for offline WebView rendering.
 *
 * Run: node scripts/bundle-epub-scripts.js
 */
const fs = require("fs");
const path = require("path");

const jszipPath = path.resolve(
  __dirname,
  "../node_modules/jszip/dist/jszip.min.js",
);
const epubjsPath = path.resolve(
  __dirname,
  "../node_modules/epubjs/dist/epub.min.js",
);
const outPath = path.resolve(__dirname, "../services/epubBundledScripts.ts");

const jszipSrc = fs.readFileSync(jszipPath, "utf8");
const epubjsSrc = fs.readFileSync(epubjsPath, "utf8");

const jszipB64 = Buffer.from(jszipSrc).toString("base64");
const epubjsB64 = Buffer.from(epubjsSrc).toString("base64");

const output = `/**
 * Auto-generated: Bundled scripts for offline EPUB WebView rendering.
 * Do NOT edit manually. Regenerate with: node scripts/bundle-epub-scripts.js
 *
 * Contains base64-encoded minified builds of:
 *   - jszip ${require("../node_modules/jszip/package.json").version}
 *   - epubjs ${require("../node_modules/epubjs/package.json").version}
 */

/** jszip minified – base64 encoded */
export const JSZIP_MIN_JS_B64 = "${jszipB64}";

/** epubjs minified – base64 encoded */
export const EPUBJS_MIN_JS_B64 = "${epubjsB64}";
`;

fs.writeFileSync(outPath, output, "utf8");
console.log(
  `✓ Wrote ${outPath} (jszip: ${(jszipB64.length / 1024).toFixed(0)} KB b64, epubjs: ${(epubjsB64.length / 1024).toFixed(0)} KB b64)`,
);
