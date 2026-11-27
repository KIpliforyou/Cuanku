import { describe, expect, it } from "vitest";
import { createTransactionsCsv } from "./csv";

describe("transaction CSV export", () => {
  it("escapes quotes and delimiters and includes a UTF-8 BOM", () => {
    const csv = createTransactionsCsv([{
      date: "2026-11-27",
      wallet: 'Dompet "Utama"',
      currency: "IDR",
      type: "expense",
      category: "Makan, Minum",
      amount: 12500,
      note: "Catatan\nbaris dua",
    }]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Dompet ""Utama"""');
    expect(csv).toContain('"Makan, Minum"');
    expect(csv).toContain('"Catatan\nbaris dua"');
  });

  it("neutralizes spreadsheet formulas in text fields", () => {
    const csv = createTransactionsCsv([{
      date: "2026-11-27",
      wallet: "=HYPERLINK(\"bad\")",
      currency: "IDR",
      type: "expense",
      category: "Tag",
      amount: 1,
      note: "@SUM(A1:A2)",
    }]);

    expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(csv).toContain(`"'@SUM(A1:A2)"`);
  });
});
