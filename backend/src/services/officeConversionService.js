const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs").promises;
const path = require("path");

const execFilePromise = util.promisify(execFile);

class OfficeConversionService {
  constructor() {
    // Check if LibreOffice is installed
    this.libreOfficePath = this.detectLibreOffice();
  }

  detectLibreOffice() {
    // Common LibreOffice paths
    const paths = [
      "libreoffice", // Linux/Mac with PATH
      "/usr/bin/libreoffice", // Linux
      "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe", // Windows
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe", // Windows 32-bit
    ];

    // Return first available path (in production, check which exists)
    return paths[0];
  }

  async wordToPDF(wordFile) {
    try {
      const inputPath = wordFile.tempFilePath;
      const outputDir = path.dirname(inputPath);
      const outputName = path.basename(inputPath, path.extname(inputPath));
      const outputPath = path.join(outputDir, `${outputName}.pdf`);

      // Use execFile (array args) to prevent command injection
      await execFilePromise(
        this.libreOfficePath,
        ["--headless", "--convert-to", "pdf", "--outdir", outputDir, inputPath],
        { timeout: 30000 },
      );

      // Read the converted PDF
      const pdfBuffer = await fs.readFile(outputPath);

      // Clean up
      await fs.unlink(outputPath).catch(() => {});

      return pdfBuffer;
    } catch (error) {
      console.error("Word to PDF conversion error:", error);
      throw new Error(
        "Failed to convert Word to PDF. Ensure LibreOffice is installed.",
      );
    }
  }

  async excelToPDF(excelFile) {
    return this.wordToPDF(excelFile); // Same process
  }

  async pptToPDF(pptFile) {
    return this.wordToPDF(pptFile); // Same process
  }

  // For PDF to Office conversions, use pdf2docx library
  async pdfToWord(pdfFile) {
    try {
      const inputPath = pdfFile.tempFilePath;
      const outputPath = inputPath.replace(".pdf", ".docx");

      // Use execFile with args array to prevent command injection
      await execFilePromise(
        "python3",
        [
          "-c",
          `from pdf2docx import Converter; cv = Converter(r"${inputPath.replace(/\\/g, "\\\\")}"); cv.convert(r"${outputPath.replace(/\\/g, "\\\\")}"); cv.close()`,
        ],
        { timeout: 60000 },
      );

      const docxBuffer = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      return docxBuffer;
    } catch (error) {
      console.error("PDF to Word error:", error);
      throw new Error(
        "Failed to convert PDF to Word. Install: pip install pdf2docx",
      );
    }
  }

  async pdfToExcel(pdfFile) {
    try {
      const inputPath = pdfFile.tempFilePath;
      const outputPath = inputPath.replace(".pdf", ".xlsx");

      // Use execFile with args array to prevent command injection
      const script =
        `import tabula; df = tabula.read_pdf(r"${inputPath.replace(/\\/g, "\\\\")}", pages='all'); import pandas as pd; ` +
        `writer = pd.ExcelWriter(r"${outputPath.replace(/\\/g, "\\\\")}"); [df[i].to_excel(writer, sheet_name=f'Sheet{i+1}') for i in range(len(df))]; writer.close()`;
      await execFilePromise("python3", ["-c", script], { timeout: 60000 });

      const xlsxBuffer = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      return xlsxBuffer;
    } catch (error) {
      console.error("PDF to Excel error:", error);
      throw new Error(
        "Failed to convert PDF to Excel. Install: pip install tabula-py pandas openpyxl",
      );
    }
  }

  async pdfToPPT(pdfFile) {
    try {
      const inputPath = pdfFile.tempFilePath;
      const outputPath = inputPath.replace(".pdf", ".pptx");

      // Use execFile with args array to prevent command injection
      const script = [
        "from pdf2image import convert_from_path",
        "from pptx import Presentation",
        "from pptx.util import Inches",
        "import os, tempfile",
        `images = convert_from_path(r"${inputPath.replace(/\\/g, "\\\\")}", dpi=150)`,
        "prs = Presentation()",
        "prs.slide_width = Inches(10)",
        "prs.slide_height = Inches(7.5)",
        "for i, image in enumerate(images):",
        "    slide = prs.slides.add_slide(prs.slide_layouts[6])",
        "    temp_img = tempfile.mktemp(suffix='.png')",
        "    image.save(temp_img, 'PNG')",
        "    slide.shapes.add_picture(temp_img, Inches(0), Inches(0), width=Inches(10), height=Inches(7.5))",
        "    os.remove(temp_img)",
        `prs.save(r"${outputPath.replace(/\\/g, "\\\\")}")`,
      ].join("\n");

      await execFilePromise("python3", ["-c", script], { timeout: 120000 });

      const pptxBuffer = await fs.readFile(outputPath);
      await fs.unlink(outputPath).catch(() => {});

      return pptxBuffer;
    } catch (error) {
      console.error("PDF to PPT error:", error);
      throw new Error(
        "Failed to convert PDF to PowerPoint. Install: pip install pdf2image python-pptx",
      );
    }
  }

  // Check if LibreOffice is available
  async isLibreOfficeAvailable() {
    try {
      await execFilePromise(this.libreOfficePath, ["--version"]);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new OfficeConversionService();
