"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Ellipsis,
  Landmark,
  LayoutDashboard,
  Moon,
  Plus,
  ReceiptText,
  Settings,
  Sun,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  calculateCurrencyBalances,
  calculateEstimatedTotalInIdr,
  formatMoney,
  type Currency,
  type TransactionType,
} from "../lib/domain";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import type {
  BackupEnvelope,
  ExchangeRateCache,
  Preferences,
  TransactionRecord,
  WalletRecord,
} from "../lib/models";
import {
  deleteTransaction,
  deleteWallet,
  getCategories,
  getExchangeRate,
  getTransactions,
  getWallets,
  putCategories,
  putExchangeRate,
  putTransaction,
  putWallet,
  replaceAllData,
} from "../lib/storage";
import { validateBackup } from "../lib/validation";

type View = "dashboard" | "transactions" | "wallets" | "reports" | "backup" | "settings";

const makeId = () => crypto.randomUUID();

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [rate, setRate] = useState<ExchangeRateCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Preferences["theme"]>("system");
  const [modal, setModal] = useState<"wallet" | "transaction" | null>(null);
  const [toast, setToast] = useState("");

  const [walletName, setWalletName] = useState("");
  const [walletCurrency, setWalletCurrency] = useState<Currency>("IDR");
  const [openingBalance, setOpeningBalance] = useState("");

  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [transactionWallet, setTransactionWallet] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionNote, setTransactionNote] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [storedWallets, storedTransactions, storedCategories, storedRate] = await Promise.all([
          getWallets(),
          getTransactions(),
          getCategories(),
          getExchangeRate(),
        ]);
        if (storedCategories.length === 0) {
          await putCategories(DEFAULT_CATEGORIES);
        }
        setWallets(storedWallets);
        setTransactions(storedTransactions);
        setRate(storedRate ?? null);
        const savedTheme = localStorage.getItem("cuanku-theme");
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setTheme(savedTheme);
        }
      } catch {
        setToast("Penyimpanan browser tidak tersedia");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cuanku-theme", theme);
  }, [theme]);

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

  async function saveWallet(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(openingBalance || 0);
    if (!walletName.trim() || !Number.isInteger(amount) || amount < 0) {
      setToast("Lengkapi nama dan saldo awal");
      return;
    }
    const now = new Date().toISOString();
    await putWallet({
      id: makeId(),
      name: walletName.trim(),
      currency: walletCurrency,
      openingBalance: amount,
      createdAt: now,
      updatedAt: now,
    });
    await refreshWallets();
    setWalletName("");
    setOpeningBalance("");
    setModal(null);
    setToast("Dompet berhasil ditambahkan");
  }

  async function removeWallet(wallet: WalletRecord) {
    if (transactions.some((transaction) => transaction.walletId === wallet.id)) {
      setToast("Dompet yang memiliki transaksi tidak dapat dihapus");
      return;
    }
    if (!window.confirm(`Hapus dompet ${wallet.name}?`)) return;
    await deleteWallet(wallet.id);
    await refreshWallets();
    setToast("Dompet berhasil dihapus");
  }

  function openTransaction() {
    if (wallets.length === 0) {
      setView("wallets");
      setToast("Tambahkan dompet terlebih dahulu");
      return;
    }
    setTransactionWallet(wallets[0].id);
    setTransactionCategory(
      DEFAULT_CATEGORIES.find((category) => category.type === transactionType)?.id ?? "",
    );
    setModal("transaction");
  }

  async function saveTransaction(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(transactionAmount);
    if (!transactionWallet || !transactionCategory || !Number.isInteger(amount) || amount <= 0) {
      setToast("Lengkapi seluruh kolom transaksi");
      return;
    }
    const now = new Date().toISOString();
    await putTransaction({
      id: makeId(),
      walletId: transactionWallet,
      type: transactionType,
      amount,
      categoryId: transactionCategory,
      date: new Date(`${transactionDate}T12:00:00.000Z`).toISOString(),
      note: transactionNote.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await refreshTransactions();
    setTransactionAmount("");
    setTransactionNote("");
    setModal(null);
    setToast("Transaksi berhasil disimpan");
  }

  async function removeTransaction(transaction: TransactionRecord) {
    if (!window.confirm("Hapus transaksi ini?")) return;
    await deleteTransaction(transaction.id);
    await refreshTransactions();
    setToast("Transaksi berhasil dihapus");
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
      categories: DEFAULT_CATEGORIES,
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
      });
      await refreshWallets();
      await refreshTransactions();
      setToast("Backup berhasil dipulihkan");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "File backup tidak valid");
    }
  }

  async function deleteAllData() {
    if (!window.confirm("Hapus seluruh dompet dan transaksi? Tindakan ini tidak dapat dibatalkan.")) return;
    await replaceAllData({ wallets: [], transactions: [], categories: DEFAULT_CATEGORIES });
    await refreshWallets();
    await refreshTransactions();
    setToast("Seluruh data berhasil dihapus");
  }

  const categoryName = (id: string) =>
    DEFAULT_CATEGORIES.find((category) => category.id === id)?.name ?? "Lainnya";
  const walletNameFor = (id: string) =>
    wallets.find((wallet) => wallet.id === id)?.name ?? "Dompet";
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

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
              reports: "Laporan",
              backup: "Backup & Pemulihan",
              settings: "Pengaturan",
            }[view]}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ganti tema">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="primary-button" onClick={openTransaction}><Plus size={17} /> Tambah transaksi</button>
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
                  <TransactionList transactions={sortedTransactions.slice(0, 8)} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onDelete={removeTransaction} />
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Catat transaksi pertama" onAction={openTransaction} />}
              </section>
            )}

            {view === "transactions" && (
              <section>
                {sortedTransactions.length ? (
                  <TransactionList transactions={sortedTransactions} wallets={wallets} categoryName={categoryName} walletNameFor={walletNameFor} onDelete={removeTransaction} />
                ) : <EmptyState icon={<ReceiptText />} title="Belum ada transaksi" action="Tambah transaksi" onAction={openTransaction} />}
              </section>
            )}

            {view === "wallets" && (
              <section>
                <div className="section-heading">
                  <div><p className="eyebrow">Pengelolaan</p><h2>Dompet Anda</h2></div>
                  <button className="primary-button" onClick={() => setModal("wallet")}><Plus size={17} /> Dompet baru</button>
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
                        <button className="icon-button danger" onClick={() => removeWallet(wallet)} aria-label={`Hapus ${wallet.name}`}><Trash2 size={17} /></button>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon={<WalletCards />} title="Belum ada dompet" action="Buat dompet pertama" onAction={() => setModal("wallet")} />}
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading">
              <h2 id="modal-title">{modal === "wallet" ? "Dompet baru" : "Transaksi baru"}</h2>
              <button className="icon-button" onClick={() => setModal(null)} aria-label="Tutup"><X size={18} /></button>
            </div>
            {modal === "wallet" ? (
              <form onSubmit={saveWallet}>
                <label>Nama dompet<input value={walletName} onChange={(event) => setWalletName(event.target.value)} placeholder="Contoh: Tabungan" /></label>
                <label>Mata uang<select value={walletCurrency} onChange={(event) => setWalletCurrency(event.target.value as Currency)}><option value="JPY">JPY — Yen</option><option value="IDR">IDR — Rupiah</option></select></label>
                <label>Saldo awal<input type="number" min="0" step="1" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0" /></label>
                <button className="primary-button wide" type="submit">Simpan dompet</button>
              </form>
            ) : (
              <form onSubmit={saveTransaction}>
                <div className="segmented">
                  <button type="button" className={transactionType === "income" ? "selected" : ""} onClick={() => { setTransactionType("income"); setTransactionCategory(DEFAULT_CATEGORIES.find((item) => item.type === "income")?.id ?? ""); }}>Pemasukan</button>
                  <button type="button" className={transactionType === "expense" ? "selected" : ""} onClick={() => { setTransactionType("expense"); setTransactionCategory(DEFAULT_CATEGORIES.find((item) => item.type === "expense")?.id ?? ""); }}>Pengeluaran</button>
                </div>
                <label>Dompet<select value={transactionWallet} onChange={(event) => setTransactionWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} ({wallet.currency})</option>)}</select></label>
                <label>Nominal<input type="number" min="1" step="1" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} placeholder="0" /></label>
                <label>Kategori<select value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)}>{DEFAULT_CATEGORIES.filter((item) => item.type === transactionType).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                <label>Tanggal<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
                <label>Catatan (opsional)<input value={transactionNote} onChange={(event) => setTransactionNote(event.target.value)} placeholder="Tambahkan keterangan" /></label>
                <button className="primary-button wide" type="submit">Simpan transaksi</button>
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
  onDelete,
}: {
  transactions: TransactionRecord[];
  wallets: WalletRecord[];
  categoryName: (id: string) => string;
  walletNameFor: (id: string) => string;
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
            <button className="icon-button" onClick={() => onDelete(transaction)} aria-label="Hapus transaksi"><Ellipsis size={18} /></button>
          </article>
        );
      })}
    </div>
  );
}
