import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { extractFile } from "../lib/file-extraction";
test("Excel worksheets and CSV become attributed searchable text", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Partner", "Payout"],
      ["14534", 125],
    ]),
    "Partners",
  );
  for (const type of ["xlsx", "xls", "ods"] as const) {
    const result = await extractFile(
      XLSX.write(book, { type: "buffer", bookType: type }),
      `report.${type}`,
    );
    assert.equal(result.indexed, true);
    assert.match(result.text, /Partners/);
    assert.match(result.text, /14534,125/);
  }
  const csv = await extractFile(
    Buffer.from('name,note\nAhmad,"approved, pending date"'),
    "notes.csv",
  );
  assert.match(csv.text, /approved, pending date/);
});
test("arbitrary binary files are stored without pretending their contents were understood", async () => {
  const file = await extractFile(Buffer.from([0, 1, 255, 2]), "recording.bin");
  assert.equal(file.indexed, false);
  assert.match(file.text, /not been extracted/);
});
