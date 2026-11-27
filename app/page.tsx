"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Bus,
  ChartPie,
  Download,
  Gift,
  Heart,
  Home as HomeIcon,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Phone,
  Receipt,
  RefreshCw,
  ReceiptText,
  ShoppingBag,
  Shield,
  Sparkles,
  Settings,
  Sun,
  Tag,
  Trash2,
  Utensils,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  calculateBudgetSpent,
  calculateCurrencyBalances,
  calculateEstimatedTotalInIdr,
  calculateMonthlyTotals,
  formatMoney,
  type Currency,
  type TransactionType,
} from "../lib/domain";
import { CATEGORY_ICON_OPTIONS, DEFAULT_CATEGORIES } from "../lib/categories";
import { isBackupReminderDue } from "../lib/backup";
import type {
  BackupEnvelope,
  BackupReminderDays,
  BudgetRecord,
  Category,
  CategoryIconId,
  ExchangeRateCache,
  Preferences,
  TransactionRecord,
  WalletRecord,
} from "../lib/models";
import {
  deleteCategory,
  deleteTransaction,
  deleteBudget,
  deleteWallet,
  getCategories,
  getBackupReminderDays,
  getBudgets,
  getExchangeRate,
  getLastBackupAt,
  getTransactions,
  getWallets,
  putCategories,
  putBackupMetadata,
  putBudget,
  putExchangeRate,
  putTransaction,
  putWallet,
  replaceAllData,
} from "../lib/storage";
import { categorySchema, validateBackup } from "../lib/validation";
import { createTransactionsCsv } from "../lib/csv";
import { BACKUP_REMINDER_OPTIONS } from "../lib/models";

type View = "dashboard" | "transactions" | "wallets" | "budgets" | "reports" | "backup" | "settings";
type ReportTransaction = Pick<TransactionRecord, "date" | "type" | "amount" | "categoryId">;
type PersistentStorageStatus = "checking" | "granted" | "not-granted" | "unsupported" | "error";

const CATEGORY_ICONS: Record<CategoryIconId, LucideIcon> = {
  briefcase: Briefcase,
  sparkles: Sparkles,
  gift: Gift,
  rotate: RefreshCw,
  tag: Tag,
  utensils: Utensils,
  bus: Bus,
  shopping: ShoppingBag,
  home: HomeIcon,
  receipt: Receipt,
  phone: Phone,
  heart: Heart,
  users: Users,
  book: BookOpen,
  shield: Shield,
};

