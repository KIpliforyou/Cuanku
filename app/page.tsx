"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
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
  calculateEstimatedTotalInJpy,
  calculateMonthlyTotals,
  calculateWalletBalance,
  formatMoney,
  type Currency,
  type TransactionType,
} from "../lib/domain";
import { CATEGORY_ICON_OPTIONS, DEFAULT_CATEGORIES } from "../lib/categories";
import { isBackupReminderDue } from "../lib/backup";
import type {
  BackupEnvelope,
  BudgetAlertThreshold,
  BackupReminderDays,
  BudgetRecord,
  Category,
  CategoryIconId,
  ExchangeRateCache,
  ExchangeRateHistoryRecord,
  Preferences,
  RecurringDraft,
  RecurringRule,
  TransactionRecord,
  TransferRecord,
  WalletRecord,
} from "../lib/models";
import {
  approveRecurringDraft,
  claimBudgetAlert,
  deleteCategory,
  deleteTransaction,
  deleteBudget,
  deleteWallet,
  deleteRecurringRule,
  deleteTransfer,
  discardRecurringDraft,
  generateDueRecurringDrafts,
  getCategories,
  getBackupReminderDays,
  getBudgets,
  getExchangeRate,
  getExchangeRateHistory,
  getLastBackupAt,
  getRecurringRules,
  getRecurringDrafts,
  getTransactions,
  getTransfers,
  getWallets,
  putCategories,
  putBackupMetadata,
  putBudget,
  putExchangeRate,
  putTransaction,
  putWallet,
  replaceAllData,
  putRecurringRule,
  saveTransfer,
} from "../lib/storage";
import { categorySchema, exchangeRateCacheSchema, validateBackup } from "../lib/validation";
import { createTransactionsCsv } from "../lib/csv";
import { BACKUP_REMINDER_OPTIONS, BUDGET_ALERT_THRESHOLDS } from "../lib/models";
import { getTokyoDateString, parseRateInput, rateFromScaled, convertAmount } from "../lib/exchange-rate";
import { getBudgetAlertLevel, getCrossedBudgetThresholds } from "../lib/budget-alerts";

