// ============================================
// FILE: constants/tools.ts
// ============================================
export const toolCategories = [
  {
    id: "organize",
    name: "Organize",
    color: "#2563EB",
    tools: [
      {
        id: "merge",
        name: "Merge PDF",
        description: "Combine multiple PDFs into one",
      },
      {
        id: "split",
        name: "Split PDF",
        description: "Divide PDF into multiple files",
      },
      {
        id: "remove",
        name: "Remove Pages",
        description: "Delete specific pages",
      },
      {
        id: "extract",
        name: "Extract Pages",
        description: "Extract pages to new PDF",
      },
      { id: "organize", name: "Organize PDF", description: "Reorder pages" },
      {
        id: "reverse",
        name: "Reverse Pages",
        description: "Reverse page order",
      },
      {
        id: "duplicate",
        name: "Duplicate Pages",
        description: "Duplicate specific pages",
      },
    ],
  },
  {
    id: "optimize",
    name: "Optimize",
    color: "#10B981",
    tools: [
      { id: "compress", name: "Compress PDF", description: "Reduce file size" },
      { id: "repair", name: "Repair PDF", description: "Fix corrupted PDFs" },
      {
        id: "optimize-images",
        name: "Optimize Images",
        description: "Compress images in PDF",
      },
      {
        id: "remove-duplicates",
        name: "Remove Duplicates",
        description: "Remove duplicate pages",
      },
      {
        id: "batch-compress",
        name: "Batch Compress",
        description: "Compress multiple PDFs at once",
      },
    ],
  },
  {
    id: "convert-to",
    name: "Convert to PDF",
    color: "#9333EA",
    tools: [
      {
        id: "jpg-to-pdf",
        name: "JPG to PDF",
        description: "Convert images to PDF",
      },
      {
        id: "png-to-pdf",
        name: "PNG to PDF",
        description: "Convert PNG images",
      },
      {
        id: "word-to-pdf",
        name: "WORD to PDF",
        description: "Convert Word documents",
      },
      {
        id: "ppt-to-pdf",
        name: "POWERPOINT to PDF",
        description: "Convert presentations",
      },
      {
        id: "excel-to-pdf",
        name: "EXCEL to PDF",
        description: "Convert spreadsheets",
      },
      {
        id: "html-to-pdf",
        name: "HTML to PDF",
        description: "Convert web pages",
      },
      {
        id: "text-to-pdf",
        name: "Text to PDF",
        description: "Convert text files",
      },
    ],
  },
  {
    id: "convert-from",
    name: "Convert from PDF",
    color: "#EA580C",
    tools: [
      {
        id: "pdf-to-jpg",
        name: "PDF to JPG",
        description: "Convert PDF to images",
      },
      {
        id: "pdf-to-png",
        name: "PDF to PNG",
        description: "Convert to PNG images",
      },
      {
        id: "pdf-to-word",
        name: "PDF to WORD",
        description: "Convert to Word",
      },
      { id: "pdf-to-text", name: "PDF to Text", description: "Extract text" },
      {
        id: "pdf-to-html",
        name: "PDF to HTML",
        description: "Convert to HTML",
      },
      {
        id: "pdf-to-ppt",
        name: "PDF to PPT",
        description: "Convert to PowerPoint",
      },
      {
        id: "pdf-to-excel",
        name: "PDF to Excel",
        description: "Convert to spreadsheet",
      },
    ],
  },
  {
    id: "security",
    name: "Security",
    color: "#7C3AED",
    tools: [
      {
        id: "protect",
        name: "Protect PDF",
        description: "Add password protection",
      },
      { id: "unlock", name: "Unlock PDF", description: "Remove password" },
      {
        id: "redact",
        name: "Redact PDF",
        description: "Remove sensitive info",
      },
      { id: "encrypt", name: "Encrypt PDF", description: "AES-256 encryption" },
      {
        id: "decrypt",
        name: "Decrypt PDF",
        description: "Decrypt .pdflab file",
      },
      {
        id: "sign",
        name: "Sign Document",
        description: "Sign PDF with handwritten signature",
      },
    ],
  },
  {
    id: "edit",
    name: "Edit & Annotate",
    color: "#DC2626",
    tools: [
      {
        id: "annotate",
        name: "Annotate PDF",
        description: "Add notes to PDF",
      },
      {
        id: "add-text",
        name: "Add Text",
        description: "Insert text annotations",
      },
      {
        id: "add-stamps",
        name: "Add Stamps",
        description: "APPROVED, DRAFT, etc.",
      },
      { id: "rotate", name: "Rotate PDF", description: "Rotate pages" },
      {
        id: "page-numbers",
        name: "Page Numbers",
        description: "Number your pages",
      },
      {
        id: "watermark",
        name: "Add Watermark",
        description: "Add watermark or logo",
      },
      {
        id: "header-footer",
        name: "Header & Footer",
        description: "Add headers & footers",
      },
      { id: "crop", name: "Crop PDF", description: "Crop pages" },
      { id: "resize", name: "Resize Pages", description: "Change page size" },
      {
        id: "find-replace",
        name: "Find & Replace",
        description: "Find and replace text in PDF",
      },
      {
        id: "qr-code",
        name: "QR Code",
        description: "Add QR codes to PDF pages",
      },
    ],
  },
  {
    id: "metadata",
    name: "Info & Metadata",
    color: "#0891B2",
    tools: [
      { id: "info", name: "PDF Info", description: "View document info" },
      { id: "metadata", name: "Edit Metadata", description: "Edit properties" },
      { id: "search", name: "Search Text", description: "Find text in PDF" },
      {
        id: "validate",
        name: "Validate PDF",
        description: "Check PDF/A compliance",
      },
    ],
  },
  {
    id: "forms",
    name: "Forms & Fill",
    color: "#F59E0B",
    tools: [
      { id: "fill-form", name: "Fill Form", description: "Fill PDF forms" },
      {
        id: "flatten",
        name: "Flatten PDF",
        description: "Flatten form fields",
      },
      {
        id: "extract-data",
        name: "Extract Form Data",
        description: "Export form data",
      },
    ],
  },
  {
    id: "compare",
    name: "Compare & Review",
    color: "#EC4899",
    tools: [
      {
        id: "compare",
        name: "Compare PDFs",
        description: "Compare two documents",
      },
      {
        id: "diff",
        name: "Show Differences",
        description: "Highlight changes",
      },
      {
        id: "merge-review",
        name: "Merge Reviews",
        description: "Combine annotations",
      },
      {
        id: "highlight-export",
        name: "Export Highlights",
        description: "Export annotations & highlights",
      },
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    color: "#6366F1",
    tools: [
      { id: "ocr", name: "OCR", description: "Extract text from scans" },
      {
        id: "black-white",
        name: "Black & White",
        description: "Convert to grayscale",
      },
      {
        id: "fix-orientation",
        name: "Auto-Rotate",
        description: "Fix orientation",
      },
      {
        id: "remove-blank",
        name: "Remove Blank Pages",
        description: "Delete empty pages",
      },
      {
        id: "bookmarks",
        name: "Add Bookmarks",
        description: "Create table of contents",
      },
      { id: "hyperlinks", name: "Add Hyperlinks", description: "Insert links" },
      {
        id: "attachments",
        name: "Attachments",
        description: "Add/extract files",
      },
      {
        id: "extract-images",
        name: "Extract Images",
        description: "Extract all images from PDF",
      },
      {
        id: "citation-extractor",
        name: "Citation Extractor",
        description: "Extract & format references",
      },
    ],
  },
];
