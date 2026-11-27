"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartPie,
  Download,
  Landmark,
  LayoutDashboard,
  Moon,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  Sun,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  calculateBudgetSpent,
  calculateCurrencyBalances,
  calculateEstimatedTotalInIdr,
  formatMoney,
  type Currency,
  type TransactionType,
} from "../lib/domain";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import type {
  BackupEnvelope,
  BudgetRecord,
  ExchangeRateCache,
  Preferences,
  TransactionRecord,
  WalletRecord,
} from "../lib/models";
import {
  deleteTransaction,
  deleteBudget,
  deleteWallet,
  getCategories,
  getBudgets,
  getExchangeRate,
  getTransactions,
  getWallets,
  putCategories,
  putBudget,
  putExchangeRate,
  putTransaction,
  putWallet,
  replaceAllData,
} from "../lib/storage";
import { validateBackup } from "../lib/validation";

type View = "dashboard" | "transactions" | "wallets" | "budgets" | "reports" | "backup" | "settings";

const makeId = () => crypto.randomUUID();
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [rate, setRate] = useState<ExchangeRateCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Preferences["theme"]>("system");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [modal, setModal] = useState<"wallet" | "transaction" | "budget" | null>(null);
  const [toast, setToast] = useState("");
  const [editingWallet, setEditingWallet] = useState<WalletRecord | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);
  const [budgetViewMonth, setBudgetViewMonth] = useState(currentMonth);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"all" | TransactionType>("all");
  const [transactionCurrencyFilter, setTransactionCurrencyFilter] = useState<"all" | Currency>("all");
  const [transactionMonthFilter, setTransactionMonthFilter] = useState("");

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

  useEffect(() => {
    async function load() {
      try {
        const [storedWallets, storedTransactions, storedCategories, storedRate, storedBudgets] = await Promise.all([
          getWallets(),
          getTransactions(),
          getCategories(),
          getExchangeRate(),
          getBudgets(),
        ]);
        if (storedCategories.length === 0) {
          await putCategories(DEFAULT_CATEGORIES);
        }
        setWallets(storedWallets);
        setTransactions(storedTransactions);
        setBudgets(storedBudgets);
        setCategories(storedCategories.length ? storedCategories : DEFAULT_CATEGORIES);
        setRate(storedRate ?? null);
        const savedTheme = localStorage.getItem("cuanku-theme");
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setTheme(savedTheme);
        }
      } catch {
        setToast("Penyimpanan browser tidak tersedia");
      } finally {
        setThemeLoaded(true);
        setLoading(false);
      }
    }
    load();
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

  async function refreshWallets() {
    setWallets(await getWallets());
  }
  async function refreshTransactions() {
    setTransactions(await getTransactions());
  }
  async function refreshBudgets() {
    setBudgets(await getBudgets());
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

  function exportBackup() {
    const backup: BackupEnvelope = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: "Cuanku",
      wallets,
      transactions,
      categories,
      budgets,
      preferences: { theme },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cuanku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
      });
      await refreshWallets();
      await refreshTransactions();
      await refreshBudgets();
      setCategories(backup.categories);
      if (backup.preferences) setTheme(backup.preferences.theme);
      setToast("Backup berhasil dipulihkan");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "File backup tidak valid");
    }
  }

  async function deleteAllData() {
    if (!window.confirm("Hapus seluruh dompet dan transaksi? Tindakan ini tidak dapat dibatalkan.")) return;
    await replaceAllData({ wallets: [], transactions: [], categories: DEFAULT_CATEGORIES, budgets: [] });
    await refreshWallets();
    await refreshTransactions();
    await refreshBudgets();
    setCategories(DEFAULT_CATEGORIES);
    setToast("Seluruh data berhasil dihapus");
  }

  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Lainnya";
  const walletNameFor = (id: string) =>
    wallets.find((wallet) => wallet.id === id)?.name ?? "Dompet";
  const budgetCategoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Kategori";
  const budgetSpent = (budget: BudgetRecord) =>
    calculateBudgetSpent(budget, transactions);
  const currentBudgets = budgets.filter((budget) => budget.month === budgetViewMonth);
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const visibleTransactions = sortedTransactions.filter((transaction) => {
    const wallet = wallets.find((item) => item.id === transaction.walletId);
    const matchesType = transactionTypeFilter === "all" || transaction.type === transactionTypeFilter;
    const matchesCurrency = transactionCurrencyFilter === "all" || wallet?.currency === transactionCurrencyFilter;
    const matchesMonth = !transactionMonthFilter || transaction.date.startsWith(transactionMonthFilter);
    return matchesType && matchesCurrency && matchesMonth;
  });

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
          <NavButton active={view === "wallets"} icon={<WalletCards size={19} />} label="Dompet" onClick={() => setView("wallets")} />
          <NavButton active={view === "budgets"} icon={<ChartPie size={19} />} label="Anggaran" onClick={() => setView("budgets")} />
          <NavButton active={view === "reports"} icon={<Landmark size={19} />} label="Laporan" onClick={() => setView("reports")} />
          <NavButton active={view === "backup"} icon={<Download size={19} />} label="Backup" onClick={() => setView("backup")} />
          <NavButton active={view === "settings"} icon={<Settings size={19} />} label="Pengaturan" onClick={() => setView("settings")} />
        </nav>
      </aside>

      <main className="main-content">
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
            <button className="primary-button" onClick={() => openTransaction()}><Plus size={17} /> Tambah transaksi</button>
          </div>
        </header>

        {loading ? (
          <div className="loading-state">Memuat data lokal...</div>
        ) : (
          <>
            {view === "dashboard" && (
              <section>
                <div className="balance-grid">
                  <article className="balance-card featured">
                    <span>Saldo JPY</span>
                    <strong>{formatMoney(balances.JPY, "JPY")}</strong>
                    <small>{wallets.filter((wallet) => wallet.currency === "JPY").length} dompet</small>
                  </article>
                  <article className="balance-card">
                    <span>Saldo IDR</span>
                    <strong>{formatMoney(balances.IDR, "IDR")}</strong>
                    <small>{wallets.filter((wallet) => wallet.currency === "IDR").length} dompet</small>
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
                  <label>Bulan<input type="month" value={transactionMonthFilter} onChange={(event) => setTransactionMonthFilter(event.target.value)} /></label>
                  <button className="text-button" onClick={() => { setTransactionTypeFilter("all"); setTransactionCurrencyFilter("all"); setTransactionMonthFilter(""); }}>Reset filter</button>
                </div>
                {visibleTransactions.length ? (
                  <TransactionList transactions={visibleTransactions} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onEdit={openTransaction} onDelete={removeTransaction} />
                ) : transactions.length ? (
                  <div className="empty-state"><div className="empty-icon"><ReceiptText /></div><h2>Tidak ada transaksi yang cocok</h2><button className="text-button" onClick={() => { setTransactionTypeFilter("all"); setTransactionCurrencyFilter("all"); setTransactionMonthFilter(""); }}>Hapus filter</button></div>
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
                <div className="report-grid">
                  {(["JPY", "IDR"] as Currency[]).map((currency) => {
                    const currencyTransactions = transactions.filter((transaction) =>
                      wallets.some((wallet) => wallet.id === transaction.walletId && wallet.currency === currency),
                    );
                    const income = currencyTransactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
                    const expense = currencyTransactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
                    return (
                      <article className="report-card" key={currency}>
                        <p className="eyebrow">Laporan {currency}</p>
                        <h2>{formatMoney(balances[currency], currency)}</h2>
                        <div className="report-row"><span>Pemasukan</span><strong className="income">+{formatMoney(income, currency)}</strong></div>
                        <div className="report-row"><span>Pengeluaran</span><strong className="expense">-{formatMoney(expense, currency)}</strong></div>
                        <div className="report-bar"><span style={{ width: `${income + expense ? Math.min(100, (expense / (income + expense)) * 100) : 0}%` }} /></div>
                      </article>
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
                {modal === "budget"
                  ? editingBudget ? "Edit anggaran" : "Anggaran baru"
                  : modal === "wallet"
                    ? editingWallet ? "Edit dompet" : "Dompet baru"
                    : editingTransaction ? "Edit transaksi" : "Transaksi baru"}
              </h2>
              <button className="icon-button" onClick={() => setModal(null)} aria-label="Tutup"><X size={18} /></button>
            </div>
            {modal === "budget" ? (
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

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>;
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
