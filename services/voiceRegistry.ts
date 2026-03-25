/**
 * voiceRegistry.ts
 *
 * The single source of truth for every voice the app exposes to users.
 * No voice outside this list will ever appear in the picker.
 *
 * How matching works at runtime:
 *  1. We call Speech.getAvailableVoicesAsync() to get what's installed on the device.
 *  2. For each BundledVoice we try to find a system voice using:
 *       a) An exact iOS / Android voice ID (most reliable)
 *       b) A name + language fallback (catches renamed/updated system voices)
 *  3. If a match is found → voice is AVAILABLE and we store the live system ID.
 *  4. If no match     → voice is UNAVAILABLE and we grey it out in the picker.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Gender = "Female" | "Male";
export type Accent =
  | "American"
  | "British"
  | "Australian"
  | "Indian"
  | "Irish"
  | "Nigerian"
  | "South African";

export interface BundledVoice {
  /** Stable internal ID used throughout the app. Never changes. */
  id: string;
  /** Friendly display name shown in the picker. */
  displayName: string;
  /** Short descriptor shown under the name, e.g. "Young · Casual" */
  description: string;
  accent: Accent;
  flag: string;
  gender: Gender;
  /**
   * Known iOS system voice IDs for this voice (checked in order).
   * Compact = built-in; premium = enhanced (may not be installed).
   */
  iosIds: string[];
  /**
   * Known Android / Google TTS voice IDs (checked in order).
   * These can vary between Android versions and OEM skins.
   */
  androidIds: string[];
  /**
   * BCP-47 language tag used as a last-resort fallback match
   * when none of the explicit IDs match.
   */
  language: string;
  /** Partial name string to match against system voice names as fallback. */
  nameHint: string;
}

export interface ResolvedVoice extends BundledVoice {
  /** True if a matching system voice was found on this device. */
  available: boolean;
  /** The actual system voice ID to pass to Speech.speak(). */
  systemId: string | null;
}

// ---------------------------------------------------------------------------
// The master voice list
// ---------------------------------------------------------------------------

