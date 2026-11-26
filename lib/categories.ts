import type { Category } from "./models";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "income-salary", name: "Gaji", type: "income" },
  { id: "income-freelance", name: "Freelance", type: "income" },
  { id: "income-bonus", name: "Bonus", type: "income" },
  { id: "income-refund", name: "Refund", type: "income" },
  { id: "income-gift", name: "Hadiah", type: "income" },
  { id: "income-other", name: "Lainnya", type: "income" },
  { id: "expense-food", name: "Makan & Minum", type: "expense" },
  { id: "expense-transport", name: "Transportasi", type: "expense" },
  { id: "expense-daily", name: "Belanja Harian", type: "expense" },
  { id: "expense-rent", name: "Sewa & Tempat Tinggal", type: "expense" },
  { id: "expense-bills", name: "Tagihan", type: "expense" },
  { id: "expense-communication", name: "Komunikasi", type: "expense" },
  { id: "expense-health", name: "Kesehatan", type: "expense" },
  { id: "expense-family", name: "Keluarga", type: "expense" },
  { id: "expense-education", name: "Pendidikan", type: "expense" },
  { id: "expense-insurance", name: "Asuransi & Pajak", type: "expense" },
  { id: "expense-entertainment", name: "Hiburan", type: "expense" },
  { id: "expense-other", name: "Lainnya", type: "expense" },
];
