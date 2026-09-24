import { ApiError } from "./api";
export async function extractFile(buffer: Buffer, filename: string, mime = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let indexed = true;
  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (
    ["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext)
  ) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    text = workbook.SheetNames.map(
      (name) =>
        `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`,
    ).join("\n\n");
  } else if (
    mime.startsWith("text/") ||
    [
      "txt",
      "md",
      "json",
      "xml",
      "yaml",
      "yml",
      "html",
      "css",
      "js",
      "ts",
      "tsx",
      "jsx",
      "py",
      "sql",
      "log",
      "ini",
      "toml",
      "sh",
      "rtf",
    ].includes(ext)
  ) {
    text = buffer.toString("utf8");
    if (text.includes("\u0000")) indexed = false;
  } else indexed = false;
  if (!text.trim()) indexed = false;
  if (text.length > 120000)
    throw new ApiError(
      "Split this document into files under 120,000 extracted characters.",
    );
  return {
    text: indexed
      ? text
      : `Stored file: ${filename}. File type: ${ext || mime || "unknown"}. Contents have not been extracted; do not infer what is inside this file.`,
    indexed,
  };
}