const makeId = () => crypto.randomUUID();
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (month: string, offset: number) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [rate, setRate] = useState<ExchangeRateCache | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupReminderDays, setBackupReminderDays] = useState<BackupReminderDays>(14);
  const [persistentStorageStatus, setPersistentStorageStatus] = useState<PersistentStorageStatus>("checking");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [theme, setTheme] = useState<Preferences["theme"]>("system");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [modal, setModal] = useState<"wallet" | "transaction" | "budget" | "category" | null>(null);
  const [toast, setToast] = useState("");
  const [editingWallet, setEditingWallet] = useState<WalletRecord | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);
  const [budgetViewMonth, setBudgetViewMonth] = useState(currentMonth);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"all" | TransactionType>("all");
  const [transactionCurrencyFilter, setTransactionCurrencyFilter] = useState<"all" | Currency>("all");
  const [transactionFromFilter, setTransactionFromFilter] = useState("");
  const [transactionToFilter, setTransactionToFilter] = useState("");
  const [transactionWalletFilter, setTransactionWalletFilter] = useState("all");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState("");
  const [categoryTypeInput, setCategoryTypeInput] = useState<TransactionType>("expense");
  const [categoryIconInput, setCategoryIconInput] = useState<CategoryIconId>("tag");

  const [walletName, setWalletName] = useState("");
  const [walletCurrency, setWalletCurrency] = useState<Currency>("IDR");
  const [openingBalance, setOpeningBalance] = useState("");

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [transactionWallet, setTransactionWallet] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionNote, setTransactionNote] = useState("");
  const [budgetWallet, setBudgetWallet] = useState("");
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [budgetAmount, setBudgetAmount] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [
          storedWallets,
          storedTransactions,
          storedCategories,
          storedRate,
          storedBudgets,
          storedLastBackupAt,
          storedBackupReminderDays,
        ] = await Promise.all([
          getWallets(),
          getTransactions(),
          getCategories(),
          getExchangeRate(),
          getBudgets(),
          getLastBackupAt(),
          getBackupReminderDays(),
        ]);
        if (storedCategories.length === 0) {
          await putCategories(DEFAULT_CATEGORIES);
        }
        setWallets(storedWallets);
        setTransactions(storedTransactions);
        setBudgets(storedBudgets);
        setLastBackupAt(storedLastBackupAt);
        setBackupReminderDays(storedBackupReminderDays);
        setCategories(
          storedCategories.length
            ? storedCategories.map((category) => ({
                ...category,
                icon: category.icon ?? DEFAULT_CATEGORIES.find((item) => item.id === category.id)?.icon,
              }))
            : DEFAULT_CATEGORIES,
        );
        setRate(storedRate ?? null);
        const savedTheme = localStorage.getItem("cuanku-theme");
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setTheme(savedTheme);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Data lokal tidak dapat dibuka.");
      } finally {
        setThemeLoaded(true);
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    let active = true;
    async function checkPersistentStorage() {
      if (!navigator.storage || typeof navigator.storage.persisted !== "function") {
        setPersistentStorageStatus("unsupported");
        return;
      }
      try {
        const persisted = await navigator.storage.persisted();
        if (active) setPersistentStorageStatus(persisted ? "granted" : "not-granted");
      } catch {
        if (active) setPersistentStorageStatus("error");
      }
    }
    void checkPersistentStorage();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeLoaded) localStorage.setItem("cuanku-theme", theme);
  }, [theme, themeLoaded]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!moreOpen) return;

    function dismissMenu(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setMoreOpen(false);
      } else if (event instanceof MouseEvent && event.target instanceof Node && !moreMenuRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    }

    document.addEventListener("pointerdown", dismissMenu);
    document.addEventListener("keydown", dismissMenu);
    return () => {
      document.removeEventListener("pointerdown", dismissMenu);
      document.removeEventListener("keydown", dismissMenu);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!modal) return;
    const dialog = modalRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [modal]);

  const domainWallets = wallets.map((wallet) => ({
    id: wallet.id,
    currency: wallet.currency,
    openingBalance: wallet.openingBalance,
  }));
  const domainTransactions = transactions.map((transaction) => ({
    walletId: transaction.walletId,
    type: transaction.type,
    amount: transaction.amount,
  }));
  const balances = calculateCurrencyBalances(domainWallets, domainTransactions);
  const budgetSpent = (budget: BudgetRecord) =>
    calculateBudgetSpent(budget, transactions);
  const dashboardMonth = currentMonth();
  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(dashboardMonth));
  const monthlyFlow = (currency: Currency) => {
    const relevantTransactions = monthTransactions.filter((transaction) =>
      wallets.some((wallet) => wallet.id === transaction.walletId && wallet.currency === currency),
    );
    return {
      income: relevantTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((total, transaction) => total + transaction.amount, 0),
      expense: relevantTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + transaction.amount, 0),
    };
  };
  const monthlyFlows: Record<Currency, ReturnType<typeof monthlyFlow>> = {
    JPY: monthlyFlow("JPY"),
    IDR: monthlyFlow("IDR"),
  };
  const budgetRemainders: Record<Currency, number> = { JPY: 0, IDR: 0 };
  const dashboardBudgets = budgets.filter((budget) => budget.month === dashboardMonth);
  for (const budget of dashboardBudgets) {
    const wallet = wallets.find((item) => item.id === budget.walletId);
    if (wallet) budgetRemainders[wallet.currency] += budget.amount - budgetSpent(budget);
  }

  async function refreshWallets() {
    setWallets(await getWallets());
  }
  async function refreshTransactions() {
    setTransactions(await getTransactions());
  }
  async function refreshBudgets() {
    setBudgets(await getBudgets());
  }
  async function refreshCategories() {
    setCategories(await getCategories());
  }

  function openWallet(wallet?: WalletRecord) {
    setEditingWallet(wallet ?? null);
    setWalletName(wallet?.name ?? "");
    setWalletCurrency(wallet?.currency ?? "IDR");
    setOpeningBalance(wallet ? String(wallet.openingBalance) : "");
    setModal("wallet");
  }

  async function saveWallet(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(openingBalance || 0);
    if (!walletName.trim() || !Number.isSafeInteger(amount) || amount < 0) {
      setToast("Lengkapi nama dan saldo awal");
      return;
    }
    const now = new Date().toISOString();
    try {
      await putWallet({
        id: editingWallet?.id ?? makeId(),
        name: walletName.trim(),
        currency: editingWallet?.currency ?? walletCurrency,
        openingBalance: amount,
        createdAt: editingWallet?.createdAt ?? now,
        updatedAt: now,
      });
      await refreshWallets();
      setWalletName("");
      setOpeningBalance("");
      setEditingWallet(null);
      setModal(null);
      setToast(editingWallet ? "Dompet berhasil diperbarui" : "Dompet berhasil ditambahkan");
    } catch {
      setToast("Dompet gagal disimpan. Coba lagi.");
    }
  }

  async function removeWallet(wallet: WalletRecord) {
    if (budgets.some((budget) => budget.walletId === wallet.id)) {
      setToast("Dompet yang memiliki anggaran tidak dapat dihapus");
      return;
    }
    if (transactions.some((transaction) => transaction.walletId === wallet.id)) {
      setToast("Dompet yang memiliki transaksi tidak dapat dihapus");
      return;
    }
    if (!window.confirm(`Hapus dompet ${wallet.name}?`)) return;
    try {
      await deleteWallet(wallet.id);
      await refreshWallets();
      setToast("Dompet berhasil dihapus");
    } catch {
      setToast("Dompet gagal dihapus. Coba lagi.");
    }
  }

  function openTransaction(transaction?: TransactionRecord) {
    if (wallets.length === 0) {
      setView("wallets");
      setToast("Tambahkan dompet terlebih dahulu");
      return;
    }
    setEditingTransaction(transaction ?? null);
    setTransactionType(transaction?.type ?? "expense");
    setTransactionWallet(transaction?.walletId ?? wallets[0].id);
    setTransactionCategory(
      transaction?.categoryId ??
        categories.find((category) => category.type === (transaction?.type ?? transactionType))?.id ??
        "",
    );
    setTransactionAmount(transaction ? String(transaction.amount) : "");
    setTransactionDate(transaction?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setTransactionNote(transaction?.note ?? "");
    setModal("transaction");
  }

  async function saveTransaction(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(transactionAmount);
    if (!transactionWallet || !transactionCategory || !Number.isSafeInteger(amount) || amount <= 0) {
      setToast("Lengkapi seluruh kolom transaksi");
      return;
    }
    const now = new Date().toISOString();
    try {
      await putTransaction({
        id: editingTransaction?.id ?? makeId(),
        walletId: transactionWallet,
        type: transactionType,
        amount,
        categoryId: transactionCategory,
        date: new Date(`${transactionDate}T12:00:00.000Z`).toISOString(),
        note: transactionNote.trim() || undefined,
        createdAt: editingTransaction?.createdAt ?? now,
        updatedAt: now,
      });
      await refreshTransactions();
      setTransactionAmount("");
      setTransactionNote("");
      setEditingTransaction(null);
      setModal(null);
      setToast(editingTransaction ? "Transaksi berhasil diperbarui" : "Transaksi berhasil disimpan");
    } catch {
      setToast("Transaksi gagal disimpan. Coba lagi.");
    }
  }

  async function removeTransaction(transaction: TransactionRecord) {
    if (!window.confirm("Hapus transaksi ini?")) return;
    try {
      await deleteTransaction(transaction.id);
      await refreshTransactions();
      setToast("Transaksi berhasil dihapus");
    } catch {
      setToast("Transaksi gagal dihapus. Coba lagi.");
    }
  }

  function openBudget(budget?: BudgetRecord) {
    if (wallets.length === 0) {
      setView("wallets");
      setToast("Tambahkan dompet sebelum membuat anggaran");
      return;
    }
    const firstExpenseCategory = categories.find((category) => category.type === "expense");
    setEditingBudget(budget ?? null);
    setBudgetWallet(budget?.walletId ?? wallets[0].id);
    setBudgetCategory(budget?.categoryId ?? firstExpenseCategory?.id ?? "");
    setBudgetMonth(budget?.month ?? budgetViewMonth);
    setBudgetAmount(budget ? String(budget.amount) : "");
    setModal("budget");
  }

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(budgetAmount);
    const category = categories.find((item) => item.id === budgetCategory && item.type === "expense");
    if (
      !wallets.some((wallet) => wallet.id === budgetWallet) ||
      !category ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(budgetMonth) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      setToast("Periksa dompet, kategori, bulan, dan nominal anggaran");
      return;
    }

    const existing = budgets.find((item) =>
      item.walletId === budgetWallet &&
      item.categoryId === budgetCategory &&
      item.month === budgetMonth &&
      item.id !== editingBudget?.id,
    );
    const now = new Date().toISOString();
    const budget: BudgetRecord = {
      id: editingBudget?.id ?? existing?.id ?? makeId(),
      walletId: budgetWallet,
      categoryId: budgetCategory,
      month: budgetMonth,
      amount,
      createdAt: editingBudget?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await putBudget(budget);
      await refreshBudgets();
      setBudgetViewMonth(budgetMonth);
      setEditingBudget(null);
      setModal(null);
      setToast(editingBudget || existing ? "Anggaran berhasil diperbarui" : "Anggaran berhasil ditambahkan");
    } catch {
      setToast("Anggaran gagal disimpan. Coba lagi.");
    }
  }

  async function removeBudget(budget: BudgetRecord) {
    if (!window.confirm("Hapus anggaran ini? Riwayat transaksi tidak akan terhapus.")) return;
    try {
      await deleteBudget(budget.id);
      await refreshBudgets();
      setToast("Anggaran berhasil dihapus");
    } catch {
      setToast("Anggaran gagal dihapus. Coba lagi.");
    }
  }

  function openCategory(category?: Category) {
    setEditingCategory(category ?? null);
    setCategoryNameInput(category?.name ?? "");
    setCategoryTypeInput(category?.type ?? "expense");
    setCategoryIconInput(category?.icon ?? "tag");
    setModal("category");
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault();
    const parsed = categorySchema.safeParse({
      id: editingCategory?.id ?? makeId(),
      name: categoryNameInput,
      type: categoryTypeInput,
      icon: categoryIconInput,
    });
    if (!parsed.success) {
      setToast("Nama kategori harus terdiri dari 1–40 karakter");
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== parsed.data.id &&
        category.type === parsed.data.type &&
        category.name.trim().toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase(),
    );
    if (duplicate) {
      setToast("Nama kategori sudah digunakan untuk jenis ini");
      return;
    }

    const isReferenced =
      editingCategory &&
      (transactions.some((transaction) => transaction.categoryId === editingCategory.id) ||
        budgets.some((budget) => budget.categoryId === editingCategory.id));
    if (isReferenced && editingCategory.type !== parsed.data.type) {
      setToast("Jenis kategori tidak dapat diubah karena sudah digunakan");
      return;
    }

    try {
      await putCategories([
        ...categories.filter((category) => category.id !== parsed.data.id),
        parsed.data,
      ]);
      await refreshCategories();
      setModal(null);
      setEditingCategory(null);
      setToast(editingCategory ? "Kategori berhasil diperbarui" : "Kategori berhasil ditambahkan");
    } catch {
      setToast("Kategori gagal disimpan. Coba lagi.");
    }
  }

  async function removeCategory(category: Category) {
    if (
      transactions.some((transaction) => transaction.categoryId === category.id) ||
      budgets.some((budget) => budget.categoryId === category.id)
    ) {
      setToast("Kategori yang sudah digunakan transaksi atau anggaran tidak dapat dihapus");
      return;
    }
    if (!window.confirm(`Hapus kategori ${category.name}?`)) return;
    try {
      await deleteCategory(category.id);
      await refreshCategories();
      setToast("Kategori berhasil dihapus");
    } catch {
      setToast("Kategori gagal dihapus. Coba lagi.");
    }
  }

  const fetchRate = useCallback(async (force = false) => {
    if (!force && rate) {
      const age = Date.now() - new Date(rate.cachedAt).getTime();
      if (age >= 0 && age < 15 * 60 * 1000) return;
    }
    try {
      const response = await fetch("/api/exchange-rate", { cache: "no-store" });
      if (!response.ok) throw new Error("Fetch failed");
      const data = (await response.json()) as ExchangeRateCache;
      await putExchangeRate(data);
      setRate(data);
      setToast("Kurs berhasil diperbarui");
    } catch {
      const cached = await getExchangeRate();
      setRate(cached ?? null);
      setToast(cached ? "Menggunakan kurs terakhir" : "Kurs belum tersedia");
    }
  }, [rate]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchRate();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchRate]);

  async function exportBackup() {
    const exportedAt = new Date().toISOString();
    const backup: BackupEnvelope = {
      schemaVersion: 2,
      exportedAt,
      app: "Cuanku",
      wallets,
      transactions,
      categories,
      budgets,
      preferences: { theme, backupReminderDays },
    };
    let url: string | null = null;
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cuanku-backup-${exportedAt.slice(0, 10)}.json`;
      anchor.click();
    } catch {
      if (url) URL.revokeObjectURL(url);
      setToast("File backup gagal disiapkan. Coba lagi.");
      return;
    }
    if (url) URL.revokeObjectURL(url);

    try {
      await putBackupMetadata(exportedAt);
      setLastBackupAt(exportedAt);
      setToast("Backup disiapkan. Pastikan file tersimpan di perangkat.");
    } catch {
      setToast("File backup disiapkan, tetapi status pengingat gagal diperbarui.");
    }
  }

  function exportTransactionsCsv() {
    const csv = createTransactionsCsv(
      visibleTransactions.map((transaction) => ({
        date: transaction.date.slice(0, 10),
        wallet: walletNameFor(transaction.walletId),
        currency: wallets.find((wallet) => wallet.id === transaction.walletId)?.currency ?? "",
        type: transaction.type === "income" ? "Pemasukan" : "Pengeluaran",
        category: categoryName(transaction.categoryId),
        amount: transaction.amount,
        note: transaction.note,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cuanku-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function updateBackupReminder(value: string) {
    const days = BACKUP_REMINDER_OPTIONS.find((option) => String(option) === value);
    if (!days) {
      setToast("Pilih interval pengingat backup yang tersedia.");
      return;
    }
    try {
      await putBackupMetadata(lastBackupAt, days);
      setBackupReminderDays(days);
      setToast("Pengingat backup berhasil diperbarui.");
    } catch {
      setToast("Pengaturan pengingat backup gagal disimpan.");
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") {
      setPersistentStorageStatus("unsupported");
      setToast("Browser ini tidak mendukung penyimpanan persisten.");
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setPersistentStorageStatus(granted ? "granted" : "not-granted");
      setToast(
        granted
          ? "Permintaan penyimpanan persisten disetujui."
          : "Browser belum memberikan penyimpanan persisten. Buat backup berkala.",
      );
    } catch {
      setPersistentStorageStatus("error");
      setToast("Status penyimpanan persisten tidak dapat diperbarui.");
    }
  }

  async function importBackup(file: File) {
    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      if (!window.confirm("Import akan mengganti seluruh data Cuanku saat ini. Lanjutkan?")) return;
      await replaceAllData({
        wallets: backup.wallets,
        transactions: backup.transactions,
        categories: backup.categories,
        budgets: backup.budgets,
        lastBackupAt: backup.exportedAt,
        backupReminderDays: backup.preferences?.backupReminderDays,
      });
      await refreshWallets();
      await refreshTransactions();
      await refreshBudgets();
      setCategories(backup.categories);
      setLastBackupAt(backup.exportedAt);
      if (backup.preferences?.backupReminderDays) {
        setBackupReminderDays(backup.preferences.backupReminderDays);
      }
      if (backup.preferences) setTheme(backup.preferences.theme);
      setToast("Backup berhasil dipulihkan");
    } catch (error) {
      setToast(
        error instanceof SyntaxError
          ? "File JSON backup rusak. Data lokal tidak diubah."
          : error instanceof Error
            ? error.message
            : "File backup tidak valid. Data lokal tidak diubah.",
      );
    }
  }

  async function deleteAllData() {
    if (!window.confirm("Hapus seluruh dompet dan transaksi? Tindakan ini tidak dapat dibatalkan.")) return;
    await replaceAllData({
      wallets: [],
      transactions: [],
      categories: DEFAULT_CATEGORIES,
      budgets: [],
      lastBackupAt: null,
    });
    await refreshWallets();
    await refreshTransactions();
    await refreshBudgets();
    setCategories(DEFAULT_CATEGORIES);
    setLastBackupAt(null);
    setToast("Seluruh data berhasil dihapus");
  }

  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Lainnya";
  const walletNameFor = (id: string) =>
    wallets.find((wallet) => wallet.id === id)?.name ?? "Dompet";
  const budgetCategoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Kategori";
  const currentBudgets = budgets.filter((budget) => budget.month === budgetViewMonth);
  const backupReminderDue = isBackupReminderDue(lastBackupAt, backupReminderDays);
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const normalizedTransactionSearch = transactionSearch.trim().toLocaleLowerCase();
  const visibleTransactions = sortedTransactions.filter((transaction) => {
    const wallet = wallets.find((item) => item.id === transaction.walletId);
    const date = transaction.date.slice(0, 10);
    const matchesType = transactionTypeFilter === "all" || transaction.type === transactionTypeFilter;
    const matchesCurrency = transactionCurrencyFilter === "all" || wallet?.currency === transactionCurrencyFilter;
    const matchesFrom = !transactionFromFilter || date >= transactionFromFilter;
    const matchesTo = !transactionToFilter || date <= transactionToFilter;
    const matchesWallet = transactionWalletFilter === "all" || transaction.walletId === transactionWalletFilter;
    const matchesCategory = transactionCategoryFilter === "all" || transaction.categoryId === transactionCategoryFilter;
    const matchesSearch =
      !normalizedTransactionSearch ||
      (transaction.note?.toLocaleLowerCase().includes(normalizedTransactionSearch) ?? false);
    return matchesType && matchesCurrency && matchesFrom && matchesTo && matchesWallet && matchesCategory && matchesSearch;
  });
  const resetTransactionFilters = () => {
    setTransactionTypeFilter("all");
    setTransactionCurrencyFilter("all");
    setTransactionFromFilter("");
    setTransactionToFilter("");
    setTransactionWalletFilter("all");
    setTransactionCategoryFilter("all");
    setTransactionSearch("");
  };
  const reportMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(reportMonth, index - 5));
  const reportMonthLabel = (month: string) => {
    const [year, value] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(year, value - 1, 1));
  };
  const currencyReport = (currency: Currency) => {
    const relevantTransactions: ReportTransaction[] = transactions.filter((transaction) =>
      wallets.some((wallet) => wallet.id === transaction.walletId && wallet.currency === currency),
    );
    const totals = calculateMonthlyTotals(relevantTransactions, reportMonth);
    const previousTotals = calculateMonthlyTotals(relevantTransactions, shiftMonth(reportMonth, -1));
    const trend = reportMonths.map((month) => ({
      month,
      ...calculateMonthlyTotals(relevantTransactions, month),
    }));
    const categoryTotals = categories
      .filter((category) => category.type === "expense")
      .map((category) => ({
        category,
        amount: relevantTransactions
          .filter((transaction) => transaction.type === "expense" && transaction.categoryId === category.id && transaction.date.startsWith(reportMonth))
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { totals, previousTotals, trend, categoryTotals };
  };
  const selectMoreView = (nextView: View) => {
    setView(nextView);
    setMoreOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Beranda Cuanku">
          <span className="brand-mark">C</span>
          <span>cuanku</span>
        </button>
        <nav className="nav-list" aria-label="Navigasi utama">
          <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={19} />} label="Ringkasan" onClick={() => setView("dashboard")} />
          <NavButton active={view === "transactions"} icon={<ReceiptText size={19} />} label="Transaksi" onClick={() => setView("transactions")} />
          <NavButton className="mobile-more-item" active={view === "wallets"} icon={<WalletCards size={19} />} label="Dompet" onClick={() => setView("wallets")} />
          <NavButton active={view === "budgets"} icon={<ChartPie size={19} />} label="Anggaran" onClick={() => setView("budgets")} />
          <NavButton active={view === "reports"} icon={<Landmark size={19} />} label="Laporan" onClick={() => setView("reports")} />
          <NavButton className="mobile-more-item" active={view === "backup"} icon={<Download size={19} />} label="Backup" onClick={() => setView("backup")} />
          <NavButton className="mobile-more-item" active={view === "settings"} icon={<Settings size={19} />} label="Pengaturan" onClick={() => setView("settings")} />
          <div className={`mobile-more${["wallets", "backup", "settings"].includes(view) ? " active" : ""}`} ref={moreMenuRef}>
            <button
              className={`nav-item${["wallets", "backup", "settings"].includes(view) ? " active" : ""}`}
              aria-expanded={moreOpen}
              aria-controls="mobile-more-menu"
              aria-label="Lainnya"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreHorizontal size={19} /><span>Lainnya</span>
            </button>
            {moreOpen && (
              <nav className="more-menu" id="mobile-more-menu" aria-label="Menu lainnya">
                <button onClick={() => selectMoreView("wallets")}><WalletCards size={18} /> Dompet</button>
                <button onClick={() => selectMoreView("backup")}><Download size={18} /> Backup</button>
                <button onClick={() => selectMoreView("settings")}><Settings size={18} /> Pengaturan</button>
              </nav>
            )}
          </div>
        </nav>
      </aside>

      <main className="main-content" aria-busy={loading}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Keuangan pribadi</p>
            <h1>{{
              dashboard: "Ringkasan",
              transactions: "Transaksi",
              wallets: "Dompet",
              budgets: "Anggaran",
              reports: "Laporan",
              backup: "Backup & Pemulihan",
              settings: "Pengaturan",
            }[view]}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ganti tema">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="primary-button add-transaction-button" aria-label="Tambah transaksi" onClick={() => openTransaction()}><Plus size={17} /> Tambah transaksi</button>
          </div>
        </header>

        {loading ? (
          <div className="dashboard-skeleton" role="status" aria-label="Memuat data lokal">
            <div className="skeleton-balance-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index} />)}
            </div>
            <div className="skeleton-section-heading" aria-hidden="true" />
            <div className="skeleton-rows" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => <div className="skeleton-row" key={index} />)}
            </div>
            <span className="sr-only">Memuat data lokal...</span>
          </div>
        ) : loadError ? (
          <div className="load-error" role="alert">
            <h2>Data lokal belum bisa dibuka</h2>
            <p>{loadError}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>Coba lagi</button>
          </div>
        ) : (
          <>
            {view === "dashboard" && (
              <section>
                {backupReminderDue && (
                  <aside className="backup-reminder" aria-labelledby="backup-reminder-title">
                    <div>
                      <strong id="backup-reminder-title">Saatnya membuat backup data</strong>
                      <p>
                        {lastBackupAt
                          ? `Backup terakhir ${new Date(lastBackupAt).toLocaleDateString("id-ID")}.`
                          : "Belum ada backup yang tercatat di perangkat ini."}{" "}
                        Simpan salinan JSON di tempat yang aman; data utama tetap hanya ada di browser ini.
                      </p>
                    </div>
                    <button className="primary-button" onClick={() => void exportBackup()}><Download size={17} /> Backup sekarang</button>
                  </aside>
                )}
                <div className="balance-grid">
                  <article className="balance-card featured">
                    <span>Saldo JPY</span>
                    <strong>{formatMoney(balances.JPY, "JPY")}</strong>
                    <small>{wallets.filter((wallet) => wallet.currency === "JPY").length} dompet</small>
                    <div className="monthly-flow">
                      <div><span>Pemasukan bulan ini</span><strong>+{formatMoney(monthlyFlows.JPY.income, "JPY")}</strong></div>
                      <div><span>Pengeluaran bulan ini</span><strong>-{formatMoney(monthlyFlows.JPY.expense, "JPY")}</strong></div>
                    </div>
                  </article>
                  <article className="balance-card">
                    <span>Saldo IDR</span>
                    <strong>{formatMoney(balances.IDR, "IDR")}</strong>
                    <small>{wallets.filter((wallet) => wallet.currency === "IDR").length} dompet</small>
                    <div className="monthly-flow">
                      <div><span>Pemasukan bulan ini</span><strong>+{formatMoney(monthlyFlows.IDR.income, "IDR")}</strong></div>
                      <div><span>Pengeluaran bulan ini</span><strong>-{formatMoney(monthlyFlows.IDR.expense, "IDR")}</strong></div>
                    </div>
                  </article>
                  <article className="balance-card estimate">
                    <span>Estimasi lintas mata uang</span>
                    {rate ? (
                      <>
                        <strong>{formatMoney(calculateEstimatedTotalInIdr(balances, rate.rate), "IDR")}</strong>
                        <small>Estimasi · 1 JPY = {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(rate.rate)} IDR</small>
                      </>
                    ) : <strong className="muted">Belum tersedia</strong>}
                  </article>
                  <article className="balance-card budget-summary">
                    <span>Sisa anggaran bulan ini</span>
                    {dashboardBudgets.length ? (
                      <div className="budget-currency-summary">
                        {(["JPY", "IDR"] as Currency[]).map((currency) => (
                          <div key={currency}>
                            <span>{currency}</span>
                            <strong className={budgetRemainders[currency] < 0 ? "expense" : ""}>
                              {formatMoney(budgetRemainders[currency], currency)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <strong className="muted">Belum ada anggaran</strong>
                        <button className="text-button" onClick={() => setView("budgets")}>Atur anggaran bulanan</button>
                      </>
                    )}
                    {dashboardBudgets.length > 0 && <small>{dashboardBudgets.length} kategori dianggarkan</small>}
                  </article>
                </div>

                <div className="section-heading">
                  <div><p className="eyebrow">Aktivitas terbaru</p><h2>Transaksi</h2></div>
                  <button className="text-button" onClick={() => setView("transactions")}>Lihat semua</button>
                </div>
                {sortedTransactions.length ? (
                  <TransactionList transactions={sortedTransactions.slice(0, 8)} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onEdit={openTransaction} onDelete={removeTransaction} />
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Catat transaksi pertama" onAction={() => openTransaction()} />}
              </section>
            )}

            {view === "transactions" && (
              <section>
                <div className="transaction-filters" aria-label="Filter transaksi">
                  <label>Jenis<select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value as "all" | TransactionType)}><option value="all">Semua jenis</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></label>
                  <label>Mata uang<select value={transactionCurrencyFilter} onChange={(event) => setTransactionCurrencyFilter(event.target.value as "all" | Currency)}><option value="all">Semua mata uang</option><option value="JPY">JPY</option><option value="IDR">IDR</option></select></label>
                  <label>Dompet<select value={transactionWalletFilter} onChange={(event) => setTransactionWalletFilter(event.target.value)}><option value="all">Semua dompet</option>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select></label>
                  <label>Kategori<select value={transactionCategoryFilter} onChange={(event) => setTransactionCategoryFilter(event.target.value)}><option value="all">Semua kategori</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name} · {category.type === "income" ? "Pemasukan" : "Pengeluaran"}</option>)}</select></label>
                  <label>Dari tanggal<input type="date" value={transactionFromFilter} onChange={(event) => setTransactionFromFilter(event.target.value)} /></label>
                  <label>Sampai tanggal<input type="date" value={transactionToFilter} onChange={(event) => setTransactionToFilter(event.target.value)} /></label>
                  <label className="transaction-search">Cari catatan<input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Kata kunci..." /></label>
                  <div className="transaction-filter-actions">
                    <button className="text-button" onClick={resetTransactionFilters}>Reset filter</button>
                    <button className="secondary-button" disabled={!visibleTransactions.length} onClick={exportTransactionsCsv}><Download size={16} /> Ekspor CSV</button>
                  </div>
                </div>
                {visibleTransactions.length ? (
                  <TransactionList transactions={visibleTransactions} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onEdit={openTransaction} onDelete={removeTransaction} />
                ) : transactions.length ? (
                  <div className="empty-state"><div className="empty-icon"><ReceiptText /></div><h2>Tidak ada transaksi yang cocok</h2><button className="text-button" onClick={resetTransactionFilters}>Hapus filter</button></div>
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Tambah transaksi" onAction={() => openTransaction()} />}
              </section>
            )}

            {view === "wallets" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Pengelolaan</p><h2>Dompet Anda</h2></div>
                  <button className="primary-button" onClick={() => openWallet()}><Plus size={17} /> Dompet baru</button>
                </div>
                {wallets.length ? (
                  <div className="wallet-grid">
                    {wallets.map((wallet) => (
                      <article className="wallet-card" key={wallet.id}>
                        <div className="wallet-icon"><WalletCards size={20} /></div>
                        <div className="wallet-main">
                          <span>{wallet.currency}</span>
                          <h3>{wallet.name}</h3>
                          <strong>{formatMoney(calculateCurrencyBalances([wallet], domainTransactions)[wallet.currency], wallet.currency)}</strong>
                        </div>
                        <div className="wallet-actions">
                          <button className="icon-button" onClick={() => openWallet(wallet)} aria-label={`Edit ${wallet.name}`}><Pencil size={16} /></button>
                          <button className="icon-button danger" onClick={() => removeWallet(wallet)} aria-label={`Hapus ${wallet.name}`}><Trash2 size={17} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon={<WalletCards />} title="Belum ada dompet" action="Buat dompet pertama" onAction={() => openWallet()} />}
              </section>
            )}

            {view === "budgets" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Rencana bulanan</p><h2>Anggaran pengeluaran</h2></div>
                  <div className="budget-heading-actions">
                    <label className="month-picker">Bulan<input type="month" value={budgetViewMonth} onChange={(event) => setBudgetViewMonth(event.target.value)} /></label>
                    <button className="primary-button" onClick={() => openBudget()}><Plus size={17} /> Anggaran baru</button>
                  </div>
                </div>
                {currentBudgets.length ? (
                  <div className="budget-grid">
                    {currentBudgets.map((budget) => {
                      const wallet = wallets.find((item) => item.id === budget.walletId);
                      const spent = budgetSpent(budget);
                      const remaining = budget.amount - spent;
                      const progress = Math.min(100, (spent / budget.amount) * 100);
                      const isOver = spent > budget.amount;
                      return (
                        <article className={`budget-card${isOver ? " over" : ""}`} key={budget.id}>
                          <div className="budget-card-heading">
                            <div>
                              <span className="eyebrow">{budgetCategoryName(budget.categoryId)}</span>
                              <h3>{wallet?.name ?? "Dompet"} <span>· {wallet?.currency}</span></h3>
                            </div>
                            <div className="budget-actions">
                              <button className="icon-button" onClick={() => openBudget(budget)} aria-label="Edit anggaran"><Pencil size={16} /></button>
                              <button className="icon-button danger" onClick={() => removeBudget(budget)} aria-label="Hapus anggaran"><Trash2 size={16} /></button>
                            </div>
                          </div>
                          <div className="budget-numbers">
                            <div><span>Terpakai</span><strong>{formatMoney(spent, wallet?.currency ?? "IDR")}</strong></div>
                            <div><span>Anggaran</span><strong>{formatMoney(budget.amount, wallet?.currency ?? "IDR")}</strong></div>
                          </div>
                          <div className="budget-progress" role="progressbar" aria-label={`Penggunaan anggaran ${budgetCategoryName(budget.categoryId)}`} aria-valuenow={Math.round(Math.min(100, spent / budget.amount * 100))} aria-valuemin={0} aria-valuemax={100}>
                            <span style={{ width: `${progress}%` }} />
                          </div>
                          <p className="budget-remaining">
                            {isOver ? "Melebihi anggaran" : "Sisa anggaran"}{" "}
                            <strong>{formatMoney(remaining, wallet?.currency ?? "IDR")}</strong>
                            <span>{Math.round(spent / budget.amount * 100)}% terpakai</span>
                          </p>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={<ChartPie />}
                    title={budgets.length ? "Belum ada anggaran untuk bulan ini" : "Belum ada anggaran"}
                    action="Buat anggaran"
                    onAction={() => openBudget()}
                  />
                )}
              </section>
            )}

            {view === "reports" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Analisis terpisah per mata uang</p><h2>Laporan bulanan</h2></div>
                  <label className="month-picker">Periode<input type="month" value={reportMonth} onChange={(event) => setReportMonth(/^\d{4}-\d{2}$/.test(event.target.value) ? event.target.value : currentMonth())} /></label>
                </div>
                <div className="report-grid">
                  {(["JPY", "IDR"] as Currency[]).map((currency) => {
                    const { totals, previousTotals, trend, categoryTotals } = currencyReport(currency);
                    const maxTrendValue = Math.max(1, ...trend.flatMap((item) => [item.income, item.expense]));
                    const totalExpenses = categoryTotals.reduce((sum, item) => sum + item.amount, 0);
                    return (
                      <div className="currency-report" key={currency}>
                        <article className="report-card">
                          <p className="eyebrow">Ringkasan {currency} · {reportMonth}</p>
                          <h2>{formatMoney(totals.income - totals.expense, currency)}</h2>
                          <p className="report-caption">Arus kas bersih</p>
                          <div className="report-row"><span>Pemasukan</span><strong className="income">+{formatMoney(totals.income, currency)}</strong></div>
                          <div className="report-row"><span>Pengeluaran</span><strong className="expense">-{formatMoney(totals.expense, currency)}</strong></div>
                          <div className="report-comparison">
                            <span>vs. {shiftMonth(reportMonth, -1)}</span>
                            <span>Pemasukan <strong>{totals.income - previousTotals.income >= 0 ? "+" : "−"}{formatMoney(Math.abs(totals.income - previousTotals.income), currency)}</strong></span>
                            <span>Pengeluaran <strong>{totals.expense - previousTotals.expense >= 0 ? "+" : "−"}{formatMoney(Math.abs(totals.expense - previousTotals.expense), currency)}</strong></span>
                          </div>
                        </article>
                        <article className="report-card">
                          <h3>Tren enam bulan · {currency}</h3>
                          <div className="trend-chart" aria-hidden="true">
                            {trend.map((item) => (
                              <div className="trend-column" key={item.month}>
                                <div className="trend-bar-pair">
                                  <span className="income-bar" style={{ height: `${item.income / maxTrendValue * 100}%` }} />
                                  <span className="expense-bar" style={{ height: `${item.expense / maxTrendValue * 100}%` }} />
                                </div>
                                <span>{reportMonthLabel(item.month)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="trend-legend"><span className="income">Pemasukan</span><span className="expense">Pengeluaran</span></div>
                          <table className="report-table">
                            <caption>Rincian tren {currency}</caption>
                            <thead><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th></tr></thead>
                            <tbody>{trend.map((item) => <tr key={item.month}><th scope="row">{item.month}</th><td>{formatMoney(item.income, currency)}</td><td>{formatMoney(item.expense, currency)}</td></tr>)}</tbody>
                          </table>
                        </article>
                        <article className="report-card">
                          <h3>Pengeluaran per kategori</h3>
                          <p className="report-caption">{reportMonth} · {currency}</p>
                          {categoryTotals.length ? (
                            <>
                              <div className="distribution-list">
                                {categoryTotals.map(({ category, amount }) => {
                                  const percent = totalExpenses ? Math.round(amount / totalExpenses * 100) : 0;
                                  const Icon = CATEGORY_ICONS[category.icon ?? "tag"];
                                  return (
                                    <div className="distribution-item" key={category.id}>
                                      <div className="distribution-heading"><span><Icon size={16} />{category.name}</span><strong>{formatMoney(amount, currency)} <small>{percent}%</small></strong></div>
                                      <div className="distribution-bar" role="progressbar" aria-label={`${category.name}, ${percent}% dari pengeluaran`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
                                    </div>
                                  );
                                })}
                              </div>
                              <table className="report-table">
                                <caption>Rincian kategori pengeluaran {currency}</caption>
                                <thead><tr><th>Kategori</th><th>Nominal</th><th>Persentase</th></tr></thead>
                                <tbody>{categoryTotals.map(({ category, amount }) => <tr key={category.id}><th scope="row">{category.name}</th><td>{formatMoney(amount, currency)}</td><td>{totalExpenses ? Math.round(amount / totalExpenses * 100) : 0}%</td></tr>)}</tbody>
                              </table>
                            </>
                          ) : <p className="report-caption">Belum ada pengeluaran pada periode ini.</p>}
                        </article>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {view === "backup" && (
              <section className="settings-grid">
                <article className="settings-card">
                  <h2>Export backup</h2>
                  <p>Unduh seluruh dompet, transaksi, kategori, dan preferensi sebagai JSON.</p>
                  <button className="primary-button" onClick={exportBackup}><Download size={17} /> Unduh JSON</button>
                </article>
                <article className="settings-card">
                  <h2>Import backup</h2>
                  <p>Data lama akan diganti atomik setelah file berhasil divalidasi.</p>
                  <label className="secondary-button">Pilih file JSON<input type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])} /></label>
                </article>
                <article className="settings-card danger-card">
                  <h2>Hapus seluruh data</h2>
                  <p>Tindakan ini menghapus semua dompet dan transaksi dari browser.</p>
                  <button className="danger-button" onClick={deleteAllData}><Trash2 size={17} /> Hapus data</button>
                </article>
              </section>
            )}

            {view === "settings" && (
              <section className="settings-grid">
                <article className="settings-card">
                  <h2>Tampilan</h2>
                  <p>Pilih tema aplikasi.</p>
                  <div className="theme-options">
                    {(["light", "dark", "system"] as Preferences["theme"][]).map((option) => (
                      <button key={option} className={theme === option ? "selected" : ""} onClick={() => setTheme(option)}>
                        {option === "light" ? "Terang" : option === "dark" ? "Gelap" : "Sistem"}
                      </button>
                    ))}
                  </div>
                </article>
                <article className="settings-card">
                  <h2>Kurs JPY → IDR</h2>
                  {rate ? <p>1 JPY = {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(rate.rate)} IDR<br /><small>Diperbarui {new Date(rate.cachedAt).toLocaleString("id-ID")}</small></p> : <p>Kurs belum tersedia. Estimasi lintas mata uang akan disembunyikan.</p>}
                  <button className="secondary-button" onClick={() => void fetchRate(true)}>Perbarui kurs</button>
                </article>
                <article className="settings-card">
                  <h2>Pengingat backup</h2>
                  <p>Pilih seberapa sering Cuanku mengingatkan Anda untuk menyimpan salinan data.</p>
                  <label className="settings-select-label">Ingatkan setiap
                    <select value={backupReminderDays} onChange={(event) => void updateBackupReminder(event.target.value)}>
                      {BACKUP_REMINDER_OPTIONS.map((days) => <option value={days} key={days}>{days} hari</option>)}
                    </select>
                  </label>
                  <small>{lastBackupAt ? `Backup terakhir: ${new Date(lastBackupAt).toLocaleString("id-ID")}` : "Belum ada backup yang tercatat."}</small>
                </article>
                <article className="settings-card">
                  <h2>Penyimpanan browser</h2>
                  <p>Permintaan ini membantu mencegah browser menghapus data lokal secara otomatis, tetapi tidak menggantikan backup.</p>
                  <p className="storage-status" aria-live="polite">
                    {persistentStorageStatus === "checking"
                      ? "Memeriksa status..."
                      : persistentStorageStatus === "granted"
                        ? "Penyimpanan persisten aktif."
                        : persistentStorageStatus === "not-granted"
                          ? "Penyimpanan persisten belum diberikan."
                          : persistentStorageStatus === "unsupported"
                            ? "Browser ini tidak mendukung fitur penyimpanan persisten."
                            : "Status penyimpanan tidak dapat diperiksa."}
                  </p>
                  <button
                    className="secondary-button"
                    disabled={persistentStorageStatus === "checking" || persistentStorageStatus === "granted" || persistentStorageStatus === "unsupported"}
                    onClick={() => void requestPersistentStorage()}
                  >
                    {persistentStorageStatus === "granted" ? "Sudah aktif" : "Minta penyimpanan persisten"}
                  </button>
                </article>
                <article className="settings-card category-settings">
                  <div className="section-heading">
                    <div><h2>Kategori</h2><p>Kelola kategori pemasukan dan pengeluaran.</p></div>
                    <button className="primary-button" onClick={() => openCategory()}><Plus size={17} /> Kategori</button>
                  </div>
                  <div className="category-list">
                    {categories.map((category) => {
                      const Icon = CATEGORY_ICONS[category.icon ?? "tag"];
                      return (
                        <div className="category-row" key={category.id}>
                          <span className="category-icon"><Icon size={17} /></span>
                          <span className="category-row-name">{category.name}<small>{category.type === "income" ? "Pemasukan" : "Pengeluaran"}</small></span>
                          <button className="icon-button" onClick={() => openCategory(category)} aria-label={`Edit kategori ${category.name}`}><Pencil size={16} /></button>
                          <button className="icon-button danger" onClick={() => void removeCategory(category)} aria-label={`Hapus kategori ${category.name}`}><Trash2 size={16} /></button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </section>
            )}
          </>
        )}
      </main>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading">
              <h2 id="modal-title">
                {modal === "category"
                  ? editingCategory ? "Edit kategori" : "Kategori baru"
                  : modal === "budget"
                  ? editingBudget ? "Edit anggaran" : "Anggaran baru"
                  : modal === "wallet"
                    ? editingWallet ? "Edit dompet" : "Dompet baru"
                    : editingTransaction ? "Edit transaksi" : "Transaksi baru"}
              </h2>
              <button className="icon-button" onClick={() => setModal(null)} aria-label="Tutup"><X size={18} /></button>
            </div>
            {modal === "category" ? (
              <form onSubmit={saveCategory}>
                <label>Nama kategori<input value={categoryNameInput} maxLength={40} onChange={(event) => setCategoryNameInput(event.target.value)} placeholder="Contoh: Transportasi" /></label>
                <label>Jenis kategori<select value={categoryTypeInput} onChange={(event) => setCategoryTypeInput(event.target.value as TransactionType)}><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></label>
                <label>Ikon kategori<select value={categoryIconInput} onChange={(event) => setCategoryIconInput(event.target.value as CategoryIconId)}>{CATEGORY_ICON_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
                <button className="primary-button wide" type="submit">{editingCategory ? "Simpan perubahan" : "Simpan kategori"}</button>
              </form>
            ) : modal === "budget" ? (
              <form onSubmit={saveBudget}>
                <label>Dompet<select value={budgetWallet} onChange={(event) => setBudgetWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                <label>Kategori pengeluaran<select value={budgetCategory} onChange={(event) => setBudgetCategory(event.target.value)}>{categories.filter((category) => category.type === "expense").map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label>Bulan<input type="month" value={budgetMonth} onChange={(event) => setBudgetMonth(event.target.value)} /></label>
                <label>Nominal anggaran<input type="number" min="1" step="1" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="0" /></label>
                <button className="primary-button wide" type="submit">{editingBudget ? "Simpan perubahan" : "Simpan anggaran"}</button>
              </form>
            ) : modal === "wallet" ? (
              <form onSubmit={saveWallet}>
                <label>Nama dompet<input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Contoh: Tabungan" /></label>
                <label>Mata uang<select value={editingWallet?.currency ?? walletCurrency} disabled={Boolean(editingWallet)} onChange={(event) => setWalletCurrency(event.target.value as Currency)}><option value="JPY">JPY — Yen</option><option value="IDR">IDR — Rupiah</option></select></label>
                <label>Saldo awal<input type="number" min="0" step="1" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0" /></label>
                <button className="primary-button wide" type="submit">{editingWallet ? "Simpan perubahan" : "Simpan dompet"}</button>
              </form>
            ) : (
              <form onSubmit={saveTransaction}>
                <div className="segmented">
                  <button type="button" className={transactionType === "income" ? "selected" : ""} onClick={() => { setTransactionType("income"); setTransactionCategory(categories.find((item) => item.type === "income")?.id ?? ""); }}>Pemasukan</button>
                  <button type="button" className={transactionType === "expense" ? "selected" : ""} onClick={() => { setTransactionType("expense"); setTransactionCategory(categories.find((item) => item.type === "expense")?.id ?? ""); }}>Pengeluaran</button>
                </div>
                <label>Dompet<select value={transactionWallet} onChange={(event) => setTransactionWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                <label>Nominal<input type="number" min="1" step="1" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} placeholder="0" /></label>
                <label>Kategori<select value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)}>{categories.filter((item) => item.type === transactionType).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label>Tanggal<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
                <label>Catatan (opsional)<input value={transactionNote} onChange={(event) => setTransactionNote(event.target.value)} placeholder="Tambahkan keterangan" /></label>
                <button className="primary-button wide" type="submit">{editingTransaction ? "Simpan perubahan" : "Simpan transaksi"}</button>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
  className,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return <button className={`${active ? "nav-item active" : "nav-item"}${className ? ` ${className}` : ""}`} aria-label={label} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function EmptyState({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><button className="primary-button" onClick={onAction}><Plus size={17} /> {action}</button></div>;
}

function TransactionList({
  transactions,
  wallets,
  categoryName,
  walletNameFor,
  onEdit,
  onDelete,
}: {
  transactions: TransactionRecord[];
  wallets: WalletRecord[];
  categoryName: (id: string) => string;
  walletNameFor: (id: string) => string;
  onEdit: (transaction: TransactionRecord) => void;
  onDelete: (transaction: TransactionRecord) => void;
}) {
  return (
    <div className="transaction-list">
      {transactions.map((transaction) => {
        const wallet = wallets.find((item) => item.id === transaction.walletId);
        const currency = wallet?.currency ?? "IDR";
        return (
          <article className="transaction-row" key={transaction.id}>
            <div className={transaction.type === "income" ? "transaction-icon income" : "transaction-icon expense"}>
              {transaction.type === "income" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
            </div>
            <div className="transaction-main">
              <h3>{categoryName(transaction.categoryId)}</h3>
              <p>{walletNameFor(transaction.walletId)} · {new Date(transaction.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
            <strong className={transaction.type === "income" ? "income" : "expense"}>
              {transaction.type === "income" ? "+" : "-"}{formatMoney(transaction.amount, currency)}
            </strong>
            <div className="row-actions">
              <button className="icon-button" onClick={() => onEdit(transaction)} aria-label="Edit transaksi"><Pencil size={16} /></button>
              <button className="icon-button danger" onClick={() => onDelete(transaction)} aria-label="Hapus transaksi"><Trash2 size={16} /></button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