type View = "dashboard" | "transactions" | "wallets" | "budgets" | "reports" | "backup" | "settings" | "transfers" | "recurring";
type ReportTransaction = Pick<TransactionRecord, "date" | "type" | "amount" | "categoryId">;
type PersistentStorageStatus = "checking" | "granted" | "not-granted" | "unsupported" | "error";
type ServiceWorkerStatus = "checking" | "ready" | "error";

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
const subscribeToOnlineStatus = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
const getOnlineStatus = () => navigator.onLine;
const getServerOnlineStatus = () => true;
const subscribeToServiceWorkerSupport = () => () => {};
const getServiceWorkerSupport = () => "serviceWorker" in navigator;
const currentMonth = () => getTokyoDateString().slice(0, 7);
const isDateString = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
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
  const [rateHistory, setRateHistory] = useState<ExchangeRateHistoryRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [recurringDrafts, setRecurringDrafts] = useState<RecurringDraft[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("IDR");
  const [showEquivalentInReports, setShowEquivalentInReports] = useState(false);
  const [manualRateInput, setManualRateInput] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupReminderDays, setBackupReminderDays] = useState<BackupReminderDays>(14);
  const [persistentStorageStatus, setPersistentStorageStatus] = useState<PersistentStorageStatus>("checking");
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<ServiceWorkerStatus>("checking");
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getServerOnlineStatus);
  const serviceWorkerSupported = useSyncExternalStore(
    subscribeToServiceWorkerSupport,
    getServiceWorkerSupport,
    getServerOnlineStatus,
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [theme, setTheme] = useState<Preferences["theme"]>("light");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [modal, setModal] = useState<"wallet" | "transaction" | "budget" | "category" | "transfer" | "conversion" | "recurring" | null>(null);
  const [toast, setToast] = useState("");
  const [editingWallet, setEditingWallet] = useState<WalletRecord | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);
  const [budgetViewMonth, setBudgetViewMonth] = useState(currentMonth);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"all" | TransactionType | "transfer">("all");
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
  const [walletKind, setWalletKind] = useState<"cash" | "credit">("cash");
  const [creditLimit, setCreditLimit] = useState("");
  const [statementClosingDay, setStatementClosingDay] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("");

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [transactionWallet, setTransactionWallet] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => getTokyoDateString());
  const [transactionNote, setTransactionNote] = useState("");
  const [budgetWallet, setBudgetWallet] = useState("");
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetAlertThresholds, setBudgetAlertThresholds] = useState<BudgetAlertThreshold[]>([80, 100]);

  const [editingTransfer, setEditingTransfer] = useState<TransferRecord | null>(null);
  const [transferKind, setTransferKind] = useState<TransferRecord["kind"]>("transfer");
  const [transferFromWallet, setTransferFromWallet] = useState("");
  const [transferToWallet, setTransferToWallet] = useState("");
  const [transferFromAmount, setTransferFromAmount] = useState("");
  const [transferFeeAmount, setTransferFeeAmount] = useState("0");
  const [transferRateInput, setTransferRateInput] = useState("");
  const [transferDate, setTransferDate] = useState(() => getTokyoDateString());
  const [transferNote, setTransferNote] = useState("");

  const [editingRecurringRule, setEditingRecurringRule] = useState<RecurringRule | null>(null);
  const [recurringWallet, setRecurringWallet] = useState("");
  const [recurringType, setRecurringType] = useState<TransactionType>("expense");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringCategory, setRecurringCategory] = useState("");
  const [recurringNote, setRecurringNote] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringRule["frequency"]>("monthly");
  const [recurringStartDate, setRecurringStartDate] = useState(() => getTokyoDateString());
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const serviceWorkerRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [
          storedWallets,
          storedTransactions,
          storedCategories,
          storedRate,
          storedRateHistory,
          storedBudgets,
          storedTransfers,
          storedLastBackupAt,
          storedBackupReminderDays,
        ] = await Promise.all([
          getWallets(),
          getTransactions(),
          getCategories(),
          getExchangeRate(),
          getExchangeRateHistory(),
          getBudgets(),
          getTransfers(),
          getLastBackupAt(),
          getBackupReminderDays(),
        ]);
        let resolvedRateHistory = storedRateHistory;
        if (
          storedRate &&
          storedRateHistory.length === 0 &&
          Number.isFinite(storedRate.rate) &&
          storedRate.rate > 0 &&
          Number.isSafeInteger(Math.round(storedRate.rate * 10_000)) &&
          Number.isFinite(Date.parse(storedRate.cachedAt))
        ) {
          const createdAt = storedRate.cachedAt;
          const source = storedRate.source === "manual" ? "manual" : "api";
          const legacyRate: ExchangeRateHistoryRecord = {
            id: `${getTokyoDateString(new Date(createdAt))}:${source}`,
            date: getTokyoDateString(new Date(createdAt)),
            rateScaled: Math.round(storedRate.rate * 10_000),
            source,
            provider: source === "api" ? storedRate.source : undefined,
            createdAt,
          };
          await putExchangeRate(storedRate, legacyRate);
          resolvedRateHistory = [legacyRate];
        }
        const storedRecurringDrafts = await generateDueRecurringDrafts();
        const currentRecurringRules = await getRecurringRules();
        if (storedCategories.length === 0) {
          await putCategories(DEFAULT_CATEGORIES);
        }
        setWallets(storedWallets);
        setTransactions(storedTransactions);
        setBudgets(storedBudgets);
        setTransfers(storedTransfers);
        setRateHistory(resolvedRateHistory);
        setRecurringRules(currentRecurringRules);
        setRecurringDrafts(storedRecurringDrafts);
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
        setManualRateInput(storedRate?.source === "manual" ? storedRate.rate.toFixed(4) : "");
        const savedTheme = localStorage.getItem("cuanku-theme");
        if (savedTheme === "light" || savedTheme === "dark") {
          setTheme(savedTheme);
        }
        const savedDisplayCurrency = localStorage.getItem("cuanku-display-currency");
        if (savedDisplayCurrency === "JPY" || savedDisplayCurrency === "IDR") {
          setDisplayCurrency(savedDisplayCurrency);
        }
        setShowEquivalentInReports(localStorage.getItem("cuanku-show-equivalent") === "true");
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
    if (!themeLoaded) return;
    localStorage.setItem("cuanku-display-currency", displayCurrency);
    localStorage.setItem("cuanku-show-equivalent", String(showEquivalentInReports));
  }, [displayCurrency, showEquivalentInReports, themeLoaded]);

  useEffect(() => {
    let active = true;

    if (!serviceWorkerSupported) return () => { active = false; };

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!active) return;
      serviceWorkerRegistrationRef.current = registration;
      setServiceWorkerStatus("ready");
      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (active && installing.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {
      if (active) setServiceWorkerStatus("error");
    });

    return () => {
      active = false;
    };
  }, [serviceWorkerSupported]);

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
  const domainTransfers = transfers.map((transfer) => ({
    fromWalletId: transfer.fromWalletId,
    toWalletId: transfer.toWalletId,
    fromAmount: transfer.fromAmount,
    toAmount: transfer.toAmount,
  }));
  const balances = calculateCurrencyBalances(domainWallets, domainTransactions, domainTransfers);
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
  const dashboardBudgetAlerts = dashboardBudgets.flatMap((budget) => {
    const actualLevel = getBudgetAlertLevel(budgetSpent(budget), budget.amount);
    const thresholds = budget.alertThresholds ?? [...BUDGET_ALERT_THRESHOLDS];
    const level = actualLevel === null
      ? null
      : thresholds.filter((threshold) => threshold <= actualLevel).at(-1) ?? null;
    return level
      ? [{ budget, level }]
      : [];
  });
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
    setWalletKind(wallet?.kind ?? "cash");
    setOpeningBalance(wallet ? String(wallet.openingBalance) : "");
    setCreditLimit(wallet?.creditLimit ? String(wallet.creditLimit) : "");
    setStatementClosingDay(wallet?.statementClosingDay ? String(wallet.statementClosingDay) : "");
    setPaymentDueDay(wallet?.paymentDueDay ? String(wallet.paymentDueDay) : "");
    setModal("wallet");
  }

  async function saveWallet(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(openingBalance || 0);
    const limit = creditLimit.trim() ? Number(creditLimit) : undefined;
    const closingDay = statementClosingDay.trim() ? Number(statementClosingDay) : undefined;
    const dueDay = paymentDueDay.trim() ? Number(paymentDueDay) : undefined;
    if (!walletName.trim() || !Number.isSafeInteger(amount) || amount < 0) {
      setToast(walletKind === "credit" ? "Lengkapi nama dan utang awal kartu" : "Lengkapi nama dan saldo awal");
      return;
    }
    if (
      walletKind === "credit" &&
      ((limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) ||
        (closingDay !== undefined && (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31)) ||
        (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)))
    ) {
      setToast("Periksa limit dan tanggal tagihan kartu kredit.");
      return;
    }
    const now = new Date().toISOString();
    try {
      await putWallet({
        id: editingWallet?.id ?? makeId(),
        name: walletName.trim(),
        currency: editingWallet?.currency ?? walletCurrency,
        openingBalance: amount,
        kind: walletKind,
        creditLimit: walletKind === "credit" ? limit : undefined,
        statementClosingDay: walletKind === "credit" ? closingDay : undefined,
        paymentDueDay: walletKind === "credit" ? dueDay : undefined,
        createdAt: editingWallet?.createdAt ?? now,
        updatedAt: now,
      });
      await refreshWallets();
      setWalletName("");
      setOpeningBalance("");
      setWalletKind("cash");
      setCreditLimit("");
      setStatementClosingDay("");
      setPaymentDueDay("");
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
    if (
      transactions.some((transaction) => transaction.walletId === wallet.id) ||
      transfers.some((transfer) =>
        transfer.fromWalletId === wallet.id || transfer.toWalletId === wallet.id,
      )
    ) {
      setToast("Dompet yang memiliki transaksi tidak dapat dihapus");
      return;
    }
    if (recurringRules.some((rule) => rule.walletId === wallet.id)) {
      setToast("Dompet yang digunakan aturan berulang tidak dapat dihapus");
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
    setTransactionDate(transaction?.date.slice(0, 10) ?? getTokyoDateString());
    setTransactionNote(transaction?.note ?? "");
    setModal("transaction");
  }

  async function reportBudgetThresholds(
    previousTransactions: TransactionRecord[],
    nextTransactions: TransactionRecord[],
    savedTransaction: TransactionRecord,
  ) {
    if (savedTransaction.type !== "expense") return [];
    const month = savedTransaction.date.slice(0, 7);
    const messages: string[] = [];
    for (const budget of budgets.filter((item) =>
      item.walletId === savedTransaction.walletId &&
      item.categoryId === savedTransaction.categoryId &&
      item.month === month,
    )) {
      const thresholds = getCrossedBudgetThresholds(
        calculateBudgetSpent(budget, previousTransactions),
        calculateBudgetSpent(budget, nextTransactions),
        budget.amount,
        budget.alertThresholds ?? [...BUDGET_ALERT_THRESHOLDS],
      );
      for (const threshold of thresholds) {
        if (await claimBudgetAlert(budget.id, budget.month, threshold)) {
          messages.push(`${budgetCategoryName(budget.categoryId)} mencapai ${threshold}%`);
        }
      }
    }
    return messages;
  }

  async function saveTransaction(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(transactionAmount);
    if (!transactionWallet || !transactionCategory || !Number.isSafeInteger(amount) || amount <= 0) {
      setToast("Lengkapi seluruh kolom transaksi");
      return;
    }
    if (editingTransaction?.transferId) {
      setToast("Biaya transfer hanya dapat diubah dari riwayat transfer.");
      return;
    }
    const now = new Date().toISOString();
    const savedTransaction: TransactionRecord = {
      id: editingTransaction?.id ?? makeId(),
      walletId: transactionWallet,
      type: transactionType,
      amount,
      categoryId: transactionCategory,
      date: new Date(`${transactionDate}T12:00:00.000Z`).toISOString(),
      note: transactionNote.trim() || undefined,
      recurringRuleId: editingTransaction?.recurringRuleId,
      createdAt: editingTransaction?.createdAt ?? now,
      updatedAt: now,
    };
    const nextTransactions = [
      ...transactions.filter((transaction) => transaction.id !== savedTransaction.id),
      savedTransaction,
    ];
    try {
      await putTransaction(savedTransaction);
      await refreshTransactions();
    } catch {
      setToast("Transaksi gagal disimpan. Coba lagi.");
      return;
    }
    setTransactionAmount("");
    setTransactionNote("");
    setEditingTransaction(null);
    setModal(null);
    try {
      const triggeredAlerts = await reportBudgetThresholds(transactions, nextTransactions, savedTransaction);
      setToast(
        triggeredAlerts.length
          ? `Peringatan anggaran: ${triggeredAlerts.join("; ")}.`
          : editingTransaction ? "Transaksi berhasil diperbarui" : "Transaksi berhasil disimpan",
      );
    } catch {
      setToast("Transaksi tersimpan, tetapi peringatan anggaran gagal diperbarui.");
    }
  }

  async function removeTransaction(transaction: TransactionRecord) {
    if (transaction.transferId) {
      setToast("Biaya transfer hanya dapat dihapus dari riwayat transfer.");
      return;
    }
    if (!window.confirm("Hapus transaksi ini?")) return;
    try {
      await deleteTransaction(transaction.id);
      await refreshTransactions();
      setToast("Transaksi berhasil dihapus");
    } catch {
      setToast("Transaksi gagal dihapus. Coba lagi.");
    }
  }

  function openTransfer(
    transfer?: TransferRecord,
    kind: TransferRecord["kind"] = "transfer",
  ) {
    if (wallets.length < 2) {
      setView("wallets");
      setToast("Tambahkan minimal dua dompet sebelum membuat transfer.");
      return;
    }
    const defaultFrom = transfer?.fromWalletId ?? wallets[0].id;
    const defaultTo = transfer?.toWalletId ?? wallets.find((wallet) => wallet.id !== defaultFrom)?.id ?? "";
    const selectedKind = transfer?.kind ?? kind;
    setEditingTransfer(transfer ?? null);
    setTransferKind(selectedKind);
    setTransferFromWallet(defaultFrom);
    setTransferToWallet(defaultTo);
    setTransferFromAmount(transfer ? String(transfer.fromAmount) : "");
    setTransferFeeAmount(transfer ? String(transfer.feeAmount) : "0");
    setTransferRateInput(
      transfer?.rate
        ? rateFromScaled(transfer.rate.rateScaled).toFixed(4)
        : rate?.rate.toFixed(4) ?? "",
    );
    setTransferDate(transfer?.date ?? getTokyoDateString());
    setTransferNote(transfer?.note ?? "");
    setModal(selectedKind === "conversion" ? "conversion" : "transfer");
  }

  async function saveTransferRecord(event: React.FormEvent) {
    event.preventDefault();
    const from = wallets.find((wallet) => wallet.id === transferFromWallet);
    const to = wallets.find((wallet) => wallet.id === transferToWallet);
    const fromAmount = Number(transferFromAmount);
    const feeAmount = Number(transferFeeAmount || 0);
    if (
      !from ||
      !to ||
      from.id === to.id ||
      !isDateString(transferDate) ||
      !Number.isSafeInteger(fromAmount) ||
      fromAmount <= 0 ||
      !Number.isSafeInteger(feeAmount) ||
      feeAmount < 0
    ) {
      setToast("Periksa dompet, tanggal, nominal transfer, dan biaya admin.");
      return;
    }
    if (transferKind === "transfer" && from.currency !== to.currency) {
      setToast("Transfer biasa harus memakai mata uang yang sama. Gunakan alur konversi.");
      return;
    }
    if (transferKind === "conversion" && from.currency === to.currency) {
      setToast("Pilih dua dompet dengan mata uang berbeda untuk konversi.");
      return;
    }

    let toAmount = fromAmount;
    let snapshot: TransferRecord["rate"];
    if (transferKind === "conversion") {
      const rateScaled = parseRateInput(transferRateInput);
      if (rateScaled === null) {
        setToast("Transfer beda mata uang membutuhkan kurs positif hingga empat desimal.");
        return;
      }
      const knownRate = rateHistory.find((entry) => entry.rateScaled === rateScaled);
      snapshot = {
        date: knownRate?.date ?? getTokyoDateString(),
        rateScaled,
        source: knownRate?.source ?? "manual",
      };
      try {
        toAmount = convertAmount(fromAmount, from.currency, to.currency, rateScaled);
      } catch {
        setToast("Nominal hasil konversi di luar batas yang didukung.");
        return;
      }
      if (toAmount <= 0) {
        setToast("Nominal tujuan menjadi nol setelah pembulatan. Tingkatkan nominal transfer.");
        return;
      }
    }

    const now = new Date().toISOString();
    const transfer: TransferRecord = {
      id: editingTransfer?.id ?? makeId(),
      kind: transferKind,
      date: transferDate,
      fromWalletId: from.id,
      toWalletId: to.id,
      fromAmount,
      toAmount,
      feeAmount,
      rate: snapshot,
      note: transferNote.trim() || undefined,
      createdAt: editingTransfer?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await saveTransfer(transfer);
      const [nextTransactions, nextTransfers, nextCategories] = await Promise.all([
        getTransactions(),
        getTransfers(),
        getCategories(),
      ]);
      setTransactions(nextTransactions);
      setTransfers(nextTransfers);
      setCategories(nextCategories);
      setModal(null);
      setEditingTransfer(null);
      setToast(
        editingTransfer
          ? transferKind === "conversion" ? "Konversi berhasil diperbarui." : "Transfer berhasil diperbarui."
          : transferKind === "conversion" ? "Konversi berhasil disimpan." : "Transfer berhasil disimpan.",
      );
    } catch {
      setToast("Transfer atau konversi gagal disimpan; saldo dan biaya tidak diubah.");
    }
  }

  async function removeTransfer(transfer: TransferRecord) {
    if (!window.confirm("Hapus transfer dan biaya admin terkait?")) return;
    try {
      await deleteTransfer(transfer.id);
      const [nextTransactions, nextTransfers] = await Promise.all([getTransactions(), getTransfers()]);
      setTransactions(nextTransactions);
      setTransfers(nextTransfers);
      setToast("Transfer dan biaya admin berhasil dihapus.");
    } catch {
      setToast("Transfer gagal dihapus; data saldo tidak diubah.");
    }
  }

  function openRecurringRule(rule?: RecurringRule) {
    if (wallets.length === 0) {
      setView("wallets");
      setToast("Tambahkan dompet sebelum membuat transaksi berulang.");
      return;
    }
    const type = rule?.type ?? recurringType;
    setEditingRecurringRule(rule ?? null);
    setRecurringWallet(rule?.walletId ?? wallets[0].id);
    setRecurringType(type);
    setRecurringAmount(rule ? String(rule.amount) : "");
    setRecurringCategory(
      rule?.categoryId ?? categories.find((category) => category.type === type)?.id ?? "",
    );
    setRecurringNote(rule?.note ?? "");
    setRecurringFrequency(rule?.frequency ?? "monthly");
    setRecurringStartDate(rule?.startDate ?? getTokyoDateString());
    setRecurringEndDate(rule?.endDate ?? "");
    setModal("recurring");
  }

  async function saveRecurringRule(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(recurringAmount);
    const category = categories.find((item) =>
      item.id === recurringCategory && item.type === recurringType,
    );
    if (
      !wallets.some((wallet) => wallet.id === recurringWallet) ||
      !category ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !isDateString(recurringStartDate) ||
      (recurringEndDate && (!isDateString(recurringEndDate) || recurringEndDate < recurringStartDate))
    ) {
      setToast("Periksa dompet, kategori, nominal, dan rentang tanggal aturan.");
      return;
    }
    const now = new Date().toISOString();
    const rule: RecurringRule = {
      id: editingRecurringRule?.id ?? makeId(),
      walletId: recurringWallet,
      type: recurringType,
      amount,
      categoryId: recurringCategory,
      note: recurringNote.trim() || undefined,
      frequency: recurringFrequency,
      startDate: recurringStartDate,
      endDate: recurringEndDate || undefined,
      dayOfMonth: Number(recurringStartDate.slice(-2)),
      active: editingRecurringRule?.active ?? true,
      lastGeneratedDate: editingRecurringRule?.lastGeneratedDate,
      createdAt: editingRecurringRule?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await putRecurringRule(rule);
      setRecurringRules(await getRecurringRules());
      setModal(null);
      setEditingRecurringRule(null);
      setToast(editingRecurringRule ? "Aturan berulang berhasil diperbarui." : "Aturan berulang berhasil dibuat.");
    } catch {
      setToast("Aturan berulang gagal disimpan.");
    }
  }

  async function toggleRecurringRule(rule: RecurringRule) {
    try {
      const updated = { ...rule, active: !rule.active, updatedAt: new Date().toISOString() };
      await putRecurringRule(updated);
      setRecurringRules(await getRecurringRules());
      setToast(updated.active ? "Aturan berulang dilanjutkan." : "Aturan berulang dijeda.");
    } catch {
      setToast("Status aturan berulang gagal diperbarui.");
    }
  }

  async function removeRecurringRule(rule: RecurringRule) {
    if (!window.confirm("Hapus aturan dan draf tertunda? Transaksi yang sudah disetujui tetap tersimpan.")) return;
    try {
      await deleteRecurringRule(rule.id);
      const [nextRules, nextDrafts] = await Promise.all([getRecurringRules(), getRecurringDrafts()]);
      setRecurringRules(nextRules);
      setRecurringDrafts(nextDrafts);
      setToast("Aturan dihapus; transaksi yang telah disetujui tetap ada.");
    } catch {
      setToast("Aturan berulang gagal dihapus.");
    }
  }

  async function approveDraft(draft: RecurringDraft) {
    const nextTransactionList = [...transactions];
    try {
      const transaction = await approveRecurringDraft(draft.id);
      if (!transaction) {
        setToast("Draf ini sudah diproses.");
        setRecurringDrafts(await getRecurringDrafts());
        return;
      }
      nextTransactionList.push(transaction);
      const [nextTransactions, nextDrafts] = await Promise.all([
        getTransactions(),
        getRecurringDrafts(),
      ]);
      setTransactions(nextTransactions);
      setRecurringDrafts(nextDrafts);
      try {
        const alerts = await reportBudgetThresholds(transactions, nextTransactionList, transaction);
        setToast(alerts.length ? `Peringatan anggaran: ${alerts.join("; ")}.` : "Transaksi berulang disetujui.");
      } catch {
        setToast("Transaksi disetujui, tetapi peringatan anggaran gagal diperbarui.");
      }
    } catch {
      setToast("Draf gagal disetujui; data lokal tidak berubah.");
    }
  }

  async function skipDraft(draft: RecurringDraft) {
    try {
      await discardRecurringDraft(draft.id);
      setRecurringDrafts(await getRecurringDrafts());
      setToast("Draf dilewati; aturan berikutnya tetap berjalan.");
    } catch {
      setToast("Draf gagal dihapus.");
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
    setBudgetAlertThresholds(budget?.alertThresholds ?? [...BUDGET_ALERT_THRESHOLDS]);
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
      alertThresholds: budgetAlertThresholds,
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
        budgets.some((budget) => budget.categoryId === editingCategory.id) ||
        recurringRules.some((rule) => rule.categoryId === editingCategory.id));
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
      budgets.some((budget) => budget.categoryId === category.id) ||
      recurringRules.some((rule) => rule.categoryId === category.id)
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

  async function saveManualRate(event: React.FormEvent) {
    event.preventDefault();
    const rateScaled = parseRateInput(manualRateInput);
    if (rateScaled === null) {
      setToast("Masukkan kurs positif dengan maksimal empat angka desimal.");
      return;
    }
    const now = new Date();
    const createdAt = now.toISOString();
    const date = getTokyoDateString(now);
    const historyRecord: ExchangeRateHistoryRecord = {
      id: `${date}:manual`,
      date,
      rateScaled,
      source: "manual",
      createdAt,
    };
    const nextRate: ExchangeRateCache = {
      id: "JPY_IDR",
      base: "JPY",
      quote: "IDR",
      rate: rateFromScaled(rateScaled),
      source: "manual",
      fetchedAt: createdAt,
      cachedAt: createdAt,
    };
    try {
      await putExchangeRate(nextRate, historyRecord);
      setRate(nextRate);
      setRateHistory(await getExchangeRateHistory());
      setToast("Kurs manual berhasil disimpan.");
    } catch {
      setToast("Kurs manual gagal disimpan.");
    }
  }

  const fetchRate = useCallback(async (force = false) => {
    if (!force && rate?.source === "manual") return;
    if (!force && rate) {
      const age = Date.now() - new Date(rate.cachedAt).getTime();
      if (age >= 0 && age < 15 * 60 * 1000) return;
    }
    try {
      const response = await fetch("/api/exchange-rate", { cache: "no-store" });
      if (!response.ok) throw new Error("Rate provider request failed");
      const parsed = exchangeRateCacheSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Rate provider returned an invalid response");
      const rateScaled = Math.round(parsed.data.rate * 10_000);
      if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) {
        throw new Error("Rate provider returned an unsupported precision");
      }
      const data = { ...parsed.data, rate: rateFromScaled(rateScaled) };
      const date = getTokyoDateString(new Date(data.fetchedAt));
      const historyRecord: ExchangeRateHistoryRecord = {
        id: `${date}:api`,
        date,
        rateScaled,
        source: "api",
        provider: data.source,
        createdAt: data.fetchedAt,
      };
      await putExchangeRate(data, historyRecord);
      setRateHistory(await getExchangeRateHistory());
      setRate(data);
      setToast("Kurs berhasil diperbarui");
    } catch {
      try {
        const [history, cached] = await Promise.all([
          getExchangeRateHistory(),
          getExchangeRate(),
        ]);
        setRateHistory(history);
        const manual = history
          .filter((entry) => entry.source === "manual")
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
        const fallback = manual
          ? {
              id: "JPY_IDR" as const,
              base: "JPY" as const,
              quote: "IDR" as const,
              rate: rateFromScaled(manual.rateScaled),
              source: "manual",
              fetchedAt: manual.createdAt,
              cachedAt: manual.createdAt,
            }
          : cached;
        setRate(fallback ?? null);
        setToast(
          fallback
            ? manual ? "Pembaruan gagal; memakai kurs manual." : "Pembaruan gagal; memakai kurs tersimpan."
            : "Kurs otomatis tidak tersedia. Simpan kurs manual untuk estimasi.",
        );
      } catch {
        setToast("Pembaruan kurs gagal dan cache lokal tidak dapat dibaca.");
      }
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
      schemaVersion: 8,
      exportedAt,
      app: "Cuanku",
      wallets,
      transactions,
      categories,
      budgets,
      exchangeRateHistory: rateHistory,
      transfers,
      recurringRules,
      recurringDrafts,
      preferences: {
        theme,
        backupReminderDays,
        displayCurrency,
        showEquivalentInReports,
      },
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
      [
        ...visibleTransactions.map((transaction) => ({
        date: transaction.date.slice(0, 10),
        wallet: walletNameFor(transaction.walletId),
        currency: wallets.find((wallet) => wallet.id === transaction.walletId)?.currency ?? "",
        type: transaction.type === "income" ? "Pemasukan" : "Pengeluaran",
        category: categoryName(transaction.categoryId),
        amount: transaction.amount,
        note: transaction.note,
        })),
        ...visibleTransfers.map((transfer) => {
          const from = wallets.find((wallet) => wallet.id === transfer.fromWalletId);
          const to = wallets.find((wallet) => wallet.id === transfer.toWalletId);
          return {
            date: transfer.date,
            wallet: `${from?.name ?? "Dompet"} → ${to?.name ?? "Dompet"}`,
            currency: `${from?.currency ?? ""} → ${to?.currency ?? ""}`,
            type: "Transfer",
            category: transfer.kind === "conversion" ? "Konversi mata uang" : "Transfer antar-dompet",
            amount: transfer.fromAmount,
            note: `${transfer.toAmount} ${to?.currency ?? ""}${transfer.feeAmount ? ` · biaya ${transfer.feeAmount} ${from?.currency ?? ""}` : ""}${transfer.note ? ` · ${transfer.note}` : ""}`,
          };
        }),
      ],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cuanku-transaksi-${getTokyoDateString()}.csv`;
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

  function activateServiceWorkerUpdate() {
    if (modal) {
      setToast("Simpan atau tutup form sebelum memuat versi baru.");
      return;
    }
    const waitingWorker = serviceWorkerRegistrationRef.current?.waiting;
    if (!waitingWorker || !("serviceWorker" in navigator)) {
      setUpdateAvailable(false);
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
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
        exchangeRateHistory: backup.exchangeRateHistory,
        transfers: backup.transfers,
        recurringRules: backup.recurringRules,
        recurringDrafts: backup.recurringDrafts,
        lastBackupAt: backup.exportedAt,
        backupReminderDays: backup.preferences?.backupReminderDays,
      });
      await refreshWallets();
      await refreshTransactions();
      await refreshBudgets();
      setCategories(backup.categories);
      setRateHistory(backup.exchangeRateHistory);
      setTransfers(backup.transfers);
      setRecurringRules(backup.recurringRules);
      setRecurringDrafts(backup.recurringDrafts);
      const importedRate = [...backup.exchangeRateHistory]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setRate(importedRate ? {
        id: "JPY_IDR",
        base: "JPY",
        quote: "IDR",
        rate: rateFromScaled(importedRate.rateScaled),
        source: importedRate.source === "api" ? importedRate.provider ?? "API" : "manual",
        fetchedAt: importedRate.createdAt,
        cachedAt: importedRate.createdAt,
      } : null);
      setLastBackupAt(backup.exportedAt);
      if (backup.preferences?.backupReminderDays) {
        setBackupReminderDays(backup.preferences.backupReminderDays);
      }
      if (backup.preferences) {
        setTheme(backup.preferences.theme);
        setDisplayCurrency(backup.preferences.displayCurrency ?? "IDR");
        setShowEquivalentInReports(backup.preferences.showEquivalentInReports ?? false);
      }
      const manualRate = backup.exchangeRateHistory
        .filter((entry) => entry.source === "manual")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setManualRateInput(manualRate ? rateFromScaled(manualRate.rateScaled).toFixed(4) : "");
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
      exchangeRateHistory: [],
      transfers: [],
      recurringRules: [],
      recurringDrafts: [],
      lastBackupAt: null,
    });
    await refreshWallets();
    await refreshTransactions();
    await refreshBudgets();
    setCategories(DEFAULT_CATEGORIES);
    setRate(null);
    setRateHistory([]);
    setTransfers([]);
    setRecurringRules([]);
    setRecurringDrafts([]);
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
  const sortedTransfers = [...transfers].sort((a, b) => b.date.localeCompare(a.date));
  const normalizedTransactionSearch = transactionSearch.trim().toLocaleLowerCase();
  const visibleTransactions = sortedTransactions.filter((transaction) => {
    const wallet = wallets.find((item) => item.id === transaction.walletId);
    const date = transaction.date.slice(0, 10);
    const matchesType = transactionTypeFilter === "all" ||
      (transactionTypeFilter !== "transfer" && transaction.type === transactionTypeFilter);
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
  const visibleTransfers = sortedTransfers.filter((transfer) => {
    const fromWallet = wallets.find((wallet) => wallet.id === transfer.fromWalletId);
    const toWallet = wallets.find((wallet) => wallet.id === transfer.toWalletId);
    const date = transfer.date;
    const matchesType = transactionTypeFilter === "all" || transactionTypeFilter === "transfer";
    const matchesCurrency = transactionCurrencyFilter === "all" ||
      fromWallet?.currency === transactionCurrencyFilter ||
      toWallet?.currency === transactionCurrencyFilter;
    const matchesFrom = !transactionFromFilter || date >= transactionFromFilter;
    const matchesTo = !transactionToFilter || date <= transactionToFilter;
    const matchesWallet = transactionWalletFilter === "all" ||
      transfer.fromWalletId === transactionWalletFilter ||
      transfer.toWalletId === transactionWalletFilter;
    const matchesCategory = transactionCategoryFilter === "all";
    const matchesSearch = !normalizedTransactionSearch ||
      (transfer.note?.toLocaleLowerCase().includes(normalizedTransactionSearch) ?? false);
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
  const transferFromWalletRecord = wallets.find((wallet) => wallet.id === transferFromWallet);
  const transferToWalletRecord = wallets.find((wallet) => wallet.id === transferToWallet);
  const transferAmountValue = Number(transferFromAmount);
  const transferRateScaled = parseRateInput(transferRateInput);
  let transferPreview: { amount: number; marketDifference: number | null } | null = null;
  if (
    transferFromWalletRecord &&
    transferToWalletRecord &&
    transferFromWalletRecord.currency !== transferToWalletRecord.currency &&
    Number.isSafeInteger(transferAmountValue) &&
    transferAmountValue > 0 &&
    transferRateScaled !== null
  ) {
    try {
      const amount = convertAmount(
        transferAmountValue,
        transferFromWalletRecord.currency,
        transferToWalletRecord.currency,
        transferRateScaled,
      );
      const marketDifference = rate
        ? amount - convertAmount(
            transferAmountValue,
            transferFromWalletRecord.currency,
            transferToWalletRecord.currency,
            Math.round(rate.rate * 10_000),
          )
        : null;
      transferPreview = { amount, marketDifference };
    } catch {
      transferPreview = null;
    }
  }

  const currentServiceWorkerStatus = serviceWorkerSupported ? serviceWorkerStatus : "unsupported";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Beranda Cuanku">
          <span className="brand-mark"><CatMascot view="dashboard" size={34} /></span>
          <span>cuanku</span>
        </button>
        <nav className="nav-list" aria-label="Navigasi utama">
          <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={18} />} label="Ringkasan" onClick={() => setView("dashboard")} />
          <NavButton active={view === "transactions"} icon={<ReceiptText size={18} />} label="Transaksi" onClick={() => setView("transactions")} />
          <NavButton className="mobile-more-item" active={view === "wallets"} icon={<WalletCards size={18} />} label="Dompet" onClick={() => setView("wallets")} />
          <NavButton active={view === "budgets"} icon={<ChartPie size={18} />} label="Anggaran" onClick={() => setView("budgets")} />
          <NavButton active={view === "reports"} icon={<Landmark size={18} />} label="Laporan" onClick={() => setView("reports")} />
          <NavButton className="mobile-more-item" active={view === "transfers"} icon={<ArrowLeftRight size={18} />} label="Transfer" onClick={() => setView("transfers")} />
          <NavButton className="mobile-more-item" active={view === "recurring"} icon={<RefreshCw size={18} />} label="Berulang" onClick={() => setView("recurring")} />
          <NavButton className="mobile-more-item" active={view === "backup"} icon={<Download size={18} />} label="Backup" onClick={() => setView("backup")} />
          <NavButton className="mobile-more-item" active={view === "settings"} icon={<Settings size={18} />} label="Pengaturan" onClick={() => setView("settings")} />
          <div className={`mobile-more${["wallets", "transfers", "recurring", "backup", "settings"].includes(view) ? " active" : ""}`} ref={moreMenuRef}>
            <button
              className={`nav-item${["wallets", "transfers", "recurring", "backup", "settings"].includes(view) ? " active" : ""}`}
              aria-expanded={moreOpen}
              aria-controls="mobile-more-menu"
              aria-label="Lainnya"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreHorizontal size={18} /><span>Lainnya</span>
            </button>
            {moreOpen && (
              <nav className="more-menu" id="mobile-more-menu" aria-label="Menu lainnya">
                <button onClick={() => selectMoreView("wallets")}><WalletCards size={18} /> Dompet</button>
                <button onClick={() => selectMoreView("transfers")}><ArrowLeftRight size={18} /> Transfer</button>
                <button onClick={() => selectMoreView("recurring")}><RefreshCw size={18} /> Transaksi berulang</button>
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
              transfers: "Transfer antar-dompet",
              recurring: "Transaksi berulang",
            }[view]}</h1>
          </div>
          <div className="mascot-companion" aria-label={`Maskot Cuanku sedang ${mascotMood(view)}`}>
            <CatMascot key={view} view={view} size={76} />
            <span>{mascotCaption(view)}</span>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="primary-button add-transaction-button" aria-label="Tambah transaksi" onClick={() => openTransaction()}><Plus size={16} /> Tambah transaksi</button>
          </div>
        </header>

        {!isOnline && (
          <div className="pwa-status offline" role="status">
            Offline — data yang tersimpan di perangkat tetap dapat digunakan. Kurs otomatis memerlukan koneksi.
          </div>
        )}
        {isOnline && currentServiceWorkerStatus === "error" && (
          <div className="pwa-status" role="status">
            Mode offline belum aktif. Muat ulang halaman saat online untuk mencoba kembali.
          </div>
        )}
        {isOnline && currentServiceWorkerStatus === "unsupported" && (
          <div className="pwa-status" role="status">
            Browser ini tidak mendukung mode aplikasi offline.
          </div>
        )}
        {updateAvailable && (
          <div className="pwa-status update" role="status">
            <span>
              Versi Cuanku yang lebih baru tersedia.
              {modal && " Simpan atau tutup form yang sedang terbuka sebelum memperbarui."}
            </span>
            <button className="primary-button" disabled={Boolean(modal)} onClick={activateServiceWorkerUpdate}>
              Muat ulang untuk memperbarui
            </button>
          </div>
        )}

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
                    <button className="primary-button" onClick={() => void exportBackup()}><Download size={16} /> Backup sekarang</button>
                  </aside>
                )}
                {dashboardBudgetAlerts.length > 0 && (
                  <aside className="budget-alert-banner" role="status">
                    <strong>Perhatian anggaran bulan ini</strong>
                    <ul>
                      {dashboardBudgetAlerts.map(({ budget, level }) => (
                        <li key={budget.id}>
                          {budgetCategoryName(budget.categoryId)} mencapai {level}% ({budget.month}).
                        </li>
                      ))}
                    </ul>
                  </aside>
                )}
                {recurringDrafts.length > 0 && (
                  <aside className="recurring-draft-banner" role="status">
                    <strong>{recurringDrafts.length} transaksi berulang menunggu konfirmasi.</strong>
                    <button className="text-button" onClick={() => setView("recurring")}>Tinjau draf</button>
                  </aside>
                )}
                <div className="balance-grid">
                  <article className="balance-card featured">
                    <span>Saldo JPY</span>
                    <div className="balance-value">
                      <strong>{formatMoney(balances.JPY, "JPY")}</strong>
                      <span className="currency-code">JPY</span>
                    </div>
                    <small>{wallets.filter((wallet) => wallet.currency === "JPY").length} dompet</small>
                    <div className="monthly-flow">
                      <div><span>Pemasukan bulan ini</span><strong>+{formatMoney(monthlyFlows.JPY.income, "JPY")}</strong></div>
                      <div><span>Pengeluaran bulan ini</span><strong>-{formatMoney(monthlyFlows.JPY.expense, "JPY")}</strong></div>
                    </div>
                  </article>
                  <article className="balance-card">
                    <span>Saldo IDR</span>
                    <div className="balance-value">
                      <strong>{formatMoney(balances.IDR, "IDR")}</strong>
                      <span className="currency-code">IDR</span>
                    </div>
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
                        <div className="balance-value">
                          <strong>
                            {formatMoney(
                              displayCurrency === "IDR"
                                ? calculateEstimatedTotalInIdr(balances, rate.rate)
                                : calculateEstimatedTotalInJpy(balances, rate.rate),
                              displayCurrency,
                            )}
                          </strong>
                          <span className="currency-code">{displayCurrency}</span>
                        </div>
                        <small>
                          Estimasi · 1 JPY = {rate.rate.toFixed(4)} IDR · {rate.source === "manual" ? "kurs manual" : "kurs otomatis"} ·{" "}
                          {new Date(rate.cachedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Tokyo" })}
                        </small>
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
                {sortedTransactions.length || transfers.length ? (
                  <TransactionList transactions={sortedTransactions} transfers={transfers} limit={8} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onEdit={openTransaction} onDelete={removeTransaction} onEditTransfer={openTransfer} onDeleteTransfer={removeTransfer} />
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Catat transaksi pertama" onAction={() => openTransaction()} />}
              </section>
            )}

            {view === "transactions" && (
              <section>
                <div className="transaction-filters" aria-label="Filter transaksi">
                  <label>Jenis<select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value as "all" | TransactionType | "transfer")}><option value="all">Semua jenis</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option><option value="transfer">Transfer</option></select></label>
                  <label>Mata uang<select value={transactionCurrencyFilter} onChange={(event) => setTransactionCurrencyFilter(event.target.value as "all" | Currency)}><option value="all">Semua mata uang</option><option value="JPY">JPY</option><option value="IDR">IDR</option></select></label>
                  <label>Dompet<select value={transactionWalletFilter} onChange={(event) => setTransactionWalletFilter(event.target.value)}><option value="all">Semua dompet</option>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select></label>
                  <label>Kategori<select value={transactionCategoryFilter} onChange={(event) => setTransactionCategoryFilter(event.target.value)}><option value="all">Semua kategori</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name} · {category.type === "income" ? "Pemasukan" : "Pengeluaran"}</option>)}</select></label>
                  <label>Dari tanggal<input type="date" value={transactionFromFilter} onChange={(event) => setTransactionFromFilter(event.target.value)} /></label>
                  <label>Sampai tanggal<input type="date" value={transactionToFilter} onChange={(event) => setTransactionToFilter(event.target.value)} /></label>
                  <label className="transaction-search">Cari catatan<input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Kata kunci..." /></label>
                  <div className="transaction-filter-actions">
                    <button className="text-button" onClick={resetTransactionFilters}>Reset filter</button>
                    <button className="secondary-button" disabled={!visibleTransactions.length && !visibleTransfers.length} onClick={exportTransactionsCsv}><Download size={16} /> Ekspor CSV</button>
                  </div>
                </div>
                {visibleTransactions.length || visibleTransfers.length ? (
                  <TransactionList transactions={visibleTransactions} transfers={visibleTransfers} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onEdit={openTransaction} onDelete={removeTransaction} onEditTransfer={openTransfer} onDeleteTransfer={removeTransfer} />
                ) : transactions.length || transfers.length ? (
                  <div className="empty-state"><div className="empty-icon"><ReceiptText /></div><h2>Tidak ada transaksi yang cocok</h2><button className="text-button" onClick={resetTransactionFilters}>Hapus filter</button></div>
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Tambah transaksi" onAction={() => openTransaction()} />}
              </section>
            )}

            {view === "transfers" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Tidak dihitung sebagai pemasukan atau pengeluaran</p><h2>Transfer dan konversi</h2></div>
                  <div className="section-actions">
                    <button className="secondary-button" onClick={() => openTransfer(undefined, "conversion")}><ArrowLeftRight size={16} /> Konversi mata uang</button>
                    <button className="primary-button" onClick={() => openTransfer(undefined, "transfer")}><Plus size={16} /> Transfer baru</button>
                  </div>
                </div>
                {sortedTransfers.length ? (
                  <TransactionList
                    transactions={[]}
                    transfers={sortedTransfers}
                    wallets={wallets}
                    categoryName={categoryName}
                    walletNameFor={walletNameFor}
                    onEdit={openTransaction}
                    onDelete={removeTransaction}
                    onEditTransfer={openTransfer}
                    onDeleteTransfer={removeTransfer}
                  />
                ) : (
                  <EmptyState icon={<ArrowLeftRight />} title="Belum ada transfer" action="Buat transfer pertama" onAction={() => openTransfer()} />
                )}
              </section>
            )}

            {view === "recurring" && (
              <section>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Setiap jadwal menghasilkan draf</p>
                    <h2>Aturan transaksi berulang</h2>
                  </div>
                  <button className="primary-button" onClick={() => openRecurringRule()}><Plus size={16} /> Aturan baru</button>
                </div>
                <p className="section-note">
                  Transaksi yang jatuh tempo tidak langsung mengubah saldo. Tinjau dan setujui setiap draf terlebih dahulu.
                </p>
                {recurringDrafts.length > 0 && (
                  <div className="recurring-section">
                    <h3>Draf menunggu konfirmasi ({recurringDrafts.length})</h3>
                    <div className="recurring-draft-list">
                      {[...recurringDrafts]
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((draft) => {
                          const wallet = wallets.find((item) => item.id === draft.walletId);
                          return (
                            <article className="recurring-draft-row" key={draft.id}>
                              <div>
                                <strong>{categoryName(draft.categoryId)} · {walletNameFor(draft.walletId)}</strong>
                                <span>{draft.date} · {draft.type === "income" ? "Pemasukan" : "Pengeluaran"}</span>
                                {draft.note && <small>{draft.note}</small>}
                              </div>
                              <strong className={draft.type === "income" ? "income" : "expense"}>
                                {draft.type === "income" ? "+" : "-"}{formatMoney(draft.amount, wallet?.currency ?? "IDR")}
                              </strong>
                              <div className="row-actions">
                                <button className="primary-button" onClick={() => void approveDraft(draft)}>Setujui</button>
                                <button className="secondary-button" onClick={() => void skipDraft(draft)}>Lewati</button>
                              </div>
                            </article>
                          );
                        })}
                    </div>
                  </div>
                )}
                {recurringRules.length > 0 ? (
                  <div className="recurring-rule-list">
                    {recurringRules.map((rule) => {
                      const wallet = wallets.find((item) => item.id === rule.walletId);
                      const frequency = rule.frequency === "weekly"
                        ? "Mingguan"
                        : rule.frequency === "monthly" ? "Bulanan" : "Tahunan";
                      return (
                        <article className={`recurring-rule-row${rule.active ? "" : " paused"}`} key={rule.id}>
                          <div>
                            <strong>{categoryName(rule.categoryId)} · {walletNameFor(rule.walletId)}</strong>
                            <span>{frequency} · mulai {rule.startDate}{rule.endDate ? ` sampai ${rule.endDate}` : ""}</span>
                            <small>{rule.active ? "Aktif" : "Dijeda"}{rule.lastGeneratedDate ? ` · terakhir dibuat ${rule.lastGeneratedDate}` : ""}</small>
                          </div>
                          <strong className={rule.type === "income" ? "income" : "expense"}>
                            {rule.type === "income" ? "+" : "-"}{formatMoney(rule.amount, wallet?.currency ?? "IDR")}
                          </strong>
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => openRecurringRule(rule)} aria-label="Edit aturan berulang"><Pencil size={16} /></button>
                            <button className="secondary-button" onClick={() => void toggleRecurringRule(rule)}>{rule.active ? "Jeda" : "Lanjutkan"}</button>
                            <button className="icon-button danger" onClick={() => void removeRecurringRule(rule)} aria-label="Hapus aturan berulang"><Trash2 size={16} /></button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : recurringDrafts.length === 0 ? (
                  <EmptyState icon={<RefreshCw />} title="Belum ada aturan berulang" action="Buat aturan pertama" onAction={() => openRecurringRule()} />
                ) : null}
              </section>
            )}

            {view === "wallets" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Pengelolaan</p><h2>Dompet Anda</h2></div>
                  <button className="primary-button" onClick={() => openWallet()}><Plus size={16} /> Dompet baru</button>
                </div>
                {wallets.length ? (
                  <div className="wallet-grid">
                    {wallets.map((wallet) => (
                      <article className="wallet-card" key={wallet.id}>
                        <div className="wallet-icon"><WalletCards size={18} /></div>
                        <div className="wallet-main">
                          <span>{wallet.currency}</span>
                          <h3>{wallet.name}</h3>
                          {wallet.kind === "credit" ? (
                            <>
                              <strong>{formatMoney(calculateWalletBalance(wallet, domainTransactions, domainTransfers), wallet.currency)}</strong>
                              <small>{wallet.creditLimit
                                ? `Utang · Sisa limit ${formatMoney(Math.max(0, wallet.creditLimit - calculateWalletBalance(wallet, domainTransactions, domainTransfers)), wallet.currency)}`
                                : "Utang kartu kredit"}</small>
                              {(wallet.statementClosingDay || wallet.paymentDueDay) && (
                                <small>
                                  {wallet.statementClosingDay ? `Tutup ${wallet.statementClosingDay}` : ""}
                                  {wallet.statementClosingDay && wallet.paymentDueDay ? " · " : ""}
                                  {wallet.paymentDueDay ? `Jatuh tempo ${wallet.paymentDueDay}` : ""}
                                </small>
                              )}
                            </>
                          ) : (
                            <strong>{formatMoney(calculateCurrencyBalances([wallet], domainTransactions, domainTransfers)[wallet.currency], wallet.currency)}</strong>
                          )}
                        </div>
                        <div className="wallet-actions">
                          <button className="icon-button" onClick={() => openWallet(wallet)} aria-label={`Edit ${wallet.name}`}><Pencil size={16} /></button>
                          <button className="icon-button danger" onClick={() => removeWallet(wallet)} aria-label={`Hapus ${wallet.name}`}><Trash2 size={16} /></button>
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
                    <button className="primary-button" onClick={() => openBudget()}><Plus size={16} /> Anggaran baru</button>
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
                      const actualAlertLevel = getBudgetAlertLevel(spent, budget.amount);
                      const enabledThresholds = budget.alertThresholds ?? [...BUDGET_ALERT_THRESHOLDS];
                      const alertLevel = actualAlertLevel === null
                        ? null
                        : enabledThresholds.filter((threshold) => threshold <= actualAlertLevel).at(-1) ?? null;
                      return (
                        <article
                          className={`budget-card${isOver ? " over" : alertLevel === 100 ? " limit" : alertLevel === 80 ? " warning" : ""}`}
                          key={budget.id}
                        >
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
                            {isOver
                              ? "Melebihi anggaran"
                              : alertLevel === 100
                                ? "Batas anggaran 100% tercapai"
                                : alertLevel === 80
                                  ? "Mendekati batas"
                                  : "Sisa anggaran"}{" "}
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
                  <div className="report-heading-actions">
                    <label className="checkbox-option">
                      <input
                        type="checkbox"
                        disabled={!rate}
                        checked={showEquivalentInReports}
                        onChange={(event) => setShowEquivalentInReports(event.target.checked)}
                      />
                      Tampilkan setara
                    </label>
                    <label className="month-picker">Periode<input type="month" value={reportMonth} onChange={(event) => setReportMonth(/^\d{4}-\d{2}$/.test(event.target.value) ? event.target.value : currentMonth())} /></label>
                  </div>
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
                          {showEquivalentInReports && rate && (
                            <p className="report-equivalent">
                              Estimasi setara dalam {currency === "JPY" ? "IDR" : "JPY"}:{" "}
                              {formatMoney(
                                convertAmount(
                                  totals.income - totals.expense,
                                  currency,
                                  currency === "JPY" ? "IDR" : "JPY",
                                  Math.round(rate.rate * 10_000),
                                ),
                                currency === "JPY" ? "IDR" : "JPY",
                              )}
                              <small>1 JPY = {rate.rate.toFixed(4)} IDR · {new Date(rate.cachedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Tokyo" })}</small>
                            </p>
                          )}
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
                  <button className="primary-button" onClick={exportBackup}><Download size={16} /> Unduh JSON</button>
                </article>
                <article className="settings-card">
                  <h2>Import backup</h2>
                  <p>Data lama akan diganti atomik setelah file berhasil divalidasi.</p>
                  <label className="secondary-button">Pilih file JSON<input type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])} /></label>
                </article>
                <article className="settings-card danger-card">
                  <h2>Hapus seluruh data</h2>
                  <p>Tindakan ini menghapus semua dompet dan transaksi dari browser.</p>
                  <button className="danger-button" onClick={deleteAllData}><Trash2 size={16} /> Hapus data</button>
                </article>
              </section>
            )}

            {view === "settings" && (
              <section className="settings-grid">
                <article className="settings-card">
                  <h2>Aplikasi &amp; mode offline</h2>
                  <p>
                    Status: {currentServiceWorkerStatus === "ready"
                      ? "siap digunakan offline"
                      : currentServiceWorkerStatus === "checking"
                        ? "memeriksa dukungan browser"
                        : currentServiceWorkerStatus === "unsupported"
                          ? "service worker tidak didukung"
                          : "service worker gagal dimuat"}
                    . Data keuangan tetap disimpan di browser ini.
                  </p>
                  <strong>Pasang Cuanku</strong>
                  <ul className="install-guide">
                    <li>Android: buka menu browser, lalu pilih Pasang aplikasi atau Tambahkan ke layar utama.</li>
                    <li>iPhone/iPad: di Safari pilih Bagikan, lalu Tambahkan ke Layar Utama.</li>
                    <li>Desktop: gunakan ikon Pasang di bilah alamat browser yang mendukung PWA.</li>
                  </ul>
                </article>
                <article className="settings-card">
                  <h2>Tampilan</h2>
                  <p>Pilih tema aplikasi.</p>
                  <div className="theme-options">
                    {(["light", "dark"] as Preferences["theme"][]).map((option) => (
                      <button key={option} className={theme === option ? "selected" : ""} onClick={() => setTheme(option)}>
                        {option === "light" ? "Terang" : "Gelap"}
                      </button>
                    ))}
                  </div>
                </article>
                <article className="settings-card">
                  <h2>Preferensi estimasi</h2>
                  <p>Saldo JPY dan IDR tetap terpisah; pilihan ini hanya mengubah mata uang nilai gabungan.</p>
                  <label className="settings-select-label">Tampilkan estimasi dalam
                    <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value as Currency)}>
                      <option value="IDR">IDR — Rupiah</option>
                      <option value="JPY">JPY — Yen</option>
                    </select>
                  </label>
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={showEquivalentInReports}
                      onChange={(event) => setShowEquivalentInReports(event.target.checked)}
                    />
                    Tampilkan setara kurs di laporan
                  </label>
                </article>
                <article className="settings-card">
                  <h2>Kurs JPY ↔ IDR</h2>
                  <p>
                    {rate
                      ? `Kurs terpilih: 1 JPY = ${rate.rate.toFixed(4)} IDR · ${rate.source === "manual" ? "manual" : "otomatis"} · ${new Date(rate.cachedAt).toLocaleString("id-ID", { timeZone: "Asia/Tokyo" })}`
                      : "Belum ada kurs. Simpan kurs manual atau perbarui otomatis saat online."}
                  </p>
                  <form onSubmit={saveManualRate}>
                    <label>Kurs manual (1 JPY = berapa IDR)
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.0001"
                        step="0.0001"
                        value={manualRateInput}
                        onChange={(event) => setManualRateInput(event.target.value)}
                        placeholder="Contoh: 114.5000"
                      />
                    </label>
                    <button className="primary-button wide" type="submit">Simpan kurs manual</button>
                  </form>
                  <button className="secondary-button" onClick={() => void fetchRate(true)}>Perbarui otomatis</button>
                  {rateHistory.length > 0 && (
                    <div className="rate-history">
                      <strong>Riwayat kurs terbaru</strong>
                      <ul>
                        {[...rateHistory]
                          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
                          .slice(0, 5)
                          .map((entry) => (
                            <li key={entry.id}>
                              <span>{entry.date} · {entry.source === "manual" ? "Manual" : "API"}</span>
                              <strong>1 JPY = {rateFromScaled(entry.rateScaled).toFixed(4)} IDR</strong>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
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
                    <button className="primary-button" onClick={() => openCategory()}><Plus size={16} /> Kategori</button>
                  </div>
                  <div className="category-list">
                    {categories.map((category) => {
                      const Icon = CATEGORY_ICONS[category.icon ?? "tag"];
                      return (
                        <div className="category-row" key={category.id}>
                          <span className="category-icon"><Icon size={16} /></span>
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
                  : modal === "transfer" || modal === "conversion"
                  ? editingTransfer
                    ? transferKind === "conversion" ? "Edit konversi" : "Edit transfer"
                    : transferKind === "conversion" ? "Konversi mata uang" : "Transfer baru"
                  : modal === "recurring"
                  ? editingRecurringRule ? "Edit aturan berulang" : "Aturan berulang baru"
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
                <fieldset className="alert-threshold-options">
                  <legend>Peringatkan pada</legend>
                  {BUDGET_ALERT_THRESHOLDS.map((threshold) => (
                    <label key={threshold}>
                      <input
                        type="checkbox"
                        checked={budgetAlertThresholds.includes(threshold)}
                        onChange={(event) => setBudgetAlertThresholds((current) =>
                          event.target.checked
                            ? [...current, threshold].sort((a, b) => a - b)
                            : current.filter((value) => value !== threshold),
                        )}
                      />
                      {threshold}%
                    </label>
                  ))}
                </fieldset>
                <button className="primary-button wide" type="submit">{editingBudget ? "Simpan perubahan" : "Simpan anggaran"}</button>
              </form>
            ) : modal === "transfer" || modal === "conversion" ? (
              <form onSubmit={saveTransferRecord}>
                <label>Dompet asal<select value={transferFromWallet} onChange={(event) => setTransferFromWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                <label>Dompet tujuan<select value={transferToWallet} onChange={(event) => setTransferToWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                {transferToWalletRecord?.kind === "credit" && (
                  <p className="form-hint">Transfer ke kartu kredit dianggap sebagai pembayaran dan mengurangi utang kartu.</p>
                )}
                <label>{transferKind === "conversion" ? "Nominal sumber" : "Nominal yang dipindahkan"}<input type="number" min="1" step="1" value={transferFromAmount} onChange={(event) => setTransferFromAmount(event.target.value)} placeholder="0" /></label>
                <label>Biaya admin (mata uang dompet asal)<input type="number" min="0" step="1" value={transferFeeAmount} onChange={(event) => setTransferFeeAmount(event.target.value)} placeholder="0" /></label>
                {transferFromWalletRecord && transferToWalletRecord &&
                  transferFromWalletRecord.currency !== transferToWalletRecord.currency && (
                    <>
                      <label>Kurs (1 JPY = IDR)
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.0001"
                          step="0.0001"
                          value={transferRateInput}
                          onChange={(event) => setTransferRateInput(event.target.value)}
                          placeholder="Masukkan kurs"
                        />
                      </label>
                      {transferPreview && (
                        <p className="transfer-preview">
                          Diterima sekitar {formatMoney(transferPreview.amount, transferToWalletRecord.currency)}.
                          {transferPreview.marketDifference !== null &&
                            ` Selisih dari kurs pasar: ${transferPreview.marketDifference >= 0 ? "+" : "−"}${formatMoney(Math.abs(transferPreview.marketDifference), transferToWalletRecord.currency)}.`}
                        </p>
                      )}
                    </>
                  )}
                <label>Tanggal<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label>
                <label>Catatan (opsional)<input value={transferNote} onChange={(event) => setTransferNote(event.target.value)} placeholder="Tambahkan keterangan" /></label>
                <button className="primary-button wide" type="submit">{editingTransfer ? "Simpan perubahan" : transferKind === "conversion" ? "Simpan konversi" : "Simpan transfer"}</button>
              </form>
            ) : modal === "recurring" ? (
              <form onSubmit={saveRecurringRule}>
                <div className="segmented">
                  <button type="button" className={recurringType === "income" ? "selected" : ""} onClick={() => { setRecurringType("income"); setRecurringCategory(categories.find((item) => item.type === "income")?.id ?? ""); }}>Pemasukan</button>
                  <button type="button" className={recurringType === "expense" ? "selected" : ""} onClick={() => { setRecurringType("expense"); setRecurringCategory(categories.find((item) => item.type === "expense")?.id ?? ""); }}>Pengeluaran</button>
                </div>
                <label>Dompet<select value={recurringWallet} onChange={(event) => setRecurringWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                <label>Nominal<input type="number" min="1" step="1" value={recurringAmount} onChange={(event) => setRecurringAmount(event.target.value)} placeholder="0" /></label>
                <label>Kategori<select value={recurringCategory} onChange={(event) => setRecurringCategory(event.target.value)}>{categories.filter((item) => item.type === recurringType).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label>Frekuensi<select value={recurringFrequency} onChange={(event) => setRecurringFrequency(event.target.value as RecurringRule["frequency"])}><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select></label>
                <label>Mulai tanggal<input type="date" value={recurringStartDate} onChange={(event) => setRecurringStartDate(event.target.value)} /></label>
                <label>Sampai tanggal (opsional)<input type="date" value={recurringEndDate} onChange={(event) => setRecurringEndDate(event.target.value)} /></label>
                {recurringFrequency === "monthly" && <p className="form-hint">Tanggal mengikuti tanggal mulai; tanggal 29–31 menyesuaikan ke hari terakhir pada bulan yang lebih pendek.</p>}
                <label>Catatan (opsional)<input value={recurringNote} onChange={(event) => setRecurringNote(event.target.value)} placeholder="Tambahkan keterangan" /></label>
                <button className="primary-button wide" type="submit">{editingRecurringRule ? "Simpan perubahan" : "Simpan aturan"}</button>
              </form>
            ) : modal === "wallet" ? (
              <form onSubmit={saveWallet}>
                <label>Nama dompet<input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Contoh: Tabungan" /></label>
                <label>Mata uang<select value={editingWallet?.currency ?? walletCurrency} disabled={Boolean(editingWallet)} onChange={(event) => setWalletCurrency(event.target.value as Currency)}><option value="JPY">JPY — Yen</option><option value="IDR">IDR — Rupiah</option></select></label>
                <label>Jenis dompet<select value={editingWallet?.kind ?? walletKind} disabled={Boolean(editingWallet)} onChange={(event) => setWalletKind(event.target.value as "cash" | "credit")}><option value="cash">Dompet / rekening</option><option value="credit">Kartu kredit</option></select></label>
                <label>{(editingWallet?.kind ?? walletKind) === "credit" ? "Utang awal kartu" : "Saldo awal"}<input type="number" min="0" step="1" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0" /></label>
                {(editingWallet?.kind ?? walletKind) === "credit" && (
                  <>
                    <label>Limit kartu (opsional)<input type="number" min="1" step="1" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} placeholder="0" /></label>
                    <label>Tanggal tutup tagihan (1–31)<input type="number" min="1" max="31" step="1" value={statementClosingDay} onChange={(event) => setStatementClosingDay(event.target.value)} placeholder="Contoh: 20" /></label>
                    <label>Tanggal jatuh tempo (1–31)<input type="number" min="1" max="31" step="1" value={paymentDueDay} onChange={(event) => setPaymentDueDay(event.target.value)} placeholder="Contoh: 5" /></label>
                  </>
                )}
                <button className="primary-button wide" type="submit">{editingWallet ? "Simpan perubahan" : "Simpan dompet"}</button>
              </form>
            ) : (
              <form onSubmit={saveTransaction}>
                <div className="segmented">
                  <button type="button" className={transactionType === "income" ? "selected" : ""} onClick={() => { setTransactionType("income"); setTransactionCategory(categories.find((item) => item.type === "income")?.id ?? ""); }}>Pemasukan</button>
                  <button type="button" className={transactionType === "expense" ? "selected" : ""} onClick={() => { setTransactionType("expense"); setTransactionCategory(categories.find((item) => item.type === "expense")?.id ?? ""); }}>Pengeluaran</button>
                </div>
                <label>Dompet<select value={transactionWallet} onChange={(event) => setTransactionWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                {wallets.find((wallet) => wallet.id === transactionWallet)?.kind === "credit" && (
                  <p className="form-hint">Pengeluaran menambah utang kartu. Pemasukan dapat dipakai untuk refund atau koreksi tagihan.</p>
                )}
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

function mascotMood(view: View) {
  const moods: Record<View, string> = {
    dashboard: "santai",
    transactions: "mencatat",
    wallets: "merawat dompet",
    budgets: "jaga anggaran",
    reports: "menganalisis",
    backup: "siap berjaga",
    settings: "mengatur",
    transfers: "mengantar uang",
    recurring: "menunggu jadwal",
  };
  return moods[view];
}

function mascotCaption(view: View) {
  const captions: Record<View, string> = {
    dashboard: "Hari ini terlihat aman",
    transactions: "Catatan rapi",
    wallets: "Dompet aman",
    budgets: "Tetap dalam batas",
    reports: "Sudah dihitung",
    backup: "Salinan aman",
    settings: "Semua nyaman",
    transfers: "Pergi dengan aman",
    recurring: "Jadwalku siap",
  };
  return captions[view];
}

function CatMascot({ view, size = 76 }: { view: View; size?: number }) {
  const surprised = ["transfers", "backup"].includes(view);
  const curious = ["reports", "settings"].includes(view);
  const smiling = ["dashboard", "wallets", "budgets"].includes(view);
  const sleepy = view === "recurring";

  return (
    <svg
      className={`cat-mascot cat-mascot-${view}`}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={`Maskot kucing Cuanku: ${mascotMood(view)}`}
    >
      <ellipse cx="64" cy="112" rx="37" ry="7" fill="#2A241F" opacity=".08" />
      <path d="M27 53 23 22l28 20c8-3 18-3 26 0l28-20-4 31c6 9 8 20 6 30-3 23-20 37-43 37S24 106 21 83c-2-11 1-22 6-30Z" fill="#EBAF72" />
      <path d="M23 22l28 20-15 6Z" fill="#F8D5AE" />
      <path d="M101 22 73 42l15 6Z" fill="#F8D5AE" />
      <path d="M40 58c8-8 40-8 48 0 10 10 12 28 7 43-5 17-18 25-33 25S34 118 29 101c-5-15-3-33 11-43Z" fill="#FFE0B7" />
      <path d="M45 50c9-5 29-5 38 0" fill="none" stroke="#C98246" strokeWidth="4" strokeLinecap="round" />
      {sleepy ? (
        <>
          <path d="M43 82c5 5 11 5 16 0" fill="none" stroke="#40372F" strokeWidth="4" strokeLinecap="round" />
          <path d="M69 82c5 5 11 5 16 0" fill="none" stroke="#40372F" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          {surprised ? (
            <>
              <circle cx="50" cy="82" r="7" fill="#40372F" />
              <circle cx="78" cy="82" r="7" fill="#40372F" />
              <circle cx="48" cy="80" r="2" fill="white" />
              <circle cx="76" cy="80" r="2" fill="white" />
            </>
          ) : (
            <>
              <ellipse cx="50" cy="82" rx={curious ? 4 : 5} ry={curious ? 8 : 7} fill="#40372F" />
              <ellipse cx="78" cy="82" rx={curious ? 4 : 5} ry={curious ? 8 : 7} fill="#40372F" />
              <circle cx="49" cy="80" r="1.5" fill="white" />
              <circle cx="77" cy="80" r="1.5" fill="white" />
            </>
          )}
        </>
      )}
      <path d="m64 91 7 5-7 5-7-5Z" fill="#D67578" />
      {surprised ? (
        <ellipse cx="64" cy="108" rx="7" ry="9" fill="#40372F" />
      ) : smiling ? (
        <path d="M64 101c-6 7-14 6-17 1m17-1c6 7 14 6 17 1" fill="none" stroke="#40372F" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d="M58 104c4 3 8 3 12 0" fill="none" stroke="#40372F" strokeWidth="2.5" strokeLinecap="round" />
      )}
      <path d="M34 94H16m19 8H12m80-8h20m-20 8h24" fill="none" stroke="#40372F" strokeWidth="2" strokeLinecap="round" />
      <g className="cat-paw">
        <circle cx="64" cy="112" r="12" fill="#4F8F7A" />
        <path d="M64 105v14m-7-7h14" fill="none" stroke="#FFF9F0" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
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
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><button className="primary-button" onClick={onAction}><Plus size={16} /> {action}</button></div>;
}

function TransactionList({
  transactions,
  transfers = [],
  limit,
  wallets,
  categoryName,
  walletNameFor,
  onEdit,
  onDelete,
  onEditTransfer,
  onDeleteTransfer,
}: {
  transactions: TransactionRecord[];
  transfers?: TransferRecord[];
  limit?: number;
  wallets: WalletRecord[];
  categoryName: (id: string) => string;
  walletNameFor: (id: string) => string;
  onEdit: (transaction: TransactionRecord) => void;
  onDelete: (transaction: TransactionRecord) => void;
  onEditTransfer: (transfer: TransferRecord) => void;
  onDeleteTransfer: (transfer: TransferRecord) => void;
}) {
  const entries = [
    ...transactions.map((transaction) => ({
      kind: "transaction" as const,
      date: transaction.date,
      id: transaction.id,
      transaction,
    })),
    ...transfers.map((transfer) => ({
      kind: "transfer" as const,
      date: transfer.date,
      id: transfer.id,
      transfer,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const visibleEntries = limit === undefined ? entries : entries.slice(0, limit);
  return (
    <div className="transaction-list">
      {visibleEntries.map((entry) => {
        if (entry.kind === "transfer") {
          const from = wallets.find((item) => item.id === entry.transfer.fromWalletId);
          const to = wallets.find((item) => item.id === entry.transfer.toWalletId);
          return (
            <article className="transaction-row transfer-activity" key={`transfer-${entry.transfer.id}`}>
              <div className="transaction-icon transfer"><ArrowLeftRight size={18} /></div>
              <div className="transaction-main">
                <h3>{entry.transfer.kind === "conversion" ? "Konversi mata uang" : "Transfer antar-dompet"}</h3>
                <p>
                  {walletNameFor(entry.transfer.fromWalletId)} → {walletNameFor(entry.transfer.toWalletId)} · {entry.transfer.date}
                  {entry.transfer.note ? ` · ${entry.transfer.note}` : ""}
                  {entry.transfer.feeAmount > 0
                    ? ` · biaya ${formatMoney(entry.transfer.feeAmount, from?.currency ?? "IDR")}`
                    : ""}
                </p>
              </div>
              <strong className="transfer-amount">
                −{formatMoney(entry.transfer.fromAmount, from?.currency ?? "IDR")} → +{formatMoney(entry.transfer.toAmount, to?.currency ?? "IDR")}
              </strong>
              <div className="row-actions">
                <button className="icon-button" onClick={() => onEditTransfer(entry.transfer)} aria-label={entry.transfer.kind === "conversion" ? "Edit konversi" : "Edit transfer"}><Pencil size={16} /></button>
                <button className="icon-button danger" onClick={() => onDeleteTransfer(entry.transfer)} aria-label={entry.transfer.kind === "conversion" ? "Hapus konversi" : "Hapus transfer"}><Trash2 size={16} /></button>
              </div>
            </article>
          );
        }

        const transaction = entry.transaction;
        const wallet = wallets.find((item) => item.id === transaction.walletId);
        const currency = wallet?.currency ?? "IDR";
        const isTransferFee = Boolean(transaction.transferId);
        return (
          <article className="transaction-row" key={`transaction-${transaction.id}`}>
            <div className={transaction.type === "income" ? "transaction-icon income" : "transaction-icon expense"}>
              {transaction.type === "income" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
            </div>
            <div className="transaction-main">
              <h3>{categoryName(transaction.categoryId)}{transaction.recurringRuleId ? " · Berulang" : ""}</h3>
              <p>{walletNameFor(transaction.walletId)} · {new Date(transaction.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Tokyo" })}</p>
            </div>
            <strong className={transaction.type === "income" ? "income" : "expense"}>
              {transaction.type === "income" ? "+" : "-"}{formatMoney(transaction.amount, currency)}
            </strong>
            <div className="row-actions">
              {isTransferFee ? (
                <span className="read-only-entry">Dari transfer</span>
              ) : (
                <>
                  <button className="icon-button" onClick={() => onEdit(transaction)} aria-label="Edit transaksi"><Pencil size={16} /></button>
                  <button className="icon-button danger" onClick={() => onDelete(transaction)} aria-label="Hapus transaksi"><Trash2 size={16} /></button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