export const BUNDLED_VOICES: BundledVoice[] = [
  // ── AMERICAN ──────────────────────────────────────────────────────────────

  {
    id: "en-us-female-1",
    displayName: "Samantha",
    description: "American · Female · Natural",
    accent: "American",
    flag: "🇺🇸",
    gender: "Female",
    language: "en-US",
    nameHint: "samantha",
    iosIds: [
      "com.apple.ttsbundle.Samantha-compact",
      "com.apple.voice.compact.en-US.Samantha",
    ],
    androidIds: ["en-us-x-sfg-local", "en-us-x-sfg#female_1-local"],
  },

  {
    id: "en-us-female-teen",
    displayName: "Nicky",
    description: "American · Female · Teen",
    accent: "American",
    flag: "🇺🇸",
    gender: "Female",
    language: "en-US",
    nameHint: "nicky",
    iosIds: [
      "com.apple.ttsbundle.Nicky-compact",
      "com.apple.voice.compact.en-US.Nicky",
    ],
    androidIds: ["en-us-x-iol-local", "en-us-x-sfg#female_2-local"],
  },

  {
    id: "en-us-male-1",
    displayName: "Alex",
    description: "American · Male · Clear",
    accent: "American",
    flag: "🇺🇸",
    gender: "Male",
    language: "en-US",
    nameHint: "alex",
    iosIds: [
      "com.apple.ttsbundle.Alex-compact",
      "com.apple.voice.compact.en-US.Alex",
    ],
    androidIds: ["en-us-x-tpd-local", "en-us-x-tpf-local"],
  },

  // ── BRITISH ───────────────────────────────────────────────────────────────

  {
    id: "en-gb-female-1",
    displayName: "Kate",
    description: "British · Female · Refined",
    accent: "British",
    flag: "🇬🇧",
    gender: "Female",
    language: "en-GB",
    nameHint: "kate",
    iosIds: [
      "com.apple.ttsbundle.Kate-compact",
      "com.apple.voice.compact.en-GB.Kate",
    ],
    androidIds: ["en-gb-x-gba-local", "en-gb-x-gbb-local"],
  },

  {
    id: "en-gb-male-1",
    displayName: "Daniel",
    description: "British · Male · Warm",
    accent: "British",
    flag: "🇬🇧",
    gender: "Male",
    language: "en-GB",
    nameHint: "daniel",
    iosIds: [
      "com.apple.ttsbundle.Daniel-compact",
      "com.apple.voice.compact.en-GB.Daniel",
    ],
    androidIds: ["en-gb-x-rjs-local", "en-gb-x-gbd-local"],
  },

  // ── AUSTRALIAN ────────────────────────────────────────────────────────────

  {
    id: "en-au-female-1",
    displayName: "Karen",
    description: "Australian · Female · Friendly",
    accent: "Australian",
    flag: "🇦🇺",
    gender: "Female",
    language: "en-AU",
    nameHint: "karen",
    iosIds: [
      "com.apple.ttsbundle.Karen-compact",
      "com.apple.voice.compact.en-AU.Karen",
    ],
    androidIds: ["en-au-x-aub-local", "en-au-x-aud-local"],
  },

  {
    id: "en-au-male-1",
    displayName: "Lee",
    description: "Australian · Male · Relaxed",
    accent: "Australian",
    flag: "🇦🇺",
    gender: "Male",
    language: "en-AU",
    nameHint: "lee",
    iosIds: [
      "com.apple.ttsbundle.Lee-compact",
      "com.apple.voice.compact.en-AU.Lee",
    ],
    androidIds: ["en-au-x-auc-local", "en-au-x-aud-local"],
  },

  // ── INDIAN ────────────────────────────────────────────────────────────────

  {
    id: "en-in-female-1",
    displayName: "Veena",
    description: "Indian · Female · Expressive",
    accent: "Indian",
    flag: "🇮🇳",
    gender: "Female",
    language: "en-IN",
    nameHint: "veena",
    iosIds: [
      "com.apple.ttsbundle.Veena-compact",
      "com.apple.voice.compact.en-IN.Veena",
    ],
    androidIds: ["en-in-x-cxx-local", "en-in-x-end-local"],
  },

  {
    id: "en-in-male-1",
    displayName: "Rishi",
    description: "Indian · Male · Articulate",
    accent: "Indian",
    flag: "🇮🇳",
    gender: "Male",
    language: "en-IN",
    nameHint: "rishi",
    iosIds: [
      "com.apple.ttsbundle.Rishi-compact",
      "com.apple.voice.compact.en-IN.Rishi",
    ],
    androidIds: ["en-in-x-cxd-local", "en-in-x-end-local"],
  },

  // ── IRISH ─────────────────────────────────────────────────────────────────

  {
    id: "en-ie-female-1",
    displayName: "Moira",
    description: "Irish · Female · Melodic",
    accent: "Irish",
    flag: "🇮🇪",
    gender: "Female",
    language: "en-IE",
    nameHint: "moira",
    iosIds: [
      "com.apple.ttsbundle.Moira-compact",
      "com.apple.voice.compact.en-IE.Moira",
    ],
    androidIds: ["en-ie-x-xxx-local"],
  },

  {
    id: "en-ie-male-1",
    displayName: "Aaron",
    description: "Irish · Male · Smooth",
    accent: "Irish",
    flag: "🇮🇪",
    gender: "Male",
    language: "en-IE",
    nameHint: "aaron",
    iosIds: [
      "com.apple.voice.compact.en-IE.Aaron",
      "com.apple.ttsbundle.Aaron-compact",
    ],
    androidIds: ["en-ie-x-xxx-local"],
  },

  // ── NIGERIAN ──────────────────────────────────────────────────────────────

  {
    id: "en-ng-female-1",
    displayName: "Amaka",
    description: "Nigerian · Female · Vibrant",
    accent: "Nigerian",
    flag: "🇳🇬",
    gender: "Female",
    language: "en-NG",
    nameHint: "amaka",
    iosIds: [
      "com.apple.voice.compact.en-NG.Amaka",
      "com.apple.ttsbundle.Amaka-compact",
    ],
    androidIds: ["en-ng-x-xxx-local"],
  },

  {
    id: "en-ng-male-1",
    displayName: "Tunde",
    description: "Nigerian · Male · Bold",
    accent: "Nigerian",
    flag: "🇳🇬",
    gender: "Male",
    language: "en-NG",
    nameHint: "tunde",
    iosIds: [
      "com.apple.voice.compact.en-NG.Tunde",
      "com.apple.ttsbundle.Tunde-compact",
    ],
    androidIds: ["en-ng-x-xxa-local"],
  },

  // ── SOUTH AFRICAN ─────────────────────────────────────────────────────────

  {
    id: "en-za-female-1",
    displayName: "Tessa",
    description: "South African · Female · Warm",
    accent: "South African",
    flag: "🇿🇦",
    gender: "Female",
    language: "en-ZA",
    nameHint: "tessa",
    iosIds: [
      "com.apple.ttsbundle.Tessa-compact",
      "com.apple.voice.compact.en-ZA.Tessa",
    ],
    androidIds: ["en-za-x-xab-local"],
  },

  {
    id: "en-za-male-1",
    displayName: "Kobus",
    description: "South African · Male · Distinctive",
    accent: "South African",
    flag: "🇿🇦",
    gender: "Male",
    language: "en-ZA",
    nameHint: "kobus",
    iosIds: [
      "com.apple.voice.compact.en-ZA.Kobus",
      "com.apple.ttsbundle.Kobus-compact",
    ],
    androidIds: ["en-za-x-xac-local"],
  },
];

// ---------------------------------------------------------------------------
// Accent filter config (drives the picker chips)
// ---------------------------------------------------------------------------

export const ACCENT_FILTERS: Accent[] = [
  "American",
  "British",
  "Australian",
  "Indian",
  "Irish",
  "Nigerian",
  "South African",
];
