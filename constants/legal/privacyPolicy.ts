/**
 * Privacy Policy content for PDFlab
 * Structured data extracted from the original legal document.
 */

export interface LegalSubsection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
}

export const PRIVACY_POLICY_LAST_UPDATED = "February 2026";

export const PRIVACY_POLICY_TITLE = "Privacy Policy";

export const PRIVACY_POLICY_SUBTITLE =
  "Freemium · Auth · Payments · Google Drive Backup · AI Processing";

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Introduction",
    paragraphs: [
      'Welcome to PDFlab ("we," "our," or "us").',
      "PDFlab is a document management and productivity application that allows users to:",
    ],
    bullets: [
      "View, create, edit, and convert documents",
      "Use AI-powered document assistance",
      "Download legally available open-source materials",
      "Store files locally",
      "Back up files to Google Drive",
      "Access premium features via subscription",
    ],
    subsections: [
      {
        paragraphs: [
          "We are committed to protecting your privacy and complying with applicable data protection laws including:",
        ],
        heading: "",
        bullets: [
          "GDPR (European Union)",
          "CCPA/CPRA (California)",
          "NDPR (Nigeria)",
          "Other applicable international regulations",
        ],
      },
      {
        heading: "",
        paragraphs: ["By using the app, you agree to this Privacy Policy."],
      },
    ],
  },
  {
    heading: "2. Information We Collect",
    subsections: [
      {
        heading: "2.1 Information Collected Without Account (Free Tier)",
        paragraphs: [
          "If you use the app without creating an account, we may collect:",
        ],
        bullets: [
          "Device type and OS version",
          "App usage data",
          "Crash reports",
          "IP address (for security purposes)",
        ],
      },
      {
        heading: "",
        paragraphs: [
          "Documents you create or upload may be processed locally or temporarily on our servers depending on the feature used.",
        ],
      },
      {
        heading: "2.2 Information Collected With Account Registration",
        paragraphs: [
          "When authentication is implemented and you create an account, we may collect:",
        ],
        bullets: [
          "Name",
          "Email address",
          "Encrypted authentication credentials",
          "Subscription status",
          "Account preferences",
        ],
      },
      {
        heading: "2.3 Payment Information",
        paragraphs: ["If you purchase premium features:"],
        bullets: [
          "Payments are processed through third-party payment processors (e.g., Google Play Billing, Apple In-App Purchases, or other processors).",
          "We do not store your full payment card details.",
          "We may store transaction IDs and subscription status for account management.",
        ],
      },
      {
        heading: "2.4 Document and File Data",
        paragraphs: ["You may upload, create, edit, or process:"],
        bullets: [
          "PDF files",
          "DOCX files",
          "EPUB files",
          "Text input",
          "Voice transcription data",
        ],
      },
      {
        heading: "",
        paragraphs: [
          "We do not claim ownership of your documents.",
          "Files may be:",
        ],
        bullets: [
          "Stored locally on your device",
          "Processed on secure backend servers",
          "Backed up to Google Drive upon your request",
        ],
      },
      {
        heading: "2.5 Google Drive Backup",
        paragraphs: ["If you choose to connect Google Drive:"],
        bullets: [
          "We request permission to access your Google Drive only for backup and restore functionality.",
          "We do not access unrelated files.",
          "Access tokens are stored securely.",
          "You may revoke access at any time through your Google account settings.",
          "We comply with Google API Services User Data Policy.",
        ],
      },
      {
        heading: "2.6 AI Processing",
        paragraphs: ["When you use AI features:"],
        bullets: [
          "Submitted content may be securely transmitted to third-party AI providers.",
          "Data is used solely to generate responses.",
          "We do not intentionally use your data to train AI models unless explicitly stated.",
          "AI outputs may be stored temporarily to improve session continuity.",
        ],
      },
    ],
  },
  {
    heading: "3. How We Use Information",
    paragraphs: ["We use your information to:"],
    bullets: [
      "Provide document tools and AI features",
      "Process subscriptions and manage accounts",
      "Enable file backups and restores",
      "Improve app performance",
      "Prevent fraud and abuse",
      "Comply with legal obligations",
    ],
    subsections: [
      {
        heading: "",
        paragraphs: ["We do not sell personal data."],
      },
    ],
  },
  {
    heading: "4. Legal Basis for Processing (GDPR Users)",
    paragraphs: ["We process data under:"],
    bullets: [
      "Consent",
      "Contract performance",
      "Legal obligations",
      "Legitimate interests (security, service improvement)",
    ],
  },
  {
    heading: "5. Data Retention",
    paragraphs: ["We retain data:"],
    bullets: [
      "While your account is active",
      "As required for subscription management",
      "As required by law",
    ],
    subsections: [
      {
        heading: "",
        paragraphs: ["You may request account deletion at any time."],
      },
    ],
  },
  {
    heading: "6. Data Security",
    paragraphs: ["We implement:"],
    bullets: [
      "HTTPS encryption",
      "Secure backend architecture",
      "Access controls",
      "Token-based authentication",
      "Industry-standard safeguards",
    ],
    subsections: [
      {
        heading: "",
        paragraphs: ["However, no system is completely secure."],
      },
    ],
  },
  {
    heading: "7. Your Rights",
    paragraphs: ["Depending on jurisdiction, you may:"],
    bullets: [
      "Access your personal data",
      "Correct inaccurate data",
      "Request deletion",
      "Restrict processing",
      "Withdraw consent",
      "Request data portability",
      "Object to certain processing",
    ],
    subsections: [
      {
        heading: "",
        paragraphs: [
          "To exercise your rights, contact us at support@pdflab.app.",
        ],
      },
    ],
  },
  {
    heading: "8. Children's Privacy",
    paragraphs: [
      "This app is not intended for children under 13 (or local minimum age).",
      "We do not knowingly collect children's data.",
    ],
  },
  {
    heading: "9. International Transfers",
    paragraphs: [
      "Your data may be processed in countries outside your residence. We ensure appropriate safeguards are in place.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    paragraphs: [
      "We may update this policy periodically.",
      "Continued use of the app after updates constitutes acceptance.",
    ],
  },
  {
    heading: "11. Contact",
    paragraphs: ["PDFlab\nEmail: support@pdflab.app"],
  },
];
