export type CsvTransaction = {
  date: string;
  wallet: string;
  currency: string;
  type: string;
  category: string;
  amount: number;
  note?: string;
};

function csvCell(value: string | number | undefined): string {
  let text = String(value ?? "");
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createTransactionsCsv(transactions: CsvTransaction[]): string {
  const rows = [
    ["Tanggal", "Dompet", "Mata uang", "Jenis", "Kategori", "Nominal", "Catatan"],
    ...transactions.map((transaction) => [
      transaction.date,
      transaction.wallet,
      transaction.currency,
      transaction.type,
      transaction.category,
      transaction.amount,
      transaction.note,
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
