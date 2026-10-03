import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrinterSettings } from "./src/components/PrinterSettings";
import { PrinterService, DEFAULT_PRINTER_SETTING, PrinterSettingConfig, SaleReceiptData } from "./src/services/printerService";

/*  Types  */
type User = { id: string; name: string; email: string; role: "ADMIN" | "CASHIER"; shopId: string };
type Category = { id: string; name: string; parentId?: string; parent?: { id: string; name: string }; children?: { id: string; name: string }[]; _count?: { products: number } };
type Product = { id: string; name: string; sku: string; barcode?: string; brand?: string; unit?: string; purchasePrice: number; sellingPrice: number; mrp?: number; taxRate: number; stock: number; minimumStock: number; categoryId?: string; category?: { name: string }; subcategoryId?: string; supplierId?: string; supplier?: { name: string }; batchNumber?: string; expiryDate?: string; imageUrl?: string; active: boolean };
type Customer = { id: string; name: string; phone?: string; email?: string; address?: string; gstin?: string; creditBalance: number; _count?: { sales: number } };
type Supplier = { id: string; name: string; phone?: string; email?: string; address?: string; gstin?: string; payableBalance: number; _count?: { purchases: number } };
type Shift = { id: string; status: string; startTime: string; endTime?: string; openingCash: number; cashSales: number; cashExpenses: number; expectedCash: number; actualCash?: number; difference?: number; notes?: string; user?: { name: string }; counter?: { name: string } };
type Offer = { id: string; name: string; code?: string; type: string; value: number; minBillAmount?: number; buyQty?: number; getQty?: number; active: boolean };
type AuditLogItem = { id: string; action: string; entity: string; entityId?: string; metadata?: any; createdAt: string; user?: { name: string; email: string } };

/*  Helpers  */
const money = (v: number) => `${Number(v || 0).toFixed(2)}`;
const moneyShort = (v: number) => { const n = Number(v || 0); if (n >= 100000) return `${(n / 100000).toFixed(1)}L`; if (n >= 1000) return `${(n / 1000).toFixed(1)}K`; return `${n.toFixed(0)}`; };
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_URL = (configuredApiUrl || "/api").replace(/\/$/, "");
const api = async (path: string, options: RequestInit = {}) => {
  if (import.meta.env.PROD && (!configuredApiUrl || /localhost|127\.0\.0\.1|YOUR-BACKEND-DOMAIN/i.test(API_URL)))
    throw Error("Production API is not configured. Set VITE_API_URL in Vercel and redeploy.");
  const token = localStorage.getItem("pos_token");
  const requestPath = API_URL.endsWith("/api") && path.startsWith("/api") ? path.slice(4) : path;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${requestPath}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(path === "/api/sales" && options.method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {}), ...(options.headers || {}) },
    });
  } catch { throw Error("Cannot connect to the server. Check the API URL and network connection."); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw Error("Your session has expired. Please sign in again.");
    if (response.status === 403) throw Error("You do not have permission for this action.");
    throw Error(data.error || "The server could not complete the request.");
  }
  return data;
};

async function triggerReceiptPrint(sale: any, customConfig?: PrinterSettingConfig) {
  if (!sale) return;
  try {
    const config = customConfig || (await api("/api/printer-settings").catch(() => DEFAULT_PRINTER_SETTING));
    const formattedData: SaleReceiptData = {
      invoiceNumber: sale.invoiceNumber || `INV-${sale.id ? sale.id.slice(-6) : "000000"}`,
      date: new Date(sale.createdAt || Date.now()).toLocaleDateString("en-IN"),
      time: new Date(sale.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      counterNum: sale.counter?.name || "#1",
      cashierName: sale.cashier?.name || "Cashier",
      customerName: sale.customer?.name || "Walk-in Customer",
      customerPhone: sale.customer?.phone || "",
      customerGstin: sale.customer?.gstin || "",
      items: (sale.items || []).map((item: any) => ({
        name: item.product?.name || item.name || "Item",
        sku: item.product?.sku || item.sku || "",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || item.price || 0),
        discount: Number(item.discount || 0),
        tax: Number(item.tax || 0),
        total: Number(item.total || (item.quantity * item.unitPrice) || 0)
      })),
      subtotal: Number(sale.subtotal || sale.total || 0),
      discount: Number(sale.discount || 0),
      tax: Number(sale.tax || 0),
      grandTotal: Number(sale.total || 0),
      paymentMethod: sale.payments?.[0]?.method || "CASH",
      amountReceived: Number(sale.payments?.[0]?.amount || sale.total || 0),
      changeReturned: Math.max(0, Number(sale.payments?.[0]?.amount || 0) - Number(sale.total || 0))
    };
    await PrinterService.printReceipt(config, formattedData);
  } catch (e) {
    console.error("Receipt print error:", e);
  }
}


/*  Shared UI Components  */
const Button = ({ children, className = "", ...props }: any) => <button {...props} className={`button ${className}`}>{children}</button>;
const Field = ({ label, ...props }: any) => <label className="field"><span>{label}</span><input className="input" {...props} /></label>;
const Select = ({ label, children, ...props }: any) => <label className="field"><span>{label}</span><select className="input" {...props}>{children}</select></label>;
function ErrorState({ error }: { error: unknown }) { return error ? <div className="error">{error instanceof Error ? error.message : String(error)}</div> : null; }
function Page({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="page"><div className="page-head"><div className="page-head-left">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{action}</div>{children}</section>;
}
function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

/*  Adjust Modal  */
function AdjustModal({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (qty: number, reason: string) => void }) {
  const [qty, setQty] = useState(String(product.stock));
  const [reason, setReason] = useState("");
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>Adjust Stock</h2>
        <p className="modal-sub">{product.name} &mdash; current: <strong>{product.stock}</strong></p>
        <Field label="New quantity" type="number" min="0" value={qty} onChange={(e: any) => setQty(e.target.value)} autoFocus />
        <Field label="Reason" value={reason} placeholder="e.g. Stock count, damage" onChange={(e: any) => setReason(e.target.value)} />
        <div className="modal-footer">
          <Button className="ghost" onClick={onClose}>Cancel</Button>
          <Button className="primary" onClick={() => onSave(Number(qty), reason || "Stock count")} disabled={!qty}>Save</Button>
        </div>
      </div>
    </div>
  );
}

/*  Login  */
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { const d = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); localStorage.setItem("pos_token", d.token); onLogin(d.user); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in"); }
    finally { setLoading(false); }
  };
  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">SM</div>
        <h1>SuperMarket POS</h1>
        <p className="muted">Store management & point of sale system</p>
        <ErrorState error={error} />
        <Field label="Email" type="email" value={email} autoComplete="username" onChange={(e: any) => setEmail(e.target.value)} />
        <Field label="Password" type="password" value={password} autoComplete="current-password" onChange={(e: any) => setPassword(e.target.value)} />
        <Button className="primary wide" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
      </form>
    </main>
  );
}

/* 
   ADMIN DASHBOARD  Operational supermarket overview
    */
function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [dash, setDash] = useState<any>();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [counters, setCounters] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [report, setReport] = useState<any>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    Promise.all([
      api("/api/dashboard"),
      api("/api/sales"),
      api("/api/products"),
      api("/api/counters"),
      api("/api/cashiers"),
      api("/api/customers"),
      api("/api/reports/summary"),
    ]).then(([d, s, p, ct, ca, cu, r]) => {
      setDash(d); setSales(s); setProducts(p); setCounters(ct); setCashiers(ca); setCustomers(cu); setReport(r);
    }).catch(setError);
  }, []);

  if (error) return <Page title="Dashboard" eyebrow="Operations"><ErrorState error={error} /></Page>;
  if (!dash) return <Page title="Dashboard" eyebrow="Operations"><div className="loading">Loading dashboard...</div></Page>;

  const lowStockProducts = products.filter(p => Number(p.stock) <= Number(p.minimumStock));
  const outOfStock = products.filter(p => Number(p.stock) <= 0);
  const stockHealth = dash.products ? Math.max(0, 100 - Math.round((dash.lowStock / dash.products) * 100)) : 100;
  const activeCashiers = cashiers.filter(c => c.active);
  const todaySales = sales.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString());
  const itemsSold = todaySales.reduce((sum, s) => sum + (s.items?.reduce((a: number, i: any) => a + Number(i.quantity), 0) || 0), 0);

  // Payment method breakdown
  const paymentBreakdown: Record<string, number> = {};
  todaySales.forEach(s => s.payments?.forEach((p: any) => { paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount); }));

  // Top selling products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  todaySales.forEach(s => s.items?.forEach((i: any) => {
    const id = i.product?.id || i.productId;
    if (!productSales[id]) productSales[id] = { name: i.product?.name || "Unknown", qty: 0, revenue: 0 };
    productSales[id].qty += Number(i.quantity);
    productSales[id].revenue += Number(i.total);
  }));
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Outstanding customer payments
  const outstandingCustomers = customers.filter(c => Number(c.creditBalance) > 0).sort((a, b) => Number(b.creditBalance) - Number(a.creditBalance));
  const avgBillValue = todaySales.length ? dash.sales / todaySales.length : 0;

  // Counter overview with cashier mapping
  const counterData = counters.map(ct => {
    const assignedCashiers = cashiers.filter(c => c.counterId === ct.id && c.active);
    const counterSales = todaySales.filter(s => assignedCashiers.some(c => c.id === s.cashierId));
    return { ...ct, cashiers: assignedCashiers, salesCount: counterSales.length, salesTotal: counterSales.reduce((sum, s) => sum + Number(s.total), 0) };
  });

  return (
    <Page title="Dashboard" eyebrow="Operations" action={<span className="status-dot">Store Open</span>}>
      {/*  Top Metrics  */}
      <div className="metric-row">
        {[
          { label: "Today's Sales", value: money(dash.sales), sub: todaySales.length > 0 ? `${todaySales.length} transactions` : "No sales yet", color: "var(--brand)" },
          { label: "Orders", value: String(dash.orders), sub: `Avg ${money(avgBillValue)}`, color: "var(--blue)" },
          { label: "Items Sold", value: String(itemsSold), sub: `${dash.products} active SKUs`, color: "var(--teal)" },
          { label: "Gross Profit", value: report ? moneyShort(report.grossProfit) : "", sub: report ? `${report.revenue > 0 ? Math.round((report.grossProfit / report.revenue) * 100) : 0}% margin` : "", color: "var(--green)" },
          { label: "Active Counters", value: `${counterData.filter(c => c.cashiers.length > 0).length}/${counters.length}`, sub: `${activeCashiers.length} cashier${activeCashiers.length !== 1 ? "s" : ""} online`, color: "var(--blue)" },
          { label: "Low Stock", value: String(dash.lowStock), sub: outOfStock.length ? `${outOfStock.length} out of stock` : "All stocked", color: dash.lowStock > 0 ? "var(--red)" : "var(--green)" },
        ].map(({ label, value, sub, color }) => (
          <article className="metric" key={label} style={{ "--m-color": color } as any}>
            <div className="m-label">{label}</div>
            <div className="m-val">{value}</div>
            <div className="m-sub">{sub}</div>
          </article>
        ))}
      </div>

      {/*  Row 2: Counters + Quick Actions  */}
      <div className="dash-grid" style={{ marginBottom: 14 }}>
        {/* Counter Overview */}
        <div className="panel">
          <div className="panel-header">
            <h2>Counter Overview</h2>
            <button className="panel-link" onClick={() => onNavigate("Cashiers")}>Manage &rarr;</button>
          </div>
          <div className="counter-grid">
            {counterData.map(ct => {
              const isOpen = ct.cashiers.length > 0;
              return (
                <div className={`counter-card ${isOpen ? "open" : "closed"}`} key={ct.id}>
                  <div className="cc-head">
                    <span className="cc-name">{ct.name}</span>
                    <span className={`cc-status ${isOpen ? "online" : "offline"}`}>{isOpen ? "Open" : "Closed"}</span>
                  </div>
                  <div className="cc-cashier">{isOpen ? ct.cashiers.map((c: any) => c.name).join(", ") : "No cashier assigned"}</div>
                  {isOpen && (
                    <div className="cc-stats">
                      <span className="cc-stat">Sales: <b>{moneyShort(ct.salesTotal)}</b></span>
                      <span className="cc-stat">Bills: <b>{ct.salesCount}</b></span>
                    </div>
                  )}
                </div>
              );
            })}
            {counterData.length === 0 && <div className="empty">No counters configured</div>}
          </div>
        </div>

        {/* Quick Actions + Stock Health */}
        <div className="panel accent-panel">
          <span className="eyebrow">Quick Actions</span>
          <h2>Store Operations</h2>
          <p className="muted" style={{ marginBottom: 2 }}>Jump to any section</p>
          <div className="qa-row">
            <button className="qa-btn" onClick={() => onNavigate("Billing")}><span className="qi"></span> New Bill</button>
            <button className="qa-btn" onClick={() => onNavigate("Products")}><span className="qi"></span> Products</button>
            <button className="qa-btn" onClick={() => onNavigate("Inventory")}><span className="qi"></span> Inventory</button>
            <button className="qa-btn" onClick={() => onNavigate("Reports")}><span className="qi"></span> Reports</button>
            <button className="qa-btn" onClick={() => onNavigate("Customers")}><span className="qi"></span> Customers</button>
            <button className="qa-btn" onClick={() => onNavigate("Expenses")}><span className="qi"></span> Expenses</button>
          </div>
          <div className="progress-row" style={{ marginTop: 14 }}>
            <span>Stock Health</span><b>{stockHealth}%</b>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${stockHealth}%` }} /></div>
        </div>
      </div>

      {/*  Row 3: Recent Transactions + Top Products + Payment Breakdown  */}
      <div className="dash-grid-3">
        {/* Recent Transactions */}
        <div className="panel">
          <div className="panel-header">
            <h2>Recent Transactions</h2>
            <button className="panel-link" onClick={() => onNavigate("Sales")}>View All </button>
          </div>
          {todaySales.length === 0 ? <div className="empty">No transactions today</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Time</th></tr></thead>
                <tbody>
                  {todaySales.slice(0, 8).map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.invoiceNumber}</strong></td>
                      <td className="text-muted">{s.customer?.name || "Walk-in"}</td>
                      <td style={{ fontWeight: 700 }}>{money(s.total)}</td>
                      <td><span className="info-pill">{s.payments?.[0]?.method || ""}</span></td>
                      <td className="text-muted">{new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Selling Products */}
        <div className="panel">
          <div className="panel-header">
            <h2>Top Selling Products</h2>
            <button className="panel-link" onClick={() => onNavigate("Products")}>Catalogue </button>
          </div>
          {topProducts.length === 0 ? <div className="empty">No sales data today</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.qty}</td>
                      <td style={{ fontWeight: 700 }}>{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment Breakdown + Low Stock */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Payment Method Breakdown */}
          <div className="panel">
            <div className="panel-header"><h2>Payment Methods</h2></div>
            {Object.keys(paymentBreakdown).length === 0 ? <div className="empty">No payments today</div> : (
              <div>
                {Object.entries(paymentBreakdown).map(([method, amount]) => (
                  <div key={method} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <span><span className="info-pill">{method}</span></span>
                    <strong>{money(amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Low Stock Alerts */}
          <div className="panel">
            <div className="panel-header">
              <h2>Low Stock Alerts</h2>
              <button className="panel-link" onClick={() => onNavigate("Inventory")}>Inventory </button>
            </div>
            {lowStockProducts.length === 0 ? <div className="empty">All products are well stocked</div> : (
              <div>
                {lowStockProducts.slice(0, 5).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <div>
                      <strong>{p.name}</strong>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Min: {p.minimumStock}</div>
                    </div>
                    <span className={Number(p.stock) <= 0 ? "danger-pill" : "warning-pill"}>
                      {Number(p.stock) <= 0 ? "Out of Stock" : `${p.stock} left`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding Payments */}
          {outstandingCustomers.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h2>Outstanding Payments</h2>
                <button className="panel-link" onClick={() => onNavigate("Customers")}>Customers </button>
              </div>
              {outstandingCustomers.slice(0, 4).map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <span>{c.name}</span>
                  <strong className="debt">{money(c.creditBalance)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

/*  CASHIER DASHBOARD  */
function CashierDashboard({ user, onNavigate }: { user: User; onNavigate: (p: string) => void }) {
  const [sales, setSales] = useState<any[]>([]);
  const [error, setError] = useState<unknown>();
  useEffect(() => { api("/api/sales").then(setSales).catch(setError); }, []);

  const mySales = sales.filter(s => s.cashierId === user.id && new Date(s.createdAt).toDateString() === new Date().toDateString());
  const totalSales = mySales.reduce((sum, s) => sum + Number(s.total), 0);
  const itemsSold = mySales.reduce((sum, s) => sum + (s.items?.reduce((a: number, i: any) => a + Number(i.quantity), 0) || 0), 0);

  return (
    <Page title="My Shift" eyebrow={`Welcome, ${user.name}`}>
      <ErrorState error={error} />
      <div className="metric-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <article className="metric" style={{ "--m-color": "var(--brand)" } as any}><div className="m-label">My Sales</div><div className="m-val">{money(totalSales)}</div><div className="m-sub">Today</div></article>
        <article className="metric" style={{ "--m-color": "var(--blue)" } as any}><div className="m-label">Bills</div><div className="m-val">{mySales.length}</div><div className="m-sub">Transactions</div></article>
        <article className="metric" style={{ "--m-color": "var(--teal)" } as any}><div className="m-label">Items Sold</div><div className="m-val">{itemsSold}</div><div className="m-sub">Units</div></article>
        <article className="metric" style={{ "--m-color": "var(--green)" } as any}><div className="m-label">Avg Bill</div><div className="m-val">{money(mySales.length ? totalSales / mySales.length : 0)}</div><div className="m-sub">Per transaction</div></article>
      </div>

      <div className="dash-grid">
        <div className="panel accent-panel">
          <span className="eyebrow">Quick Actions</span>
          <h2>Start Billing</h2>
          <div className="qa-row">
            <button className="qa-btn" onClick={() => onNavigate("Billing")}><span className="qi"></span> New Bill</button>
            <button className="qa-btn" onClick={() => onNavigate("Sales")}><span className="qi"></span> My Bills</button>
            <button className="qa-btn" onClick={() => onNavigate("Customers")}><span className="qi"></span> Customers</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Recent Bills</h2><button className="panel-link" onClick={() => onNavigate("Sales")}>All </button></div>
          {mySales.length === 0 ? <div className="empty">No bills today  start billing!</div> : (
            <Table headers={["Invoice", "Customer", "Amount", "Time"]}>
              {mySales.slice(0, 6).map(s => (
                <tr key={s.id}>
                  <td><strong>{s.invoiceNumber}</strong></td>
                  <td className="text-muted">{s.customer?.name || "Walk-in"}</td>
                  <td style={{ fontWeight: 700 }}>{money(s.total)}</td>
                  <td className="text-muted">{new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </Page>
  );
}

/* 
   MULTI-BILL POS TERMINAL  3 Independent Bill Workspaces
    */

type BillItem = { product: Product; quantity: number };
type BillState = {
  items: BillItem[];
  customerId: string;
  discountType: 'pct' | 'amt';
  discountVal: number;
  notes: string;
  held?: boolean;
};
const EMPTY_BILL = (): BillState => ({ items: [], customerId: '', discountType: 'pct', discountVal: 0, notes: '', held: false });
const BILL_IDS = ['1', '2', '3'] as const;
type BillId = typeof BILL_IDS[number];

function SingleBillWorkspace({
  billId, bill, onUpdate, customers, shop, user, onSaleComplete
}: {
  billId: BillId;
  bill: BillState;
  onUpdate: (b: BillState) => void;
  customers: Customer[];
  shop: any;
  user?: User;
  onSaleComplete: (billId: BillId, sale: any) => void;
}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [quickProducts, setQuickProducts] = useState<Product[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const billRef = useRef(bill);
  useEffect(() => { billRef.current = bill; }, [bill]);

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [splitLines, setSplitLines] = useState<{ method: string; amount: string }[]>([{ method: 'CASH', amount: '' }, { method: 'UPI', amount: '' }]);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOosModal, setShowOosModal] = useState<Product | null>(null);
  const [error, setError] = useState<unknown>();
  const [showKbdPopover, setShowKbdPopover] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load quick-access products (top 8 most stocked products)
  useEffect(() => {
    api('/api/products?limit=16').then((res: Product[]) => {
      setQuickProducts(res.filter(p => Number(p.stock) > 0).slice(0, 8));
    }).catch(() => {});
  }, []);

  // Focus search when bill becomes active
  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80); }, [billId]);

  const playSound = (type: 'add' | 'success' | 'error') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === 'add') { osc.frequency.setValueAtTime(880, ctx.currentTime); gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08); osc.start(); osc.stop(ctx.currentTime + 0.08); }
      else if (type === 'success') { osc.frequency.setValueAtTime(523.25, ctx.currentTime); osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.start(); osc.stop(ctx.currentTime + 0.3); }
      else { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, ctx.currentTime); gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); osc.start(); osc.stop(ctx.currentTime + 0.15); }
    } catch {}
  };

  // Debounced product search
  useEffect(() => {
    if (!query.trim()) { setProducts([]); setDropdownOpen(false); return; }
    const t = setTimeout(() => {
      api(`/api/products?q=${encodeURIComponent(query.trim())}`)
        .then(res => {
          setProducts(res); setDropdownOpen(true); setSelectedIndex(0);
          // Exact barcode/SKU match → auto-add immediately
          const exact = res.find((p: Product) =>
            p.barcode?.toLowerCase() === query.trim().toLowerCase() ||
            p.sku.toLowerCase() === query.trim().toLowerCase()
          );
          if (exact && res.length === 1) {
            addToCart(exact); setQuery(''); setDropdownOpen(false);
          }
        }).catch(setError);
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  // Calculations
  const subtotal = useMemo(() => bill.items.reduce((s, l) => s + Number(l.product.sellingPrice) * l.quantity, 0), [bill.items]);
  const totalTax = useMemo(() => bill.items.reduce((s, l) => s + (Number(l.product.sellingPrice) * l.quantity) * (Number(l.product.taxRate || 0) / 100), 0), [bill.items]);
  const discountAmt = useMemo(() => {
    if (bill.discountType === 'pct') return subtotal * (Math.min(100, Math.max(0, bill.discountVal)) / 100);
    return Math.min(subtotal, Math.max(0, bill.discountVal));
  }, [subtotal, bill.discountType, bill.discountVal]);
  const total = useMemo(() => Math.max(0, subtotal - discountAmt + totalTax), [subtotal, discountAmt, totalTax]);
  const selectedCustomer = useMemo(() => customers.find(c => c.id === bill.customerId), [customers, bill.customerId]);
  const itemCount = bill.items.reduce((s, i) => s + i.quantity, 0);

  const splitTotal = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const splitRemaining = total - splitTotal;

  const addToCart = useCallback((p: Product) => {
    if (Number(p.stock) <= 0) { setShowOosModal(p); playSound('error'); return; }
    setError(undefined); playSound('add');
    const current = billRef.current;
    onUpdate({ ...current, items: current.items.some(i => i.product.id === p.id)
      ? current.items.map(i => i.product.id === p.id ? { ...i, quantity: Math.min(Number(p.stock), i.quantity + 1) } : i)
      : [...current.items, { product: p, quantity: 1 }] });
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [onUpdate]);

  const updateQuantity = useCallback((id: string, q: number) => {
    const current = billRef.current;
    onUpdate({ ...current, items: current.items.map(i => i.product.id === id ? { ...i, quantity: Math.max(0, Math.min(Number(i.product.stock), q)) } : i).filter(i => i.quantity > 0) });
  }, [onUpdate]);

  const removeFromCart = useCallback((id: string) => {
    const current = billRef.current;
    onUpdate({ ...current, items: current.items.filter(i => i.product.id !== id) });
  }, [onUpdate]);

  const clearBill = () => {
    onUpdate(EMPTY_BILL()); setQuery(''); setError(undefined); setShowClearConfirm(false);
    setTimeout(() => searchRef.current?.focus(), 80);
  };

  const holdBill = () => {
    if (bill.items.length === 0) return;
    onUpdate({ ...bill, held: true });
    setTimeout(() => searchRef.current?.focus(), 80);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault(); searchRef.current?.focus();
      } else if (e.key === 'F6') {
        e.preventDefault(); holdBill();
      } else if (e.key === 'F7') {
        e.preventDefault();
        const inp = document.querySelector('.disc-input') as HTMLInputElement;
        inp?.focus();
      } else if (e.key === 'F10') {
        e.preventDefault(); if (bill.items.length > 0 && !isPayModalOpen) { setCashReceived(String(Math.ceil(total))); setIsPayModalOpen(true); }
      } else if (e.key === 'Escape') {
        if (isPayModalOpen) setIsPayModalOpen(false);
        else if (showSuccessModal) setShowSuccessModal(false);
        else if (showAddCustModal) setShowAddCustModal(false);
        else if (showOosModal) setShowOosModal(null);
        else if (dropdownOpen) { setDropdownOpen(false); }
        else if (bill.items.length > 0) setShowClearConfirm(true);
      } else if (dropdownOpen && products.length > 0) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => (i + 1) % products.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => (i - 1 + products.length) % products.length); }
        else if (e.key === 'Enter' && products[selectedIndex]) { e.preventDefault(); addToCart(products[selectedIndex]); setQuery(''); setDropdownOpen(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bill, isPayModalOpen, showSuccessModal, showAddCustModal, showOosModal, dropdownOpen, products, selectedIndex, total]);

  const processCheckout = async () => {
    setError(undefined);
    let payments: { method: string; amount: number }[] = [];
    if (method === 'SPLIT') {
      payments = splitLines.filter(l => Number(l.amount) > 0).map(l => ({ method: l.method, amount: Number(l.amount) }));
      if (Math.abs(splitRemaining) > 0.01) { setError(`Split payment short by ${money(Math.abs(splitRemaining))}`); playSound('error'); return; }
    } else {
      const paidAmount = method === 'CREDIT' ? total : Number(cashReceived || total);
      if (method === 'CREDIT' && !bill.customerId) { setError('Customer selection is required for CREDIT sales.'); playSound('error'); return; }
      if (method !== 'CREDIT' && paidAmount < total) { setError(`Payment short by ${money(total - paidAmount)}`); playSound('error'); return; }
      payments = [{ method, amount: method === 'CREDIT' ? total : paidAmount }];
    }
    try {
      const sale = await api('/api/sales', { method: 'POST', body: JSON.stringify({
        customerId: bill.customerId || undefined,
        discount: discountAmt,
        items: bill.items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        payments,
      })});
      playSound('success');
      setLastSale(sale); setIsPayModalOpen(false); setShowSuccessModal(true);
      onSaleComplete(billId, sale);
      onUpdate(EMPTY_BILL());
      setCashReceived('');
      setSplitLines([{ method: 'CASH', amount: '' }, { method: 'UPI', amount: '' }]);
      api('/api/printer-settings').then(cfg => {
        if (cfg?.autoPrint !== false) { triggerReceiptPrint(sale, cfg); }
      }).catch(() => {});
    } catch (err) { setError(err); playSound('error'); }
  };

  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const c = await api('/api/customers', { method: 'POST', body: JSON.stringify(newCust) });
      onUpdate({ ...bill, customerId: c.id });
      setNewCust({ name: '', phone: '' }); setShowAddCustModal(false);
    } catch (e) { setError(e); }
  };

  return (
    <div className="pos-workspace">
      {/* BARCODE SEARCH */}
      <div className="barcode-zone">
        <div className="barcode-input-wrap">
          <span className="barcode-icon">⌕</span>
          <input
            ref={searchRef} autoFocus
            className="barcode-input"
            placeholder="Scan barcode or search product name / SKU / barcode…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (products.length) setDropdownOpen(true); }}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 160)}
          />
          {query && <button className="barcode-clear" onClick={() => { setQuery(''); setDropdownOpen(false); searchRef.current?.focus(); }}>✕</button>}
          <span className="barcode-kbd-hint">F2</span>
          {dropdownOpen && products.length > 0 && (
            <div className="search-dropdown">
              <div className="search-header-row">{products.length} result{products.length !== 1 ? 's' : ''} — ↑↓ navigate · Enter add</div>
              {products.map((p, idx) => (
                <div key={p.id} className={`search-item ${idx === selectedIndex ? 'focused' : ''}`}
                  onMouseDown={e => { e.preventDefault(); addToCart(p); setQuery(''); setDropdownOpen(false); }}>
                  <div className="si-left">
                    <div className="si-name">{p.name}</div>
                    <div className="si-meta">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}{p.brand ? ` · ${p.brand}` : ''}</div>
                  </div>
                  <div className="si-right">
                    <div className="si-price">₹{money(p.sellingPrice)}</div>
                    {Number(p.mrp) > Number(p.sellingPrice) && <div className="si-mrp">₹{money(Number(p.mrp))}</div>}
                    <div className={`si-stock ${Number(p.stock) > Number(p.minimumStock) ? 'good' : Number(p.stock) > 0 ? 'low' : 'out'}`}>
                      {Number(p.stock) > 0 ? `${p.stock} in stock` : 'OUT OF STOCK'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {dropdownOpen && query && products.length === 0 && (
            <div className="search-dropdown">
              <div className="search-no-results">No products found for "{query}"</div>
            </div>
          )}
        </div>
        {error ? <div className="pos-error-bar">⚠ {error instanceof Error ? error.message : String(error)}</div> : null}
      </div>

      {/* BODY: Cart + Checkout */}
      <div className="pos-body">

        {/* LEFT: Cart Table */}
        <div className="pos-left">
          <div className="bill-header-bar">
            <div className="bill-hb-left">
              <span className="bill-hb-label">Bill {billId}</span>
              {bill.items.length > 0 && <span className="bill-hb-count">{itemCount} items · {bill.items.length} SKUs</span>}
              {bill.held && <span className="bill-hb-hold">⏸ HELD</span>}
            </div>
            <div className="bill-hb-right">
              {bill.held && (
                <button className="pay-sec-btn" style={{ fontSize: 10, padding: '3px 8px' }}
                  onClick={() => onUpdate({ ...bill, held: false })}>▶ Resume</button>
              )}
            </div>
          </div>
          <div className="bill-table-area">
            {bill.items.length === 0 ? (
              <div className="bill-empty">
                <span className="bill-empty-icon">🛒</span>
                <div className="bill-empty-title">Bill {billId} — Ready</div>
                <div className="bill-empty-sub">Scan a barcode or press <kbd>F2</kbd> to search</div>

                {/* Quick Access */}
                {quickProducts.length > 0 && (
                  <div className="quick-access">
                    <div className="qa-section-label">Quick Access</div>
                    <div className="qa-chips">
                      {quickProducts.map(p => (
                        <button key={p.id} className={`qa-chip ${Number(p.stock) <= 0 ? 'out-of-stock' : ''}`}
                          onClick={() => addToCart(p)} disabled={Number(p.stock) <= 0}>
                          <span className="qa-chip-name">{p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name}</span>
                          <span className="qa-chip-price">₹{money(p.sellingPrice)}</span>
                          <span className="qa-chip-stock">{Number(p.stock) > 0 ? `${p.stock} left` : 'Out of stock'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <table className="bill-table">
                <thead>
                  <tr>
                    <th className="bt-num">#</th>
                    <th className="bt-prod">Product</th>
                    <th className="bt-rate">Rate</th>
                    <th className="bt-qty">Qty</th>
                    <th className="bt-disc">Disc</th>
                    <th className="bt-tax">Tax</th>
                    <th className="bt-total">Total</th>
                    <th className="bt-del" />
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item, idx) => {
                    const lineTotal = Number(item.product.sellingPrice) * item.quantity;
                    const lineTax = lineTotal * (Number(item.product.taxRate || 0) / 100);
                    const isLow = Number(item.product.stock) <= Number(item.product.minimumStock) && Number(item.product.stock) > 0;
                    return (
                      <tr key={item.product.id} className="bill-row">
                        <td className="bill-td bt-num-td">{idx + 1}</td>
                        <td className="bill-td" title={item.product.name}>
                          <span className="bill-item-name">{item.product.name}</span>
                          <span className="bill-item-sku">{item.product.sku}{item.product.barcode ? ` · ${item.product.barcode}` : ''}</span>
                          {isLow && <span className="bill-item-low">⚠ {item.product.stock} left</span>}
                        </td>
                        <td className="bill-td bt-rate-td">₹{money(item.product.sellingPrice)}</td>
                        <td className="bill-td bt-qty-td">
                          <div className="bill-qty-ctrl">
                            <button className="bill-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>−</button>
                            <input className="bill-qty-input" type="number" min="1" max={item.product.stock}
                              value={item.quantity}
                              onChange={e => updateQuantity(item.product.id, parseInt(e.target.value) || 0)} />
                            <button className="bill-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                          </div>
                        </td>
                        <td className="bill-td bt-disc-td">—</td>
                        <td className="bill-td bt-tax-td">{item.product.taxRate ? `${item.product.taxRate}%` : '—'}</td>
                        <td className="bill-td bt-total-td">₹{money(lineTotal)}</td>
                        <td className="bill-td bt-del-td">
                          <button className="bill-remove" title="Remove" onClick={() => removeFromCart(item.product.id)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT: Checkout Panel */}
        <div className="pos-right">
          <div className="checkout-panel">

            {/* CUSTOMER */}
            <div className="co-block">
              <div className="co-block-label">Customer</div>
              <div className="co-cust-row">
                <select className="co-cust-select" value={bill.customerId}
                  onChange={e => onUpdate({ ...bill, customerId: e.target.value })}>
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
                <button className="co-cust-add" title="Add new customer (F4)" onClick={() => setShowAddCustModal(true)}>+</button>
              </div>
              {selectedCustomer && Number(selectedCustomer.creditBalance) > 0 && (
                <div className="co-credit-warn">⚠ Outstanding: ₹{money(selectedCustomer.creditBalance)}</div>
              )}
            </div>

            {/* BILL SUMMARY */}
            <div className="co-summary-block">
              <div className="co-sum-inner">
                <div className="co-sum-row"><span>Items</span><span>{itemCount} ({bill.items.length} SKUs)</span></div>
                <div className="co-sum-row"><span>Subtotal</span><span>₹{money(subtotal)}</span></div>
                <div className="co-sum-row co-disc-row">
                  <span className="disc-label">Discount</span>
                  <div className="disc-controls">
                    <button className={`disc-type-btn ${bill.discountType === 'pct' ? 'active' : ''}`}
                      onClick={() => onUpdate({ ...bill, discountType: 'pct' })}>%</button>
                    <button className={`disc-type-btn ${bill.discountType === 'amt' ? 'active' : ''}`}
                      onClick={() => onUpdate({ ...bill, discountType: 'amt' })}>₹</button>
                    <input className="disc-input" type="number" min="0" value={bill.discountVal || ''}
                      placeholder="0" onChange={e => onUpdate({ ...bill, discountVal: Number(e.target.value) })} />
                  </div>
                </div>
                {discountAmt > 0 && (
                  <div className="co-sum-row">
                    <span style={{ color: 'var(--green-text)' }}>Saved</span>
                    <span className="disc-neg">−₹{money(discountAmt)}</span>
                  </div>
                )}
                <div className="co-sum-row"><span>GST</span><span>₹{money(totalTax)}</span></div>
              </div>
            </div>

            {/* GRAND TOTAL */}
            <div className="co-total-block">
              <div className="co-total-label">Total to Pay</div>
              <div className="co-grand-row">
                <span className="co-grand-label">{bill.items.length === 0 ? 'No items' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`}</span>
                <span className="co-grand-val">₹{money(total)}</span>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="co-actions-block">
              <button className="pay-primary-btn" disabled={!bill.items.length || bill.held}
                onClick={() => { setCashReceived(String(Math.ceil(total))); setIsPayModalOpen(true); }}>
                Pay &amp; Checkout
              </button>
              <div className="co-sec-row">
                <button className="pay-sec-btn pay-hold-btn" disabled={!bill.items.length || bill.held}
                  onClick={holdBill} title="Hold bill (F6)">⏸ Hold</button>
                <button className="pay-sec-btn pay-clear-btn" disabled={!bill.items.length}
                  onClick={() => setShowClearConfirm(true)} title="Clear bill">✕ Clear</button>
                <button className={`pay-kbd-toggle${showKbdPopover ? ' active' : ''}`}
                  onClick={() => setShowKbdPopover(p => !p)} title="Keyboard shortcuts">⌨</button>
              </div>
              {showKbdPopover && (
                <div className="kbd-popover">
                  <div className="kbd-popover-title">Keyboard Shortcuts</div>
                  <div className="kbd-popover-grid">
                    <kbd>F2</kbd><span>Search / Scan</span>
                    <kbd>F6</kbd><span>Hold Bill</span>
                    <kbd>F7</kbd><span>Discount</span>
                    <kbd>F10</kbd><span>Pay &amp; Checkout</span>
                    <kbd>Esc</kbd><span>Close / Clear</span>
                    <kbd>Ctrl+1</kbd><span>Bill 1</span>
                    <kbd>Ctrl+2</kbd><span>Bill 2</span>
                    <kbd>Ctrl+3</kbd><span>Bill 3</span>
                    <kbd>↑ ↓ Enter</kbd><span>Search results</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {isPayModalOpen && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setIsPayModalOpen(false); }}>
          <div className="pay-modal">
            <div className="pay-modal-header">
              <h2>Payment — Bill {billId}</h2>
              <button className="pay-close" onClick={() => setIsPayModalOpen(false)}>✕</button>
            </div>
            <div className="pay-due-banner">
              <div className="pay-due-label">Total Amount Due — Bill {billId}</div>
              <div className="pay-due-amount">₹{money(total)}</div>
            </div>
            <div className="pay-body">
              <div className="pay-methods">
                {(['CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'] as const).map(m => (
                  <button key={m} className={`pay-method-btn ${method === m ? 'active' : ''}`} onClick={() => setMethod(m)}>
                    <span className="pm-icon">{m === 'CASH' ? '💵' : m === 'UPI' ? '📱' : m === 'CARD' ? '💳' : m === 'CREDIT' ? '🏦' : '⚡'}</span>
                    <span>{m}</span>
                  </button>
                ))}
              </div>
              {method === 'CASH' && (
                <div className="cash-section">
                  <div className="quick-cash">
                    <button className="qc-btn exact" onClick={() => setCashReceived(String(total))}>Exact (₹{money(total)})</button>
                    {[50, 100, 200, 500, 2000].map(amt => <button key={amt} className="qc-btn" onClick={() => setCashReceived(String(amt))}>₹{amt}</button>)}
                  </div>
                  <span className="cash-label">Amount Received</span>
                  <div className="cash-input-wrap">
                    <span className="cash-input-prefix">₹</span>
                    <input autoFocus className="cash-received-input" type="number" min="0" value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') processCheckout(); }} />
                  </div>
                  {cashReceived !== '' && (
                    <div className={`change-display ${Number(cashReceived) < total ? 'short' : ''}`}>
                      <div className="change-label">{Number(cashReceived) >= total ? 'Change to Return' : 'Amount Remaining'}</div>
                      <div className="change-amount">₹{money(Math.abs(Number(cashReceived) - total))}</div>
                    </div>
                  )}
                </div>
              )}
              {method === 'UPI' && <div className="method-info-box"><span className="mib-icon">📱</span><div className="mib-title">Scan &amp; Pay via UPI</div><div className="mib-sub">Show store QR code. Confirm payment before completing.</div></div>}
              {method === 'CARD' && <div className="method-info-box"><span className="mib-icon">💳</span><div className="mib-title">POS Card Terminal</div><div className="mib-sub">Swipe or insert card on terminal. Confirm before completing.</div></div>}
              {method === 'CREDIT' && (
                <div className="credit-box">
                  <div className="cb-row"><span className="cb-label">Customer:</span><span className="cb-val">{selectedCustomer ? selectedCustomer.name : 'None Selected (Required)'}</span></div>
                  {selectedCustomer && <div className="cb-row"><span className="cb-label">Current Debt:</span><span className="cb-val">₹{money(selectedCustomer.creditBalance)}</span></div>}
                  <div className="cb-row"><span className="cb-label">New Debt:</span><span className="cb-val" style={{ color: 'var(--red)' }}>₹{money(Number(selectedCustomer?.creditBalance || 0) + total)}</span></div>
                </div>
              )}
              {method === 'SPLIT' && (
                <div className="split-section">
                  <div className="split-lines">
                    {splitLines.map((l, i) => (
                      <div key={i} className="split-line">
                        <select className="split-method" value={l.method} onChange={e => setSplitLines(sl => sl.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                        </select>
                        <input className="split-amount" type="number" min="0" placeholder="₹ Amount"
                          value={l.amount}
                          onChange={e => setSplitLines(sl => sl.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                        {splitLines.length > 2 && <button className="split-remove" onClick={() => setSplitLines(sl => sl.filter((_, j) => j !== i))}>✕</button>}
                      </div>
                    ))}
                  </div>
                  <div className={`split-remaining ${Math.abs(splitRemaining) < 0.01 ? 'ok' : 'short'}`}>
                    <span>{Math.abs(splitRemaining) < 0.01 ? '✓ Fully covered' : `Remaining`}</span>
                    <span>{Math.abs(splitRemaining) < 0.01 ? '₹0.00' : `₹${money(Math.abs(splitRemaining))}`}</span>
                  </div>
                  <button className="split-add-btn" onClick={() => setSplitLines(sl => [...sl, { method: 'CASH', amount: '' }])}>+ Add Payment Method</button>
                </div>
              )}
              {error ? <div className="error" style={{ marginTop: 10 }}>{error instanceof Error ? error.message : String(error)}</div> : null}
            </div>
            <div className="pay-footer">
              <button className="pay-cancel-btn" onClick={() => setIsPayModalOpen(false)}>Cancel</button>
              <button className="pay-submit-btn ready"
                disabled={
                  (method === 'CASH' && Number(cashReceived || 0) < total) ||
                  (method === 'CREDIT' && !bill.customerId) ||
                  (method === 'SPLIT' && Math.abs(splitRemaining) > 0.01)
                }
                onClick={processCheckout}>
                ✔ Complete Sale (₹{money(total)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccessModal && lastSale && (
        <div className="success-overlay">
          <div className="success-modal">
            <div className="success-header">
              <span className="success-icon">✅</span>
              <div className="success-title">Sale Completed — Bill {billId}</div>
              <div className="success-invoice">{lastSale.invoiceNumber}</div>
            </div>
            <div className="success-body">
              <div className="success-rows">
                <div className="success-row"><span className="sr-label">Total</span><span className="sr-val">₹{money(lastSale.total)}</span></div>
                <div className="success-row"><span className="sr-label">Payment</span><span className="sr-val"><span className="badge info">{lastSale.payments?.[0]?.method || 'CASH'}</span></span></div>
                {lastSale.payments?.[0]?.method === 'CASH' && <div className="success-row"><span className="sr-label">Change</span><span className="sr-val" style={{ color: 'var(--green-text)' }}>₹{money(Math.max(0, Number(lastSale.payments[0].amount) - Number(lastSale.total)))}</span></div>}
                <div className="success-row"><span className="sr-label">Customer</span><span className="sr-val">{lastSale.customer?.name || 'Walk-in'}</span></div>
                <div className="success-row"><span className="sr-label">Items</span><span className="sr-val">{lastSale.items?.length || bill.items.length} products</span></div>
              </div>
              <div className="success-actions">
                <button className="success-action-btn" onClick={() => triggerReceiptPrint(lastSale)}>
                  <span className="sa-icon">🖨</span><span>Print Receipt</span>
                </button>
                <button className="success-action-btn success-new-btn"
                  onClick={() => { setShowSuccessModal(false); setTimeout(() => searchRef.current?.focus(), 100); }}>
                  → Next Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {showAddCustModal && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddCustModal(false); }}>
          <div className="modal add-cust-modal">
            <h2>Quick Add Customer</h2>
            <form onSubmit={handleAddCustomer}>
              <Field label="Full Name" required value={newCust.name} onChange={(e: any) => setNewCust({ ...newCust, name: e.target.value })} />
              <Field label="Phone Number" value={newCust.phone} onChange={(e: any) => setNewCust({ ...newCust, phone: e.target.value })} />
              <div className="modal-footer">
                <Button className="ghost" type="button" onClick={() => setShowAddCustModal(false)}>Cancel</Button>
                <Button className="primary" type="submit">Save &amp; Use</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLEAR CONFIRM */}
      {showClearConfirm && (
        <div className="pay-modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal confirm-modal">
            <span className="confirm-icon">⚠️</span>
            <h2>Clear Bill {billId}?</h2>
            <p>All {itemCount} items will be removed. Other bills are unaffected.</p>
            <div className="modal-footer">
              <Button className="ghost" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
              <Button className="primary" style={{ background: 'var(--red)' }} onClick={clearBill}>Clear Bill {billId}</Button>
            </div>
          </div>
        </div>
      )}

      {/* OUT-OF-STOCK MODAL */}
      {showOosModal && (
        <div className="pay-modal-overlay" onClick={() => setShowOosModal(null)}>
          <div className="modal" style={{ width: 'min(320px,95vw)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
            <h2>Out of Stock</h2>
            <p style={{ fontWeight: 700, marginTop: 6, marginBottom: 4 }}>{showOosModal.name}</p>
            <p style={{ color: 'var(--red-text)', fontSize: 12, fontWeight: 600 }}>Current Stock: 0</p>
            <div className="modal-footer" style={{ justifyContent: 'center', marginTop: 16 }}>
              <Button className="primary" onClick={() => setShowOosModal(null)}>OK</Button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT */}
      {lastSale && (
        <div id="thermal-receipt" style={{ display: 'none' }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>{shop?.name || 'SUPERMARKET POS'}</h3>
            <div style={{ fontSize: 9 }}>{shop?.address || ''}</div>
            {shop?.phone && <div style={{ fontSize: 9 }}>Ph: {shop.phone}</div>}
            {shop?.gstin && <div style={{ fontSize: 9 }}>GSTIN: {shop.gstin}</div>}
          </div>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
          <div style={{ fontSize: 9 }}>
            <div>Invoice: {lastSale.invoiceNumber}</div>
            <div>Date: {new Date(lastSale.createdAt || Date.now()).toLocaleString()}</div>
            <div>Cashier: {user?.name || 'Staff'}</div>
            <div>Customer: {lastSale.customer?.name || 'Walk-in'}</div>
          </div>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
          <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #000' }}><th style={{ textAlign: 'left' }}>Item</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Amt</th></tr></thead>
            <tbody>{lastSale.items?.map((i: any) => <tr key={i.id}><td>{i.product?.name}</td><td style={{ textAlign: 'center' }}>{i.quantity}</td><td style={{ textAlign: 'right' }}>₹{money(Number(i.unitPrice) * i.quantity)}</td></tr>)}</tbody>
          </table>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
          <div style={{ fontSize: 10, fontWeight: 'bold' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total:</span><span>₹{money(lastSale.total)}</span></div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 9, marginTop: 6 }}>Thank you for shopping!</div>
        </div>
      )}
    </div>
  );
}


/* 
   MULTI-BILL POS CONTAINER
    */
function Billing({ user, onNavigate }: { user?: User; onNavigate: (p: string) => void }) {
  // 3 completely independent bills
  const [bills, setBills] = useState<Record<BillId, BillState>>({ '1': EMPTY_BILL(), '2': EMPTY_BILL(), '3': EMPTY_BILL() });
  const [activeBill, setActiveBill] = useState<BillId>('1');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shop, setShop] = useState<any>();
  const [timeStr, setTimeStr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api('/api/customers').then(setCustomers).catch(() => {}); api('/api/shop').then(setShop).catch(() => {}); }, []);
  useEffect(() => { const u = () => setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })); u(); const t = setInterval(u, 1000); return () => clearInterval(t); }, []);

  // Click-outside to close menu
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+1/2/3 global shortcuts for bill switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); setActiveBill('1'); }
        else if (e.key === '2') { e.preventDefault(); setActiveBill('2'); }
        else if (e.key === '3') { e.preventDefault(); setActiveBill('3'); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const updateBill = useCallback((id: BillId) => (state: BillState) => {
    setBills(prev => ({ ...prev, [id]: state }));
  }, []);

  const billItemCount = (id: BillId) => bills[id].items.reduce((s, i) => s + i.quantity, 0);
  const billTotal = (id: BillId) => {
    const b = bills[id];
    const sub = b.items.reduce((s, l) => s + Number(l.product.sellingPrice) * l.quantity, 0);
    const tax = b.items.reduce((s, l) => s + (Number(l.product.sellingPrice) * l.quantity) * (Number(l.product.taxRate || 0) / 100), 0);
    const disc = b.discountType === 'pct' ? sub * (b.discountVal / 100) : Math.min(sub, b.discountVal);
    return Math.max(0, sub - disc + tax);
  };

  const admin = user?.role === 'ADMIN';
  const adminNavItems = [
    { label: 'Dashboard', section: 'Operations' },
    { label: 'Sales' },
    { label: 'Products', section: 'Catalogue' },
    { label: 'Categories' },
    { label: 'Inventory' },
    { label: 'Purchases' },
    { label: 'Suppliers' },
    { label: 'Customers', section: 'Customers' },
    { label: 'Shifts', section: 'Registers' },
    { label: 'Offers' },
    { label: 'Expenses', section: 'Business' },
    { label: 'Reports' },
    { label: 'Cashiers', section: 'Staff' },
    { label: 'Audit Log' },
    { label: 'Settings', section: 'System' },
  ];
  const cashierNavItems = [
    { label: 'Sales', section: 'My Work' },
    { label: 'Customers' },
    { label: 'Shifts' },
  ];
  const navItems = admin ? adminNavItems : cashierNavItems;

  return (
    <div className="pos-shell">
      {/*  COMPACT POS HEADER  */}
      <header className="pos-header">
        {/* LEFT: Counter Info */}
        <span className="ph-counter">Counter #1</span>
        <div className="pos-header-divider" />
        <span className="ph-cashier">Cashier: <b>{user?.name || 'Staff'}</b></span>
        <div className="pos-header-divider" />
        <span className="ph-label">{shop?.name || 'SuperMarket POS'}</span>

        {/* CENTER: Bill Tabs */}
        <div className="pos-bill-tabs">
          {BILL_IDS.map(id => {
            const count = billItemCount(id);
            const tot = billTotal(id);
            const isActive = activeBill === id;
            return (
              <button key={id} className={`pos-bill-tab ${isActive ? 'active' : ''} ${count > 0 ? 'has-items' : ''}`}
                onClick={() => setActiveBill(id)}
                title={`Ctrl+${id} to switch`}>
                <span className="pbt-label">BILL {id}</span>
                {count > 0 ? (
                  <span className="pbt-info">{count} items  {money(tot)}</span>
                ) : (
                  <span className="pbt-empty">Empty</span>
                )}
              </button>
            );
          })}
        </div>

        {/* RIGHT: Status + Time + Menu */}
        <div className="ph-conn">
          <span className="ph-conn-dot" />
          Online
        </div>
        <div className="ph-time">{timeStr}</div>

        {/* Three-dot Menu */}
        <div className="pos-menu-wrap" ref={menuRef}>
          <button className="pos-menu-btn" onClick={() => setMenuOpen(o => !o)} title="Navigation Menu" aria-label="Open navigation menu">
            <span></span>
          </button>
          {menuOpen && (
            <div className="pos-menu-dropdown" role="menu">
              <div className="pmd-header">
                <div className="pmd-logo">SM</div>
                <div>
                  <div className="pmd-title">SuperMarket POS</div>
                  <div className="pmd-role">{user?.name}  {user?.role?.toLowerCase()}</div>
                </div>
              </div>
              <div className="pmd-items">
                {navItems.map((item, i) => (
                  <div key={item.label}>
                    {item.section && <div className="pmd-section">{item.section}</div>}
                    <button className="pmd-item" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate(item.label); }}>{item.label}</button>
                  </div>
                ))}
              </div>
              <div className="pmd-footer">
                <button className="pmd-logout" onClick={() => { localStorage.removeItem('pos_token'); window.location.reload(); }}>Sign out</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/*  ACTIVE BILL WORKSPACE  */}
      {BILL_IDS.map(id => (
        <div key={id} style={{ display: activeBill === id ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <SingleBillWorkspace
            billId={id}
            bill={bills[id]}
            onUpdate={updateBill(id)}
            customers={customers}
            shop={shop}
            user={user}
            onSaleComplete={(_bid, _sale) => {}}
          />
        </div>
      ))}
    </div>
  );
}

function Billing_Placeholder({ user }: { user?: User }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [shop, setShop] = useState<any>();
  
  // Discount state
  const [discountType, setDiscountType] = useState<"pct" | "amt">("pct");
  const [discountVal, setDiscountVal] = useState<number>(0);

  // Payment modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "CREDIT">("CASH");
  const [cashReceived, setCashReceived] = useState("");

  // Held bills state
  const [heldBills, setHeldBills] = useState<{ id: string; time: string; customerId: string; cart: { product: Product; quantity: number }[]; discountType: "pct" | "amt"; discountVal: number }[]>([]);

  // Modals & results
  const [lastSale, setLastSale] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Status & errors
  const [error, setError] = useState<unknown>();
  const [timeStr, setTimeStr] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Clock timer
  useEffect(() => {
    const updateTime = () => setTimeStr(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch initial customer & shop data
  useEffect(() => {
    api("/api/customers").then(setCustomers).catch(setError);
    api("/api/shop").then(setShop).catch(() => {});
  }, []);

  // Audio effects
  const playSound = (type: "add" | "success" | "error") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "add") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
      } else if (type === "success") {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      }
    } catch {}
  };

  // Search product debounced
  useEffect(() => {
    if (!query.trim()) {
      setProducts([]);
      setDropdownOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api(`/api/products?q=${encodeURIComponent(query.trim())}`)
        .then(res => {
          setProducts(res);
          setDropdownOpen(true);
          setSelectedIndex(0);
          // Fast barcode auto-add if exact barcode/SKU match
          const exact = res.find((p: Product) => p.barcode?.toLowerCase() === query.trim().toLowerCase() || p.sku.toLowerCase() === query.trim().toLowerCase());
          if (exact && res.length === 1) {
            addToCart(exact);
            setQuery("");
            setDropdownOpen(false);
          }
        })
        .catch(setError);
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  // Calculations
  const subtotal = useMemo(() => cart.reduce((s, l) => s + Number(l.product.sellingPrice) * l.quantity, 0), [cart]);
  const totalTax = useMemo(() => cart.reduce((s, l) => {
    const itemSub = Number(l.product.sellingPrice) * l.quantity;
    return s + (itemSub * (Number(l.product.taxRate || 0) / 100));
  }, 0), [cart]);

  const discountAmt = useMemo(() => {
    if (discountType === "pct") return subtotal * (Math.min(100, Math.max(0, discountVal)) / 100);
    return Math.min(subtotal, Math.max(0, discountVal));
  }, [subtotal, discountType, discountVal]);

  const total = useMemo(() => Math.max(0, subtotal - discountAmt + totalTax), [subtotal, discountAmt, totalTax]);
  const selectedCustomer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId]);

  // Cart actions
  const addToCart = (p: Product) => {
    if (Number(p.stock) <= 0) {
      setError(`"${p.name}" is out of stock!`);
      playSound("error");
      return;
    }
    setError(undefined);
    playSound("add");
    setCart(c => {
      const existing = c.find(i => i.product.id === p.id);
      if (existing) {
        return c.map(i => i.product.id === p.id ? { ...i, quantity: Math.min(Number(p.stock), i.quantity + 1) } : i);
      }
      return [...c, { product: p, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, q: number) => {
    setCart(c => c.map(i => {
      if (i.product.id === id) {
        const maxStock = Number(i.product.stock);
        const validQ = Math.max(0, Math.min(maxStock, q));
        return { ...i, quantity: validQ };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(c => c.filter(i => i.product.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountVal(0);
    setCustomerId("");
    setQuery("");
    setError(undefined);
    setShowClearConfirm(false);
  };

  // Hold Bill logic
  const holdBill = () => {
    if (!cart.length) return;
    const newHold = {
      id: `HOLD-${Date.now().toString().slice(-4)}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      customerId,
      cart: [...cart],
      discountType,
      discountVal
    };
    setHeldBills(h => [newHold, ...h]);
    setCart([]);
    setDiscountVal(0);
    setCustomerId("");
    playSound("add");
  };

  const resumeHold = (id: string) => {
    const found = heldBills.find(h => h.id === id);
    if (!found) return;
    setCart(found.cart);
    setCustomerId(found.customerId);
    setDiscountType(found.discountType);
    setDiscountVal(found.discountVal);
    setHeldBills(h => h.filter(x => x.id !== id));
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2" || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        setDiscountType(t => t === "pct" ? "amt" : "pct");
      } else if (e.key === "F6") {
        e.preventDefault();
        holdBill();
      } else if (e.key === "F10") {
        e.preventDefault();
        if (cart.length > 0 && !isPayModalOpen) {
          setIsPayModalOpen(true);
        }
      } else if (e.key === "Escape") {
        if (isPayModalOpen) setIsPayModalOpen(false);
        else if (showSuccessModal) setShowSuccessModal(false);
        else if (showAddCustModal) setShowAddCustModal(false);
        else if (cart.length > 0) setShowClearConfirm(true);
      } else if (dropdownOpen && products.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % products.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + products.length) % products.length);
        } else if (e.key === "Enter" && products[selectedIndex]) {
          e.preventDefault();
          addToCart(products[selectedIndex]);
          setQuery("");
          setDropdownOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, isPayModalOpen, showSuccessModal, showAddCustModal, dropdownOpen, products, selectedIndex]);

  // Checkout process
  const processCheckout = async () => {
    setError(undefined);
    const paidAmount = method === "CREDIT" ? total : Number(cashReceived || total);

    if (method === "CREDIT" && !customerId) {
      setError("Customer selection is required for CREDIT sales.");
      playSound("error");
      return;
    }

    if (method !== "CREDIT" && paidAmount < total) {
      setError(`Payment short by ${money(total - paidAmount)}`);
      playSound("error");
      return;
    }

    try {
      const payload = {
        customerId: customerId || undefined,
        discount: discountAmt,
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        payments: [{ method, amount: method === "CREDIT" ? total : paidAmount }]
      };
      const sale = await api("/api/sales", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      playSound("success");
      setLastSale(sale);
      setIsPayModalOpen(false);
      setShowSuccessModal(true);

      // Reset cart
      setCart([]);
      setCashReceived("");
      setDiscountVal(0);
      setQuery("");
    } catch (err) {
      setError(err);
      playSound("error");
    }
  };

  // Add customer inline
  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const c = await api("/api/customers", { method: "POST", body: JSON.stringify(newCust) });
      setCustomers(prev => [...prev, c]);
      setCustomerId(c.id);
      setNewCust({ name: "", phone: "" });
      setShowAddCustModal(false);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="pos-shell">
      {/*  POS Header  */}
      <header className="pos-header">
        <span className="ph-counter">Counter #1</span>
        <div className="pos-header-divider" />
        <span className="ph-cashier">Cashier: <b>{user?.name || "Staff"}</b></span>
        <div className="pos-header-divider" />
        <span className="ph-label">{shop?.name || "Supermarket POS Terminal"}</span>
        
        {heldBills.length > 0 && (
          <>
            <div className="pos-header-divider" />
            <span style={{ color: "var(--sb-active)", fontWeight: 700, fontSize: 11 }}>
               {heldBills.length} Held Bill{heldBills.length > 1 ? "s" : ""}
            </span>
          </>
        )}

        <div className="ph-conn" style={{ marginLeft: "auto", marginRight: 12 }}>
          <span className="ph-conn-dot" /> Online
        </div>
        <div className="ph-time">{timeStr}</div>
      </header>

      {/*  Main Layout  */}
      <div className="pos-body">
        {/* LEFT COLUMN: Search & Item Table */}
        <div className="pos-left">
          {/* Barcode Search Box */}
          <div className="barcode-zone">
            <div className="barcode-row">
              <div className="barcode-input-wrap">
                <span className="barcode-icon">&#x2584;&#x2588;&#x2584;</span>
                <input
                  ref={searchRef}
                  autoFocus
                  className="barcode-input"
                  placeholder="Scan barcode or search name/SKU... (F2)"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => { if (products.length) setDropdownOpen(true); }}
                />

                {/* Dropdown Results */}
                {dropdownOpen && products.length > 0 && (
                  <div className="search-dropdown">
                    {products.map((p, idx) => (
                      <div
                        key={p.id}
                        className={`search-item ${idx === selectedIndex ? "focused" : ""}`}
                        onClick={() => {
                          addToCart(p);
                          setQuery("");
                          setDropdownOpen(false);
                        }}
                      >
                        <div>
                          <div className="si-name">{p.name}</div>
                          <div className="si-meta">SKU: {p.sku} {p.barcode ? ` ${p.barcode}` : ""}</div>
                        </div>
                        <div>
                          <div className="si-price">{money(p.sellingPrice)}</div>
                          <div className={`si-stock ${Number(p.stock) > Number(p.minimumStock) ? "good" : Number(p.stock) > 0 ? "low" : "out"}`}>
                            {Number(p.stock) > 0 ? `${p.stock} in stock` : "Out of stock"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {error ? <div className="unknown-barcode" style={{ marginTop: 6 }}><span className="ub-text">{error instanceof Error ? error.message : String(error)}</span></div> : null}
          </div>

          {/* Cart Table */}
          <div className="bill-table-area">
            {cart.length === 0 ? (
              <div className="bill-empty">
                <span className="bill-empty-icon"></span>
                <p>Checkout Cart is Empty</p>
                <small>Scan a product barcode or press <kbd>F2</kbd> to search products</small>
              </div>
            ) : (
              <table className="bill-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Item Description</th>
                    <th style={{ width: 90 }}>Price</th>
                    <th style={{ width: 100, textAlign: "center" }}>Qty</th>
                    <th style={{ width: 70 }}>Tax %</th>
                    <th style={{ width: 100, textAlign: "right" }}>Total</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => {
                    const lineSub = Number(item.product.sellingPrice) * item.quantity;
                    return (
                      <tr key={item.product.id} className="bill-row">
                        <td style={{ fontSize: 11, color: "var(--text-3)" }}>{idx + 1}</td>
                        <td className="bill-td">
                          <span className="bill-item-name">{item.product.name}</span>
                          <span className="bill-item-sku">SKU: {item.product.sku}</span>
                        </td>
                        <td className="bill-td">{money(item.product.sellingPrice)}</td>
                        <td className="bill-td">
                          <div className="bill-qty-ctrl">
                            <button className="bill-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>&#x2212;</button>
                            <input
                              className="bill-qty-input"
                              type="number"
                              min="1"
                              max={item.product.stock}
                              value={item.quantity}
                              onChange={e => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                            />
                            <button className="bill-qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                          </div>
                        </td>
                        <td className="bill-td" style={{ color: "var(--text-3)", fontSize: 11 }}>
                          {item.product.taxRate ? `${item.product.taxRate}%` : "0%"}
                        </td>
                        <td className="bill-td" style={{ textAlign: "right", fontWeight: 700 }}>
                          {money(lineSub)}
                        </td>
                        <td className="bill-td" style={{ textAlign: "center" }}>
                          <button className="bill-remove" title="Remove Item" onClick={() => removeFromCart(item.product.id)}>&#x2715;</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Checkout Control Panel */}
        <div className="pos-right">
          <div className="checkout-panel">
            {/* Customer Selector */}
            <div className="co-customer">
              <div className="co-customer-label">Customer Account</div>
              <div className="co-cust-row">
                <select
                  className="co-cust-select"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="co-cust-add"
                  title="Add New Customer"
                  onClick={() => setShowAddCustModal(true)}
                >
                  +
                </button>
              </div>
              {selectedCustomer && Number(selectedCustomer.creditBalance) > 0 && (
                <div className="co-cust-info co-cust-credit">
                  Outstanding Credit Balance: {money(selectedCustomer.creditBalance)}
                </div>
              )}
            </div>

            {/* Held Bills Bar */}
            {heldBills.length > 0 && (
              <div className="co-held">
                <div className="co-held-label">Held Transactions ({heldBills.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {heldBills.map(h => (
                    <button key={h.id} className="held-chip" onClick={() => resumeHold(h.id)}>
                      <span>{h.id}</span>
                      <small>({h.cart.length} items)</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calculations Summary */}
            <div className="co-summary">
              <div className="co-sum-row">
                <span className="co-sum-label">Items Count</span>
                <span className="co-sum-val">{cart.reduce((s, i) => s + i.quantity, 0)} units ({cart.length} SKUs)</span>
              </div>
              <div className="co-sum-row">
                <span className="co-sum-label">Subtotal</span>
                <span className="co-sum-val">{money(subtotal)}</span>
              </div>
              <div className="co-sum-row">
                <span className="co-sum-label">GST Tax</span>
                <span className="co-sum-val">{money(totalTax)}</span>
              </div>

              {/* Discount control */}
              <div style={{ marginTop: 6, marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="co-sum-label">Discount</span>
                  <div className="bill-disc-row" style={{ marginTop: 0 }}>
                    <button
                      className={`disc-type-btn ${discountType === "pct" ? "active" : ""}`}
                      onClick={() => setDiscountType("pct")}
                    >
                      %
                    </button>
                    <button
                      className={`disc-type-btn ${discountType === "amt" ? "active" : ""}`}
                      onClick={() => setDiscountType("amt")}
                    >
                      &#x20B9;
                    </button>
                    <input
                      className="disc-input"
                      type="number"
                      min="0"
                      value={discountVal || ""}
                      placeholder="0"
                      onChange={e => setDiscountVal(Number(e.target.value))}
                    />
                  </div>
                </div>
                {discountAmt > 0 && (
                  <div className="co-sum-row discount" style={{ marginTop: 4 }}>
                    <span className="co-sum-label" style={{ color: "var(--green-text)" }}>Discount Applied</span>
                    <span className="co-sum-val">{money(discountAmt)}</span>
                  </div>
                )}
              </div>

              <hr className="co-divider" />

              <div className="co-total-row">
                <span className="co-total-label">Grand Total</span>
                <span className="co-total-val">{money(total)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="co-actions">
              <button
                className="pay-btn complete"
                disabled={!cart.length}
                onClick={() => {
                  setCashReceived(String(Math.ceil(total)));
                  setIsPayModalOpen(true);
                }}
              >
                &#x1F4B3; Pay &amp; Checkout (F10)
              </button>
              <div className="co-actions-row">
                <button
                  className="pay-btn hold"
                  disabled={!cart.length}
                  onClick={holdBill}
                >
                  &#x23F8; Hold (F6)
                </button>
                <button
                  className="pay-btn clear"
                  disabled={!cart.length}
                  onClick={() => setShowClearConfirm(true)}
                >
                  &#x2715; Clear (Esc)
                </button>
              </div>
            </div>

            {/* Keyboard Shortcuts Guide */}
            <div className="kbd-hints">
              <div className="kbd-hints-title">Quick Keys</div>
              <div className="kbd-grid">
                <div className="kbd-row"><kbd>F2</kbd> Search Product</div>
                <div className="kbd-row"><kbd>F4</kbd> Toggle Discount</div>
                <div className="kbd-row"><kbd>F6</kbd> Hold Cart</div>
                <div className="kbd-row"><kbd>F10</kbd> Pay / Checkout</div>
                <div className="kbd-row"><kbd>Esc</kbd> Clear / Close</div>
                <div className="kbd-row"><kbd>/</kbd> Navigate Search</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*  PAYMENT MODAL (F10)  */}
      {isPayModalOpen && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setIsPayModalOpen(false); }}>
          <div className="pay-modal">
            <div className="pay-modal-header">
              <h2>Select Payment Method</h2>
              <button className="pay-close" onClick={() => setIsPayModalOpen(false)}>&#x2715;</button>
            </div>

            <div className="pay-due-banner">
              <div className="pay-due-label">Total Amount Payable</div>
              <div className="pay-due-amount">{money(total)}</div>
            </div>

            <div className="pay-body">
              {/* Payment Method Selector */}
              <div className="pay-methods">
                {(["CASH", "UPI", "CARD", "CREDIT"] as const).map(m => (
                  <button
                    key={m}
                    className={`pay-method-btn ${method === m ? "active" : ""}`}
                    onClick={() => setMethod(m)}
                  >
                    <span className="pm-icon">
                      {m === "CASH" ? "💵" : m === "UPI" ? "📱" : m === "CARD" ? "💳" : "🏦"}
                    </span>
                    <span>{m}</span>
                  </button>
                ))}
              </div>

              {/* CASH Options */}
              {method === "CASH" && (
                <div className="cash-section">
                  <div className="cash-row">
                    <span className="cash-label">Quick Tender Buttons</span>
                  </div>
                  <div className="quick-cash">
                    <button className="qc-btn exact" onClick={() => setCashReceived(String(total))}>Exact ({money(total)})</button>
                    {[50, 100, 200, 500, 2000].map(amt => (
                      <button key={amt} className="qc-btn" onClick={() => setCashReceived(String(amt))}>&#x20B9;{amt}</button>
                    ))}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label className="cash-label" style={{ display: "block", marginBottom: 4 }}>Amount Received from Customer</label>
                    <div className="cash-input-wrap">
                      <span className="cash-input-prefix">&#x20B9;</span>
                      <input
                        autoFocus
                        className="cash-received-input"
                        type="number"
                        min="0"
                        value={cashReceived}
                        onChange={e => setCashReceived(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") processCheckout(); }}
                      />
                    </div>
                  </div>

                  {/* Change calculation box */}
                  {cashReceived !== "" && (
                    <div className={`change-display ${Number(cashReceived) < total ? "short" : ""}`}>
                      <div>
                        <div className="change-label">
                          {Number(cashReceived) >= total ? "Change to Return" : "Amount Remaining"}
                        </div>
                      </div>
                      <div className="change-amount">
                        {money(Math.abs(Number(cashReceived) - total))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* UPI Options */}
              {method === "UPI" && (
                <div className="method-info-box">
                  <span className="mib-icon">&#x1F4F1;</span>
                  <div className="mib-title">Scan & Pay via UPI</div>
                  <div className="mib-sub">Show store QR code to customer. Confirm payment receipt before completing.</div>
                </div>
              )}

              {/* CARD Options */}
              {method === "CARD" && (
                <div className="method-info-box">
                  <span className="mib-icon">&#x1F4B3;</span>
                  <div className="mib-title">POS Card Terminal</div>
                  <div className="mib-sub">Swipe or insert Credit/Debit Card on card reader terminal.</div>
                </div>
              )}

              {/* CREDIT Options */}
              {method === "CREDIT" && (
                <div className="credit-box">
                  <div className="cb-row">
                    <span className="cb-label">Customer Account:</span>
                    <span className="cb-val">{selectedCustomer ? selectedCustomer.name : "None Selected (Required)"}</span>
                  </div>
                  {selectedCustomer && (
                    <div className="cb-row">
                      <span className="cb-label">Current Debt Balance:</span>
                      <span className="cb-val">{money(selectedCustomer.creditBalance)}</span>
                    </div>
                  )}
                </div>
              )}

              {error ? <div className="error" style={{ marginTop: 10 }}>{error instanceof Error ? error.message : String(error)}</div> : null}
            </div>

            <div className="pay-footer">
              <button className="pay-cancel-btn" onClick={() => setIsPayModalOpen(false)}>Cancel</button>
              <button
                className="pay-submit-btn ready"
                disabled={method !== "CREDIT" && Number(cashReceived || 0) < total}
                onClick={processCheckout}
              >
                &#x2714; Complete Sale ({money(total)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  SALE SUCCESS & RECEIPT MODAL  */}
      {showSuccessModal && lastSale && (
        <div className="success-overlay">
          <div className="success-modal">
            <div className="success-header">
              <span className="success-icon">&#x2705;</span>
              <div className="success-title">Sale Completed Successfully!</div>
              <div className="success-invoice">{lastSale.invoiceNumber}</div>
            </div>

            <div className="success-body">
              <div className="success-rows">
                <div className="success-row">
                  <span className="sr-label">Total Amount</span>
                  <span className="sr-val">{money(lastSale.total)}</span>
                </div>
                <div className="success-row">
                  <span className="sr-label">Payment Method</span>
                  <span className="sr-val"><span className="info-pill">{lastSale.payments?.[0]?.method || "CASH"}</span></span>
                </div>
                {lastSale.payments?.[0]?.method === "CASH" && (
                  <div className="success-row">
                    <span className="sr-label">Change Returned</span>
                    <span className="sr-val" style={{ color: "var(--green-text)" }}>
                      {money(Math.max(0, Number(lastSale.payments[0].amount) - Number(lastSale.total)))}
                    </span>
                  </div>
                )}
                <div className="success-row">
                  <span className="sr-label">Items Sold</span>
                  <span className="sr-val">{lastSale.items?.length || 0} line items</span>
                </div>
              </div>

              <div className="success-actions">
                <button
                  className="success-action-btn"
                  onClick={() => triggerReceiptPrint(lastSale)}
                >
                  <span className="sa-icon">&#x1F5A8;</span>
                  <span>Print Receipt</span>
                </button>
                <button
                  className="success-action-btn success-new-btn"
                  onClick={() => {
                    setShowSuccessModal(false);
                    setTimeout(() => searchRef.current?.focus(), 100);
                  }}
                >
                  &#x2192; Start New Sale (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  QUICK ADD CUSTOMER MODAL  */}
      {showAddCustModal && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddCustModal(false); }}>
          <div className="modal add-cust-modal">
            <h2>Add New Customer</h2>
            <form onSubmit={handleAddCustomer}>
              <Field label="Full Name" required value={newCust.name} onChange={(e: any) => setNewCust({ ...newCust, name: e.target.value })} />
              <Field label="Phone Number" value={newCust.phone} onChange={(e: any) => setNewCust({ ...newCust, phone: e.target.value })} />
              <div className="modal-footer">
                <Button className="ghost" type="button" onClick={() => setShowAddCustModal(false)}>Cancel</Button>
                <Button className="primary" type="submit">Save Customer</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/*  CONFIRM CLEAR CART MODAL  */}
      {showClearConfirm && (
        <div className="pay-modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal confirm-modal">
            <span className="confirm-icon"></span>
            <h2>Clear Current Cart?</h2>
            <p>Are you sure you want to remove all items from the current bill?</p>
            <div className="modal-footer">
              <Button className="ghost" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
              <Button className="primary" style={{ background: "var(--red)" }} onClick={clearCart}>Yes, Clear Cart</Button>
            </div>
          </div>
        </div>
      )}

      {/*  HIDDEN THERMAL RECEIPT CONTAINER FOR PRINT  */}
      {lastSale && (
        <div id="thermal-receipt" style={{ display: "none" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>{shop?.name || "SUPERMARKET POS"}</h3>
            <div style={{ fontSize: 9 }}>{shop?.address || "Store Address"}</div>
            {shop?.phone && <div style={{ fontSize: 9 }}>Ph: {shop.phone}</div>}
            {shop?.gstin && <div style={{ fontSize: 9 }}>GSTIN: {shop.gstin}</div>}
          </div>
          <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ fontSize: 9 }}>
            <div>Invoice: {lastSale.invoiceNumber}</div>
            <div>Date: {new Date(lastSale.createdAt || Date.now()).toLocaleString()}</div>
            <div>Cashier: {user?.name || "Staff"}</div>
            <div>Customer: {lastSale.customer?.name || "Walk-in"}</div>
          </div>
          <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />
          <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #000" }}>
                <th style={{ textAlign: "left" }}>Item</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {lastSale.items?.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.product?.name || "Product"}</td>
                  <td style={{ textAlign: "center" }}>{i.quantity}</td>
                  <td style={{ textAlign: "right" }}>{money(Number(i.unitPrice) * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ fontSize: 10, fontWeight: "bold" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total:</span>
              <span>{money(lastSale.total)}</span>
            </div>
            {lastSale.discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                <span>Discount:</span>
                <span>{money(lastSale.discount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span>Payment Mode:</span>
              <span>{lastSale.payments?.[0]?.method || "CASH"}</span>
            </div>
          </div>
          <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ textAlign: "center", fontSize: 9, marginTop: 6 }}>
            Thank you for shopping with us!
          </div>
        </div>
      )}
    </div>
  );
}

/*  SALES HISTORY  */
function Sales() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<unknown>();
  const [search, setSearch] = useState("");
  const load = () => api("/api/sales").then(setRows).catch(setError);
  useEffect(() => { load(); }, []);

  const returnSale = async (sale: any) => {
    const item = sale.items?.[0]; if (!item) return;
    const reason = window.prompt("Reason for return"); if (!reason) return;
    try {
      await api("/api/returns", { method: "POST", body: JSON.stringify({ saleId: sale.id, reason, items: [{ saleItemId: item.id, quantity: 1 }] }) });
      load();
    } catch (e) { setError(e); }
  };

  const filtered = rows.filter(s => !search || s.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || s.customer?.name?.toLowerCase().includes(search.toLowerCase()) || s.cashier?.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Page title="Sales History" eyebrow="Operations" action={<Button className="primary" onClick={load}> Refresh</Button>}>
      <ErrorState error={error} />
      <article className="panel table-panel">
        <div style={{ marginBottom: 10 }}>
          <input className="input" placeholder="Search invoice, customer, cashier" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table headers={["Invoice", "Cashier", "Customer", "Items", "Total", "Payment", "Date", "Status", ""]}>
          {filtered.map(s => (
            <tr key={s.id}>
              <td><strong>{s.invoiceNumber}</strong></td>
              <td>{s.cashier?.name}</td>
              <td>{s.customer?.name || <span className="text-muted">Walk-in</span>}</td>
              <td className="text-muted">{s.items?.length || 0}</td>
              <td style={{ fontWeight: 700 }}>{money(s.total)}</td>
              <td><span className="info-pill">{s.payments?.[0]?.method || ""}</span></td>
              <td className="text-muted">{new Date(s.createdAt).toLocaleString()}</td>
              <td><span className={`badge ${s.status === "RETURNED" ? "warning" : "success"}`}>{s.status}</span></td>
              <td>{s.status !== "RETURNED" && <Button className="ghost" onClick={() => returnSale(s)}>Return</Button>}</td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && <div className="empty">No sales found</div>}
      </article>
    </Page>
  );
}

/*  PRODUCTS CATALOGUE  */
function Products() {
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("true");
  const [error, setError] = useState<unknown>();
  
  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [form, setForm] = useState({
    name: "", brand: "", categoryId: "", subcategoryId: "", sku: "", barcode: "",
    purchasePrice: "", sellingPrice: "", mrp: "", taxRate: "0", unit: "pcs",
    stock: "0", minimumStock: "5", supplierId: "", batchNumber: "", expiryDate: "", imageUrl: ""
  });

  const loadData = useCallback(() => {
    let url = `/api/products?q=${encodeURIComponent(query)}&active=${activeFilter}`;
    if (categoryFilter) url += `&category=${encodeURIComponent(categoryFilter)}`;
    if (brandFilter) url += `&brand=${encodeURIComponent(brandFilter)}`;
    if (stockFilter !== "all") url += `&stockStatus=${encodeURIComponent(stockFilter)}`;

    Promise.all([
      api(url),
      api("/api/categories"),
      api("/api/suppliers")
    ]).then(([p, c, s]) => {
      setRows(p);
      setCategories(c);
      setSuppliers(s);
    }).catch(setError);
  }, [query, categoryFilter, brandFilter, stockFilter, activeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // Unique Brands
  const brands = useMemo(() => Array.from(new Set(rows.map(p => p.brand).filter(Boolean))), [rows]);
  const margin = (b: number, s: number) => s > 0 ? Math.round(((s - b) / s) * 100) : 0;

  const generateBarcode = () => {
    // Generate a random 13-digit EAN-like barcode
    const rand = Math.floor(Math.random() * 9000000000000) + 1000000000000;
    setForm(f => ({ ...f, barcode: String(rand) }));
  };

  const openAdd = () => {
    setEditingId(null);
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    setForm({
      name: "", brand: "", categoryId: "", subcategoryId: "",
      sku: `SKU-${ts}-${rand}`,
      barcode: String(Math.floor(Math.random() * 9000000000000) + 1000000000000),
      purchasePrice: "", sellingPrice: "",
      mrp: "", taxRate: "0", unit: "pcs", stock: "10", minimumStock: "5",
      supplierId: "", batchNumber: "", expiryDate: "", imageUrl: ""
    });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name, brand: p.brand || "", categoryId: p.categoryId || "", subcategoryId: p.subcategoryId || "",
      sku: p.sku, barcode: p.barcode || "", purchasePrice: String(p.purchasePrice), sellingPrice: String(p.sellingPrice),
      mrp: p.mrp ? String(p.mrp) : "", taxRate: String(p.taxRate || 0), unit: p.unit || "pcs",
      stock: String(p.stock), minimumStock: String(p.minimumStock), supplierId: p.supplierId || "",
      batchNumber: p.batchNumber || "", expiryDate: p.expiryDate ? p.expiryDate.split("T")[0] : "", imageUrl: p.imageUrl || ""
    });
    setShowModal(true);
  };

  const toggleActive = async (p: Product) => {
    try {
      await api(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) });
      loadData();
    } catch (e) { setError(e); }
  };

  const deleteProduct = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await api(`/api/products/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadData();
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete product.");
    }
  };

  const [saveError, setSaveError] = useState<string>("");

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError("");
    try {
      const payload = {
        ...form,
        purchasePrice: Number(form.purchasePrice),
        sellingPrice: Number(form.sellingPrice),
        mrp: form.mrp ? Number(form.mrp) : undefined,
        taxRate: Number(form.taxRate),
        stock: Number(form.stock),
        minimumStock: Number(form.minimumStock)
      };

      if (editingId) {
        await api(`/api/products/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowModal(false);
      setSaveError("");
      loadData();
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save product. Please try again.");
    }
  };

  const processBulkImport = async () => {
    if (!bulkCsv.trim()) return;
    try {
      const lines = bulkCsv.trim().split("\n");
      const items = lines.map((line, idx) => {
        const parts = line.split(",").map(s => s.trim());
        if (idx === 0 && (parts[0].toLowerCase().includes("name") || parts[0].toLowerCase().includes("sku"))) return null;
        return {
          name: parts[0] || `Item ${idx}`,
          sku: parts[1] || `SKU-${Date.now()}-${idx}`,
          barcode: parts[2] || undefined,
          purchasePrice: Number(parts[3] || 0),
          sellingPrice: Number(parts[4] || 0),
          stock: Number(parts[5] || 0),
          unit: parts[6] || "pcs"
        };
      }).filter(Boolean);

      const res = await api("/api/products/bulk", { method: "POST", body: JSON.stringify(items) });
      alert(`Bulk Import Complete: ${res.inserted} products inserted, ${res.skipped} skipped.`);
      setShowBulkModal(false);
      setBulkCsv("");
      loadData();
    } catch (e) { setError(e); }
  };

  const exportCsv = () => {
    const headers = ["Name", "SKU", "Barcode", "Brand", "Category", "PurchasePrice", "SellingPrice", "MRP", "Stock", "Unit"];
    const csvRows = [headers.join(",")];
    rows.forEach(p => {
      csvRows.push([
        `"${p.name.replace(/"/g, '""')}"`,
        p.sku,
        p.barcode || "",
        `"${(p.brand || "").replace(/"/g, '""')}"`,
        `"${(p.category?.name || "").replace(/"/g, '""')}"`,
        p.purchasePrice,
        p.sellingPrice,
        p.mrp || "",
        p.stock,
        p.unit || "pcs"
      ].join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supermarket_product_catalogue.csv";
    a.click();
  };

  return (
    <Page
      title="Product Catalogue"
      eyebrow="Catalogue Management"
      action={
        <div style={{ display: "flex", gap: 6 }}>
          <Button className="ghost" onClick={exportCsv}> Export CSV</Button>
          <Button className="ghost" onClick={() => setShowBulkModal(true)}> Bulk Import</Button>
          <Button className="primary" onClick={openAdd}>+ Add Product</Button>
        </div>
      }
    >
      <ErrorState error={error} />

      {/* Toolbar Filter Row */}
      <div className="toolbar-row">
        <input className="input" placeholder="Search product name, SKU, barcode, brand" value={query} onChange={e => setQuery(e.target.value)} style={{ width: 240 }} />
        <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 140 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input" value={stockFilter} onChange={e => setStockFilter(e.target.value)} style={{ width: 130 }}>
          <option value="all">All Stock Status</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <select className="input" value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{ width: 110 }}>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
          <option value="all">All Status</option>
        </select>
        <Button className="ghost" style={{ marginLeft: "auto" }} onClick={loadData}> Filter</Button>
      </div>

      <article className="panel table-panel">
        <Table headers={["Product", "SKU / Barcode", "Category & Brand", "Buy", "Sell", "MRP", "Margin", "Stock", "Status", "Actions"]}>
          {rows.map(p => {
            const m = margin(Number(p.purchasePrice), Number(p.sellingPrice));
            const isLow = Number(p.stock) <= Number(p.minimumStock) && Number(p.stock) > 0;
            const isOut = Number(p.stock) <= 0;
            return (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.6 }}>
                <td>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>{p.unit || "pcs"} {p.batchNumber ? ` Batch ${p.batchNumber}` : ""}</div>
                </td>
                <td className="text-muted">
                  <div>{p.sku}</div>
                  <small style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{p.barcode || ""}</small>
                </td>
                <td>
                  <div>{p.category?.name || "Uncategorized"}</div>
                  <small style={{ color: "var(--brand-text)", fontWeight: 600 }}>{p.brand || ""}</small>
                </td>
                <td>{money(p.purchasePrice)}</td>
                <td style={{ fontWeight: 700 }}>{money(p.sellingPrice)}</td>
                <td className="text-muted">{p.mrp ? money(p.mrp) : ""}</td>
                <td><span className={`margin-badge ${m < 10 ? "low" : ""}`}>{m}%</span></td>
                <td style={{ fontWeight: 700 }}>{p.stock}</td>
                <td>
                  {!p.active ? <span className="badge neutral">Inactive</span> : isOut ? <span className="badge danger">Out of Stock</span> : isLow ? <span className="badge warning">Low Stock</span> : <span className="badge success">Active</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button className="ghost" onClick={() => openEdit(p)}>Edit</Button>
                    <Button className="ghost" onClick={() => toggleActive(p)} style={{ color: p.active ? "var(--red)" : "var(--green)" }}>
                      {p.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button className="ghost" onClick={() => { setDeleteError(""); setDeleteTarget(p); }} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Delete</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {rows.length === 0 && <div className="empty">No products match criteria</div>}
      </article>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal modal-lg">
            <h2>{editingId ? "Edit Product" : "Add New Supermarket Product"}</h2>
            <form onSubmit={saveProduct} style={{ marginTop: 12 }}>
              <div className="form-grid-3">
                <Field label="Product Name *" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
                <Field label="Brand / Manufacturer" value={form.brand} onChange={(e: any) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Nestle, Amul" />
                <Select label="Category" value={form.categoryId} onChange={(e: any) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>

              <div className="form-grid-3">
                <Field label="SKU *" required value={form.sku} onChange={(e: any) => setForm({ ...form, sku: e.target.value })} />
                <div>
                  <label className="field"><span>Barcode</span></label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input className="input" value={form.barcode} onChange={(e: any) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode" />
                    <Button type="button" className="ghost" onClick={generateBarcode} style={{ whiteSpace: "nowrap" }}>Gen</Button>
                  </div>
                </div>
                <Select label="Unit of Measure" value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })}>
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="g">Gram (g)</option>
                  <option value="l">Litre (l)</option>
                  <option value="ml">Millilitre (ml)</option>
                  <option value="pack">Pack / Box</option>
                </Select>
              </div>

              <div className="form-grid-3">
                <Field label="Purchase Price () *" type="number" step="0.01" required value={form.purchasePrice} onChange={(e: any) => setForm({ ...form, purchasePrice: e.target.value })} />
                <Field label="Selling Price () *" type="number" step="0.01" required value={form.sellingPrice} onChange={(e: any) => setForm({ ...form, sellingPrice: e.target.value })} />
                <Field label="MRP ()" type="number" step="0.01" value={form.mrp} onChange={(e: any) => setForm({ ...form, mrp: e.target.value })} />
              </div>

              <div className="form-grid-3">
                <Field label="GST / Tax Rate (%)" type="number" value={form.taxRate} onChange={(e: any) => setForm({ ...form, taxRate: e.target.value })} />
                <Field label="Opening Stock Quantity *" type="number" required value={form.stock} onChange={(e: any) => setForm({ ...form, stock: e.target.value })} />
                <Field label="Minimum Reorder Stock *" type="number" required value={form.minimumStock} onChange={(e: any) => setForm({ ...form, minimumStock: e.target.value })} />
              </div>

              <div className="form-grid-3">
                <Select label="Preferred Supplier" value={form.supplierId} onChange={(e: any) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Choose Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Field label="Batch Number" value={form.batchNumber} onChange={(e: any) => setForm({ ...form, batchNumber: e.target.value })} placeholder="e.g. BATCH-2026A" />
                <Field label="Expiry Date" type="date" value={form.expiryDate} onChange={(e: any) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>

              <div className="modal-footer" style={{ marginTop: 16 }}>
                <Button type="button" className="ghost" onClick={() => { setShowModal(false); setSaveError(""); }}>Cancel</Button>
                <Button type="submit" className="primary">Save Product</Button>
              </div>
              {saveError && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--red-bg, #fff0f0)", color: "var(--red, #c0392b)", borderRadius: 6, fontSize: 13, border: "1px solid var(--red, #c0392b)" }}>
                   {saveError}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowBulkModal(false); }}>
          <div className="modal modal-lg">
            <h2>Bulk Import Products (CSV)</h2>
            <p className="muted" style={{ marginBottom: 10 }}>Paste CSV text with headers: <code>Name, SKU, Barcode, PurchasePrice, SellingPrice, Stock, Unit</code></p>
            <textarea
              className="input"
              rows={8}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 11 }}
              placeholder={`Milk 1L, SKU-MILK-1, 8901234567, 45, 52, 100, pcs\nRice 5kg, SKU-RICE-5, 8909876543, 280, 340, 50, pack`}
              value={bulkCsv}
              onChange={e => setBulkCsv(e.target.value)}
            />
            <div className="modal-footer" style={{ marginTop: 12 }}>
              <Button type="button" className="ghost" onClick={() => setShowBulkModal(false)}>Cancel</Button>
              <Button type="button" className="primary" onClick={processBulkImport}>Start Import</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteTarget && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal confirm-modal">
            <span className="confirm-icon">&#x1F5D1;</span>
            <h2>Delete Product?</h2>
            <p style={{ textAlign: "center", color: "var(--text-2)", marginBottom: 8 }}>
              <strong>{deleteTarget.name}</strong> (SKU: {deleteTarget.sku}) will be <strong>permanently deleted</strong>. This cannot be undone.
            </p>
            {deleteError && <div className="error" style={{ marginBottom: 8 }}>{deleteError}</div>}
            <div className="modal-footer">
              <Button className="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button className="primary" style={{ background: "var(--red)" }} onClick={deleteProduct}>Yes, Delete Product</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/*  CATEGORIES MANAGEMENT  */
function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<unknown>();
  const [deleteCatTarget, setDeleteCatTarget] = useState<Category | null>(null);
  const [deleteCatError, setDeleteCatError] = useState("");

  const load = () => api("/api/categories").then(setCategories).catch(setError);
  useEffect(() => { load(); }, []);

  const createCategory = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name, parentId: parentId || undefined }) });
      setName(""); setParentId("");
      load();
    } catch (e) { setError(e); }
  };

  const deleteCategory = async () => {
    if (!deleteCatTarget) return;
    setDeleteCatError("");
    try {
      await api(`/api/categories/${deleteCatTarget.id}`, { method: "DELETE" });
      setDeleteCatTarget(null);
      load();
    } catch (e: any) {
      setDeleteCatError(e?.message || "Failed to delete category.");
    }
  };

  const mainCategories = categories.filter(c => !c.parentId);

  return (
    <Page title="Supermarket Categories" eyebrow="Catalogue Management">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={createCategory}>
          <h2>Add Category / Subcategory</h2>
          <Field label="Category Name *" required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="e.g. Dairy, Pulses, Beverages" />
          <Select label="Parent Category (Optional)" value={parentId} onChange={(e: any) => setParentId(e.target.value)}>
            <option value="">Main Category (Top Level)</option>
            {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button className="primary wide" style={{ marginTop: 10 }}>Save Category</Button>
        </form>

        <article className="panel table-panel">
          <h2>Store Category Hierarchy</h2>
          <Table headers={["Category Name", "Type", "Parent Category", "Products Count", "Actions"]}>
            {categories.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><span className={`badge ${c.parentId ? "info" : "success"}`}>{c.parentId ? "Subcategory" : "Main Category"}</span></td>
                <td className="text-muted">{c.parent?.name || ""}</td>
                <td style={{ fontWeight: 700 }}>{c._count?.products || 0} SKUs</td>
                <td>
                  <Button className="ghost" onClick={() => { setDeleteCatError(""); setDeleteCatTarget(c); }} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Delete</Button>
                </td>
              </tr>
            ))}
          </Table>
          {categories.length === 0 && <div className="empty">No categories configured</div>}
        </article>
      </div>

      {/* Delete Category Confirmation Modal */}
      {deleteCatTarget && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteCatTarget(null); }}>
          <div className="modal confirm-modal">
            <span className="confirm-icon">&#x1F5D1;</span>
            <h2>Delete Category?</h2>
            <p style={{ textAlign: "center", color: "var(--text-2)", marginBottom: 8 }}>
              <strong>{deleteCatTarget.name}</strong> will be permanently deleted.
            </p>
            {deleteCatError && <div className="error" style={{ marginBottom: 8 }}>{deleteCatError}</div>}
            <div className="modal-footer">
              <Button className="ghost" onClick={() => setDeleteCatTarget(null)}>Cancel</Button>
              <Button className="primary" style={{ background: "var(--red)" }} onClick={deleteCategory}>Yes, Delete Category</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/*  INVENTORY & EXPIRY OPERATIONS  */
function Inventory() {
  const [rows, setRows] = useState<Product[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>();
  const [error, setError] = useState<unknown>();
  const [activeTab, setActiveTab] = useState<"current" | "movements" | "expiry">("current");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);

  const loadData = () => {
    Promise.all([
      api("/api/inventory"),
      api("/api/inventory/movements"),
      api("/api/reports/summary")
    ]).then(([inv, mov, sum]) => {
      setRows(inv);
      setMovements(mov);
      setSummary(sum);
    }).catch(setError);
  };

  useEffect(() => { loadData(); }, []);

  const saveAdjust = async (q: number, r: string) => {
    if (!adjustTarget) return;
    try {
      await api(`/api/inventory/${adjustTarget.id}`, { method: "PATCH", body: JSON.stringify({ quantity: q, reason: r }) });
      setAdjustTarget(null);
      loadData();
    } catch (e) { setError(e); }
  };

  const lowStockCount = rows.filter(p => Number(p.stock) <= Number(p.minimumStock) && Number(p.stock) > 0).length;
  const outCount = rows.filter(p => Number(p.stock) <= 0).length;
  const expiringItems = rows.filter(p => p.expiryDate);

  return (
    <Page title="Inventory Operations" eyebrow="Stock Management" action={<Button className="primary" onClick={loadData}>&#x21BB; Refresh</Button>}>
      <ErrorState error={error} />
      {adjustTarget && <AdjustModal product={adjustTarget} onClose={() => setAdjustTarget(null)} onSave={saveAdjust} />}

      {/* Metrics Row */}
      <div className="metric-row">
        <article className="metric" style={{ "--m-color": "var(--brand)" } as any}>
          <div className="m-label">Stock Valuation</div>
          <div className="m-val">{summary ? money(summary.stockValuation) : ""}</div>
          <div className="m-sub">Purchase Cost</div>
        </article>
        <article className="metric" style={{ "--m-color": "var(--teal)" } as any}>
          <div className="m-label">Total SKUs</div>
          <div className="m-val">{rows.length}</div>
          <div className="m-sub">Active Products</div>
        </article>
        <article className="metric" style={{ "--m-color": "var(--amber)" } as any}>
          <div className="m-label">Low Stock</div>
          <div className="m-val">{lowStockCount}</div>
          <div className="m-sub">Reorder Needed</div>
        </article>
        <article className="metric" style={{ "--m-color": "var(--red)" } as any}>
          <div className="m-label">Out of Stock</div>
          <div className="m-val">{outCount}</div>
          <div className="m-sub">Zero Quantity</div>
        </article>
      </div>

      {/* Tabs */}
      <div className="nav-tabs">
        <button className={`nav-tab ${activeTab === "current" ? "active" : ""}`} onClick={() => setActiveTab("current")}> Current Inventory</button>
        <button className={`nav-tab ${activeTab === "movements" ? "active" : ""}`} onClick={() => setActiveTab("movements")}> Stock Movement History</button>
        <button className={`nav-tab ${activeTab === "expiry" ? "active" : ""}`} onClick={() => setActiveTab("expiry")}> Expiry & Batch Tracker</button>
      </div>

      {/* Tab 1: Current Inventory */}
      {activeTab === "current" && (
        <article className="panel table-panel">
          <Table headers={["Product Name", "SKU / Barcode", "Category", "On Hand", "Reorder Level", "Stock Status", "Actions"]}>
            {rows.map(p => {
              const isLow = Number(p.stock) <= Number(p.minimumStock) && Number(p.stock) > 0;
              const isOut = Number(p.stock) <= 0;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className="text-muted">{p.sku}</td>
                  <td>{p.category?.name || ""}</td>
                  <td style={{ fontWeight: 700 }}>{p.stock} {p.unit || "pcs"}</td>
                  <td>{p.minimumStock}</td>
                  <td>
                    {isOut ? <span className="badge danger">Out of Stock</span> : isLow ? <span className="badge warning">Low Stock</span> : <span className="badge success">In Stock</span>}
                  </td>
                  <td><Button className="ghost" onClick={() => setAdjustTarget(p)}>Adjust Stock</Button></td>
                </tr>
              );
            })}
          </Table>
        </article>
      )}

      {/* Tab 2: Stock Movements History */}
      {activeTab === "movements" && (
        <article className="panel table-panel">
          <Table headers={["Timestamp", "Type", "Product", "Qty Change", "Reference / Reason"]}>
            {movements.map(m => (
              <tr key={m.id}>
                <td className="text-muted">{new Date(m.createdAt).toLocaleString()}</td>
                <td><span className={`badge ${m.type === "PURCHASE" ? "info" : m.type === "SALE" ? "success" : m.type === "RETURN" ? "warning" : "neutral"}`}>{m.type}</span></td>
                <td><strong>{m.product?.name}</strong> <small>({m.product?.sku})</small></td>
                <td style={{ fontWeight: 700, color: Number(m.quantity) > 0 ? "var(--green-text)" : "var(--red-text)" }}>
                  {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="text-muted">{m.reason || m.referenceId || "System Transaction"}</td>
              </tr>
            ))}
          </Table>
          {movements.length === 0 && <div className="empty">No inventory movements recorded</div>}
        </article>
      )}

      {/* Tab 3: Expiry Tracker */}
      {activeTab === "expiry" && (
        <article className="panel table-panel">
          <Table headers={["Product", "Batch #", "Expiry Date", "Days Remaining", "Expiry Status"]}>
            {expiringItems.map(p => {
              const exp = new Date(p.expiryDate!);
              const now = new Date();
              const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
              const isExpired = diffDays <= 0;
              const isSoon = diffDays > 0 && diffDays <= 30;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><code>{p.batchNumber || ""}</code></td>
                  <td>{exp.toLocaleDateString()}</td>
                  <td style={{ fontWeight: 700 }}>{isExpired ? "Expired" : `${diffDays} days`}</td>
                  <td>
                    {isExpired ? <span className="badge danger">Expired</span> : isSoon ? <span className="badge warning">Expiring Soon</span> : <span className="badge success">Valid</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
          {expiringItems.length === 0 && <div className="empty">No batch-tracked expiring items</div>}
        </article>
      )}
    </Page>
  );
}

/*  CUSTOMERS & KHATA LEDGER  */
function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", gstin: "" });
  const [error, setError] = useState<unknown>();
  
  // Khata Detail Modal
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);

  const load = () => api("/api/customers").then(setRows).catch(setError);
  useEffect(() => { load(); }, []);

  const createCustomer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/customers", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", phone: "", email: "", address: "", gstin: "" });
      load();
    } catch (e) { setError(e); }
  };

  const openProfile = async (c: Customer) => {
    setSelectedCust(c);
    try {
      const history = await api(`/api/customers/${c.id}/ledger`);
      setLedger(history);
    } catch (e) { setError(e); }
  };

  const recordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCust || !payAmount) return;
    try {
      await api(`/api/customers/${selectedCust.id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(payAmount), notes: payNotes })
      });
      setShowPayModal(false);
      setPayAmount("");
      setPayNotes("");
      load();
      openProfile(selectedCust);
    } catch (e) { setError(e); }
  };

  return (
    <Page title="Customers & Credit (Khata)" eyebrow="Customer Management">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={createCustomer}>
          <h2>Add New Customer</h2>
          <Field label="Full Name *" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
          <Field label="Phone Number" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />
          <Field label="Email" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
          <Field label="Address" value={form.address} onChange={(e: any) => setForm({ ...form, address: e.target.value })} />
          <Button className="primary wide" style={{ marginTop: 10 }}>Save Customer</Button>
        </form>

        <article className="panel table-panel">
          <Table headers={["Customer", "Contact", "Bills Count", "Credit / Debt Balance", "Actions"]}>
            {rows.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td className="text-muted">{c.phone || ""}</td>
                <td>{c._count?.sales || 0} bills</td>
                <td>
                  <strong className={Number(c.creditBalance) > 0 ? "debt" : ""}>
                    {money(c.creditBalance)}
                  </strong>
                </td>
                <td><Button className="ghost" onClick={() => openProfile(c)}>View Khata Ledger </Button></td>
              </tr>
            ))}
          </Table>
          {rows.length === 0 && <div className="empty">No customers registered</div>}
        </article>
      </div>

      {/* Customer Profile & Khata Ledger Modal */}
      {selectedCust && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedCust(null); }}>
          <div className="modal modal-lg">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2>{selectedCust.name}</h2>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Phone: {selectedCust.phone || ""}  Address: {selectedCust.address || ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-3)", fontWeight: 700 }}>Outstanding Debt Balance</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: Number(selectedCust.creditBalance) > 0 ? "var(--red)" : "var(--green)" }}>
                  {money(selectedCust.creditBalance)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Button className="primary" onClick={() => setShowPayModal(true)}> Record Debt Settlement Payment</Button>
            </div>

            <h3>Khata Ledger History</h3>
            <Table headers={["Timestamp", "Transaction Type", "Amount", "Reference / Notes", "Handled By"]}>
              {ledger.map(l => (
                <tr key={l.id}>
                  <td className="text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${l.type === "CREDIT_GIVEN" ? "danger" : "success"}`}>
                      {l.type === "CREDIT_GIVEN" ? "Credit Given" : "Payment Received"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: l.type === "CREDIT_GIVEN" ? "var(--red)" : "var(--green)" }}>
                    {l.type === "CREDIT_GIVEN" ? `+${money(l.amount)}` : `${money(l.amount)}`}
                  </td>
                  <td className="text-muted">{l.notes || l.sale?.invoiceNumber || ""}</td>
                  <td>{l.user?.name || "Staff"}</td>
                </tr>
              ))}
            </Table>
            {ledger.length === 0 && <div className="empty">No Khata transactions recorded yet</div>}

            <div className="modal-footer" style={{ marginTop: 14 }}>
              <Button className="ghost" onClick={() => setSelectedCust(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && selectedCust && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPayModal(false); }}>
          <div className="modal">
            <h2>Record Debt Payment</h2>
            <p className="muted" style={{ marginBottom: 10 }}>Customer: <b>{selectedCust.name}</b> (Current Debt: {money(selectedCust.creditBalance)})</p>
            <form onSubmit={recordPayment}>
              <Field label="Payment Amount () *" type="number" step="0.01" required value={payAmount} onChange={(e: any) => setPayAmount(e.target.value)} autoFocus />
              <Field label="Notes / Reference" value={payNotes} onChange={(e: any) => setPayNotes(e.target.value)} placeholder="e.g. Cash settlement, UPI reference" />
              <div className="modal-footer" style={{ marginTop: 12 }}>
                <Button type="button" className="ghost" onClick={() => setShowPayModal(false)}>Cancel</Button>
                <Button type="submit" className="primary">Confirm Payment</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/*  SHIFTS & CASH REGISTER  */
function Shifts({ user }: { user: User }) {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shiftsHistory, setShiftsHistory] = useState<Shift[]>([]);
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [error, setError] = useState<unknown>();

  const loadShifts = () => {
    api("/api/shifts/current").then(setCurrentShift).catch(setError);
    if (user.role === "ADMIN") {
      api("/api/shifts").then(setShiftsHistory).catch(setError);
    }
  };

  useEffect(() => { loadShifts(); }, []);

  const startShift = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/shifts/start", { method: "POST", body: JSON.stringify({ openingCash: Number(openingCash || 0) }) });
      setShowStartModal(false);
      setOpeningCash("");
      loadShifts();
    } catch (e) { setError(e); }
  };

  const endShift = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/shifts/end", { method: "POST", body: JSON.stringify({ actualCash: Number(actualCash || 0), notes }) });
      setShowCloseModal(false);
      setActualCash("");
      setNotes("");
      loadShifts();
    } catch (e) { setError(e); }
  };

  return (
    <Page title="Shifts & Cash Register" eyebrow="Shift Operations">
      <ErrorState error={error} />

      {/* Current Shift Box */}
      <div className="panel accent-panel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="eyebrow">Active Register Status</span>
            <h2 style={{ fontSize: 18 }}>
              {currentShift ? `Shift Open  Counter: ${currentShift.counter?.name || "Main Counter"}` : "No Shift Currently Open"}
            </h2>
            {currentShift && (
              <div style={{ fontSize: 12, color: "#a4c4be", marginTop: 4 }}>
                Started at: {new Date(currentShift.startTime).toLocaleString()}  Opening Cash: {money(currentShift.openingCash)}
              </div>
            )}
          </div>
          <div>
            {!currentShift ? (
              <Button className="primary" onClick={() => setShowStartModal(true)}> Start Shift Register</Button>
            ) : (
              <Button className="ghost" style={{ background: "var(--red)", color: "#fff", borderColor: "var(--red)" }} onClick={() => setShowCloseModal(true)}>
                 End Shift & Close Register
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Shift History Log */}
      {user.role === "ADMIN" && (
        <article className="panel table-panel">
          <h2>Store Shift Registers Log</h2>
          <Table headers={["Cashier", "Counter", "Start Time", "End Time", "Opening", "Expected Cash", "Actual Count", "Difference", "Status"]}>
            {shiftsHistory.map(s => (
              <tr key={s.id}>
                <td><strong>{s.user?.name}</strong></td>
                <td>{s.counter?.name || "Main Counter"}</td>
                <td className="text-muted">{new Date(s.startTime).toLocaleString()}</td>
                <td className="text-muted">{s.endTime ? new Date(s.endTime).toLocaleString() : ""}</td>
                <td>{money(s.openingCash)}</td>
                <td>{money(s.expectedCash)}</td>
                <td style={{ fontWeight: 700 }}>{s.actualCash !== undefined ? money(s.actualCash) : ""}</td>
                <td>
                  {s.difference !== undefined ? (
                    <span className={`badge ${s.difference === 0 ? "success" : s.difference < 0 ? "danger" : "warning"}`}>
                      {s.difference > 0 ? `+${money(s.difference)}` : money(s.difference)}
                    </span>
                  ) : ""}
                </td>
                <td><span className={`badge ${s.status === "OPEN" ? "info" : "neutral"}`}>{s.status}</span></td>
              </tr>
            ))}
          </Table>
          {shiftsHistory.length === 0 && <div className="empty">No past shifts logged</div>}
        </article>
      )}

      {/* Start Shift Modal */}
      {showStartModal && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowStartModal(false); }}>
          <div className="modal">
            <h2>Start Cashier Shift</h2>
            <form onSubmit={startShift} style={{ marginTop: 10 }}>
              <Field label="Opening Cash Amount in Drawer () *" type="number" step="0.01" required value={openingCash} onChange={(e: any) => setOpeningCash(e.target.value)} autoFocus placeholder="e.g. 5000" />
              <div className="modal-footer" style={{ marginTop: 12 }}>
                <Button type="button" className="ghost" onClick={() => setShowStartModal(false)}>Cancel</Button>
                <Button type="submit" className="primary">Start Register</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* End Shift Modal */}
      {showCloseModal && currentShift && (
        <div className="pay-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCloseModal(false); }}>
          <div className="modal">
            <h2>End Shift & Close Register</h2>
            <form onSubmit={endShift} style={{ marginTop: 10 }}>
              <Field label="Actual Cash Counted in Drawer () *" type="number" step="0.01" required value={actualCash} onChange={(e: any) => setActualCash(e.target.value)} autoFocus placeholder="Count physical cash" />
              <Field label="Shift Notes / Remarks" value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder="e.g. Shortage notes, drawer handoff" />
              <div className="modal-footer" style={{ marginTop: 12 }}>
                <Button type="button" className="ghost" onClick={() => setShowCloseModal(false)}>Cancel</Button>
                <Button type="submit" className="primary" style={{ background: "var(--red)" }}>Close Register</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/*  OFFERS & PROMOTIONS  */
function Offers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minBill, setMinBill] = useState("");
  const [error, setError] = useState<unknown>();

  const load = () => api("/api/offers").then(setOffers).catch(setError);
  useEffect(() => { load(); }, []);

  const createOffer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/offers", {
        method: "POST",
        body: JSON.stringify({ name, code, type, value: Number(value || 0), minBillAmount: minBill ? Number(minBill) : undefined })
      });
      setName(""); setCode(""); setValue(""); setMinBill("");
      load();
    } catch (e) { setError(e); }
  };

  const toggleOffer = async (o: Offer) => {
    try {
      await api(`/api/offers/${o.id}`, { method: "PATCH", body: JSON.stringify({ active: !o.active }) });
      load();
    } catch (e) { setError(e); }
  };

  return (
    <Page title="Offers & Discounts" eyebrow="Promotions">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={createOffer}>
          <h2>Create Promotion</h2>
          <Field label="Offer Name *" required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="e.g. Festive 10% OFF" />
          <Field label="Coupon Code (Optional)" value={code} onChange={(e: any) => setCode(e.target.value)} placeholder="e.g. SAVE10" />
          <Select label="Discount Type" value={type} onChange={(e: any) => setType(e.target.value)}>
            <option value="PERCENTAGE">Percentage Discount (%)</option>
            <option value="FIXED">Fixed Amount Discount ()</option>
            <option value="MIN_BILL">Minimum Bill Threshold Discount</option>
          </Select>
          <Field label="Discount Value *" type="number" required value={value} onChange={(e: any) => setValue(e.target.value)} placeholder="Value (e.g. 10 or 100)" />
          <Field label="Minimum Bill Threshold ()" type="number" value={minBill} onChange={(e: any) => setMinBill(e.target.value)} placeholder="e.g. 999" />
          <Button className="primary wide" style={{ marginTop: 10 }}>Save Offer</Button>
        </form>

        <article className="panel table-panel">
          <h2>Active Promos</h2>
          <Table headers={["Offer Name", "Code", "Type", "Discount Value", "Status", "Actions"]}>
            {offers.map(o => (
              <tr key={o.id}>
                <td><strong>{o.name}</strong></td>
                <td><code>{o.code || "AUTO"}</code></td>
                <td><span className="badge info">{o.type}</span></td>
                <td style={{ fontWeight: 700 }}>{o.type === "PERCENTAGE" ? `${o.value}%` : money(o.value)}</td>
                <td><span className={`badge ${o.active ? "success" : "neutral"}`}>{o.active ? "Active" : "Disabled"}</span></td>
                <td>
                  <Button className="ghost" onClick={() => toggleOffer(o)}>
                    {o.active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          {offers.length === 0 && <div className="empty">No active promotions</div>}
        </article>
      </div>
    </Page>
  );
}

/*  AUDIT LOGS  */
function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [error, setError] = useState<unknown>();

  const load = () => api("/api/audit-logs").then(setLogs).catch(setError);
  useEffect(() => { load(); }, []);

  return (
    <Page title="System Audit Trail" eyebrow="Security & Auditing" action={<Button className="primary" onClick={load}> Refresh</Button>}>
      <ErrorState error={error} />
      <article className="panel table-panel">
        <Table headers={["Timestamp", "User", "Action", "Entity", "Entity ID", "Metadata"]}>
          {logs.map(l => (
            <tr key={l.id}>
              <td className="text-muted">{new Date(l.createdAt).toLocaleString()}</td>
              <td><strong>{l.user?.name || "System"}</strong></td>
              <td><span className="badge info">{l.action}</span></td>
              <td>{l.entity}</td>
              <td className="text-muted"><code>{l.entityId || ""}</code></td>
              <td className="text-muted" style={{ fontSize: 10 }}>{l.metadata ? JSON.stringify(l.metadata) : ""}</td>
            </tr>
          ))}
        </Table>
        {logs.length === 0 && <div className="empty">No audit logs recorded</div>}
      </article>
    </Page>
  );
}

/*  PURCHASES  */
function Purchases() {
  const [products, setProducts] = useState<Product[]>([]); const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [rows, setRows] = useState<any[]>([]);
  const [productId, setProductId] = useState(""); const [supplierId, setSupplierId] = useState(""); const [quantity, setQuantity] = useState("1"); const [unitPrice, setUnitPrice] = useState(""); const [invoice, setInvoice] = useState(""); const [error, setError] = useState<unknown>();
  const load = () => Promise.all([api("/api/products"), api("/api/suppliers"), api("/api/purchases")]).then(([p, s, r]) => { setProducts(p); setSuppliers(s); setRows(r); }).catch(setError);
  useEffect(() => { load(); }, []);
  const submit = async (e: FormEvent) => { e.preventDefault(); try { await api("/api/purchases", { method: "POST", body: JSON.stringify({ supplierId: supplierId || undefined, invoiceNumber: invoice, items: [{ productId, quantity: Number(quantity), unitPrice: Number(unitPrice) }] }) }); setInvoice(""); load(); } catch (e) { setError(e); } };
  return (
    <Page title="Purchases" eyebrow="Stock Receiving">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={submit}>
          <h2>Receive Stock Purchase</h2>
          <Field label="Supplier Invoice #" required value={invoice} onChange={(e: any) => setInvoice(e.target.value)} />
          <Select label="Supplier" value={supplierId} onChange={(e: any) => setSupplierId(e.target.value)}><option value="">Direct purchase</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select label="Product" required value={productId} onChange={(e: any) => { setProductId(e.target.value); const p = products.find(x => x.id === e.target.value); if (p) setUnitPrice(String(p.purchasePrice)); }}><option value="">Choose Product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <div className="form-grid"><Field label="Quantity" type="number" min="1" required value={quantity} onChange={(e: any) => setQuantity(e.target.value)} /><Field label="Unit Cost ()" type="number" min="0" required value={unitPrice} onChange={(e: any) => setUnitPrice(e.target.value)} /></div>
          <Button className="primary wide">Receive Stock & Add to Inventory</Button>
        </form>
        <article className="panel table-panel">
          <Table headers={["Invoice", "Supplier", "Total", "Date"]}>{rows.map(r => <tr key={r.id}><td><strong>{r.invoiceNumber}</strong></td><td className="text-muted">{r.supplier?.name || "Direct"}</td><td style={{ fontWeight: 700 }}>{money(r.total)}</td><td className="text-muted">{new Date(r.createdAt).toLocaleDateString()}</td></tr>)}</Table>
        </article>
      </div>
    </Page>
  );
}

/*  SUPPLIERS  */
function Suppliers() {
  const [rows, setRows] = useState<Supplier[]>([]); const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", gstin: "" }); const [error, setError] = useState<unknown>();
  const load = () => api("/api/suppliers").then(setRows).catch(setError); useEffect(() => { load(); }, []);
  const create = async (e: FormEvent) => { e.preventDefault(); try { await api("/api/suppliers", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", phone: "", email: "", address: "", gstin: "" }); load(); } catch (e) { setError(e); } };
  return (
    <Page title="Suppliers Directory" eyebrow="Supplier Management">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={create}><h2>Add Supplier</h2><Field label="Business Name *" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><Field label="Phone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} /><Field label="Email" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} /><Field label="GSTIN" value={form.gstin} onChange={(e: any) => setForm({ ...form, gstin: e.target.value })} /><Button className="primary wide">Save Supplier</Button></form>
        <article className="panel table-panel"><Table headers={["Supplier", "Phone", "Email", "GSTIN", "Purchases Count"]}>{rows.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td><td className="text-muted">{r.phone || ""}</td><td className="text-muted">{r.email || ""}</td><td className="text-muted">{r.gstin || ""}</td><td style={{ fontWeight: 700 }}>{r._count?.purchases || 0}</td></tr>)}</Table></article>
      </div>
    </Page>
  );
}

/*  EXPENSES  */
const EXPENSE_CATS = ["Rent", "Utilities", "Salary", "Maintenance", "Transport", "Packaging", "Marketing", "Miscellaneous"];
function Expenses() {
  const [rows, setRows] = useState<any[]>([]); const [form, setForm] = useState({ categoryName: "", amount: "", description: "" }); const [error, setError] = useState<unknown>();
  const load = () => api("/api/expenses").then(setRows).catch(setError); useEffect(() => { load(); }, []);
  const create = async (e: FormEvent) => { e.preventDefault(); try { await api("/api/expenses", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); setForm({ categoryName: "", amount: "", description: "" }); load(); } catch (e) { setError(e); } };
  return (
    <Page title="Expenses Tracker" eyebrow="Financial Management">
      <ErrorState error={error} />
      <div className="split-grid">
        <form className="panel form-panel" onSubmit={create}>
          <h2>Record Expense</h2>
          <div className="field"><span>Category</span><div className="category-presets">{EXPENSE_CATS.map(c => <button type="button" key={c} className="cat-preset" onClick={() => setForm({ ...form, categoryName: c })}>{c}</button>)}</div><input className="input" placeholder="Or type custom" required value={form.categoryName} onChange={(e: any) => setForm({ ...form, categoryName: e.target.value })} style={{ marginTop: 6 }} /></div>
          <Field label="Amount () *" type="number" min="0" required value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} />
          <Field label="Description" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} />
          <Button className="primary wide">Save Expense</Button>
        </form>
        <article className="panel table-panel"><Table headers={["Category", "Description", "Amount", "Date"]}>{rows.map(r => <tr key={r.id}><td><span className="info-pill">{r.categoryName}</span></td><td className="text-muted">{r.description || ""}</td><td style={{ fontWeight: 700 }}>{money(r.amount)}</td><td className="text-muted">{new Date(r.createdAt).toLocaleDateString()}</td></tr>)}</Table></article>
      </div>
    </Page>
  );
}

/*  REPORTS  */
function Reports() {
  const [data, setData] = useState<any>(); const [error, setError] = useState<unknown>();
  useEffect(() => { api("/api/reports/summary").then(setData).catch(setError); }, []);
  const items = data ? [
    { label: "Revenue", value: data.revenue, cls: "neutral" },
    { label: "COGS", value: data.cogs, cls: "neutral" },
    { label: "Gross Profit", value: data.grossProfit, cls: Number(data.grossProfit) >= 0 ? "positive" : "negative" },
    { label: "Expenses", value: data.expenses, cls: "neutral" },
    { label: "Net Profit", value: data.netProfit, cls: Number(data.netProfit) >= 0 ? "positive" : "negative" },
  ] : [];
  return (
    <Page title="Reports & P&L Analytics" eyebrow="Financial Management">
      <ErrorState error={error} />
      {data ? (
        <>
          <div className="reports-row">{items.map(({ label, value, cls }) => <div key={label} className={`report-card ${cls}`}><div className="rc-label">{label}</div><div className="rc-value">{money(Number(value))}</div></div>)}</div>
          <div className="panel">
            <h2>Financial P&L Breakdown</h2>
            {[
              { label: "Total Sales Revenue", value: data.revenue, pct: 100, color: "var(--brand)" },
              { label: "Cost of Goods Sold (COGS)", value: data.cogs, pct: data.revenue ? (data.cogs / data.revenue) * 100 : 0, color: "var(--amber)" },
              { label: "Operating Expenses", value: data.expenses, pct: data.revenue ? (data.expenses / data.revenue) * 100 : 0, color: "var(--red)" },
              { label: "Net Profit", value: data.netProfit, pct: data.revenue ? (data.netProfit / data.revenue) * 100 : 0, color: "var(--green)" },
            ].map(({ label, value, pct, color }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, fontWeight: 600 }}><span>{label}</span><span>{money(Number(value))}</span></div>
                <div style={{ background: "var(--surface-alt)", borderRadius: 99, height: 6, overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, borderRadius: 99, transition: "width .5s" }} /></div>
              </div>
            ))}
          </div>
        </>
      ) : <div className="loading">Loading financial reports</div>}
    </Page>
  );
}

/*  CASHIERS & COUNTERS  */
const ALL_PERMISSIONS = [
  { code: "PRODUCT_VIEW", label: "View Products" },
  { code: "PRODUCT_CREATE", label: "Add Products" },
  { code: "PRODUCT_EDIT", label: "Edit Products" },
  { code: "PRODUCT_DELETE", label: "Delete Products" },
  { code: "CATEGORY_MANAGE", label: "Manage Categories" },
  { code: "CUSTOMER_VIEW", label: "View Customers" },
  { code: "CUSTOMER_CREATE", label: "Add Customers" },
  { code: "CUSTOMER_EDIT", label: "Edit Customers" },
  { code: "CUSTOMER_CREDIT", label: "Customer Credit" },
  { code: "BILL_CREATE", label: "Create Bills" },
  { code: "BILL_VIEW", label: "View Sales" },
  { code: "BILL_DISCOUNT", label: "Apply Discounts" },
  { code: "REFUND_CREATE", label: "Process Returns" },
  { code: "INVENTORY_VIEW", label: "View Inventory" },
  { code: "INVENTORY_ADJUST", label: "Adjust Stock" },
  { code: "PURCHASE_CREATE", label: "Receive Stock" },
  { code: "SUPPLIER_VIEW", label: "View Suppliers" },
  { code: "SUPPLIER_CREATE", label: "Add Suppliers" },
  { code: "EXPENSE_MANAGE", label: "Record Expenses" },
  { code: "OFFER_MANAGE", label: "Manage Offers" },
  { code: "REPORT_VIEW", label: "View Reports" },
  { code: "CASHIER_MANAGE", label: "Manage Cashiers" },
  { code: "SETTINGS_MANAGE", label: "System Settings" },
];

function Cashiers() {
  const [rows, setRows] = useState<any[]>([]);
  const [counters, setCounters] = useState<any[]>([]);
  const [error, setError] = useState<unknown>();
  const [newCounter, setNewCounter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", counterId: "", permissions: [] as string[] });
  const [saving, setSaving] = useState(false);

  const load = () => Promise.all([api("/api/cashiers"), api("/api/counters")]).then(([u, c]) => { setRows(u); setCounters(c); }).catch(setError);
  useEffect(() => { load(); }, []);

  const toggle = async (u: any) => {
    try { await api(`/api/cashiers/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) }); load(); }
    catch (e) { setError(e); }
  };

  const createCounter = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCounter.trim()) return;
    try { await api("/api/counters", { method: "POST", body: JSON.stringify({ name: newCounter }) }); setNewCounter(""); load(); }
    catch (e) { setError(e); }
  };

  const openAdd = () => {
    setForm({ name: "", email: "", password: "", counterId: "", permissions: ["BILL_CREATE", "BILL_VIEW", "CUSTOMER_VIEW", "PRODUCT_VIEW", "INVENTORY_VIEW"] });
    setEditUser(null);
    setShowAddForm(true);
  };

  const openEdit = (u: any) => {
    setForm({ name: u.name, email: u.email, password: "", counterId: u.counterId || "", permissions: (u.permissions || []).filter((p: any) => p.enabled).map((p: any) => p.permission.code) });
    setEditUser(u);
    setShowAddForm(true);
  };

  const togglePerm = (code: string) => {
    setForm(f => ({ ...f, permissions: f.permissions.includes(code) ? f.permissions.filter(x => x !== code) : [...f.permissions, code] }));
  };

  const saveCashier = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { name: form.name, counterId: form.counterId || undefined, permissions: form.permissions };
      if (!editUser) { payload.email = form.email; payload.password = form.password; }
      if (form.password && editUser) payload.password = form.password;
      if (editUser) {
        await api(`/api/cashiers/${editUser.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/cashiers", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowAddForm(false);
      load();
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };

  const CASHIER_PRESET = ["BILL_CREATE", "BILL_VIEW", "CUSTOMER_VIEW", "PRODUCT_VIEW", "INVENTORY_VIEW", "CUSTOMER_CREATE"];
  const SENIOR_PRESET = [...CASHIER_PRESET, "BILL_DISCOUNT", "REFUND_CREATE", "EXPENSE_MANAGE", "CUSTOMER_EDIT", "CUSTOMER_CREDIT"];

  return (
    <Page title="Cashiers & Checkout Counters" eyebrow="Staff Management"
      action={<Button className="primary" onClick={openAdd}>+ Add Cashier</Button>}>
      <ErrorState error={error} />

      {/* Counters creation */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <form onSubmit={createCounter} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Field label="Add New Checkout Counter" placeholder="e.g. Counter 03" value={newCounter} onChange={(e: any) => setNewCounter(e.target.value)} />
          <Button className="primary">Create Counter</Button>
        </form>
      </div>

      {/* Counter status grid */}
      {counters.length > 0 && (
        <div className="counter-grid" style={{ marginBottom: 14 }}>
          {counters.map(ct => {
            const assigned = rows.filter(r => r.counterId === ct.id);
            return (
              <div className={`counter-card ${assigned.some(a => a.active) ? "open" : "closed"}`} key={ct.id}>
                <div className="cc-head"><span className="cc-name">{ct.name}</span><span className={`cc-status ${assigned.some(a => a.active) ? "online" : "offline"}`}>{assigned.some(a => a.active) ? "Active" : "Idle"}</span></div>
                <div className="cc-cashier">{assigned.length > 0 ? assigned.map(a => a.name).join(", ") : "Unassigned"}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cashiers table */}
      <article className="panel table-panel">
        <Table headers={["Name", "Email", "Counter", "Permissions", "Status", "Actions"]}>
          {rows.map(u => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong></td>
              <td className="text-muted">{u.email}</td>
              <td>{u.counter?.name || <span className="text-muted">Unassigned</span>}</td>
              <td><span className="badge info">{(u.permissions || []).filter((p: any) => p.enabled).length} perms</span></td>
              <td>{u.active ? <span className="badge success">Active</span> : <span className="badge warning">Disabled</span>}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <Button className="ghost" onClick={() => openEdit(u)}>Edit</Button>
                <Button className={u.active ? "ghost" : "primary"} onClick={() => toggle(u)}>{u.active ? "Disable" : "Enable"}</Button>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 && <div className="empty">No cashiers added yet</div>}
      </article>

      {/* Add/Edit Cashier Modal */}
      {showAddForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddForm(false); }}>
          <div className="modal" style={{ maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
            <h2>{editUser ? `Edit ${editUser.name}` : "Add New Cashier"}</h2>
            <form onSubmit={saveCashier}>
              <div className="form-grid">
                <Field label="Full Name *" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
                {!editUser && <Field label="Email *" type="email" required value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />}
              </div>
              <div className="form-grid">
                <Field label={editUser ? "New Password (leave blank to keep)" : "Password * (min 8 chars)"} type="password" required={!editUser} minLength={editUser ? 0 : 8} value={form.password} onChange={(e: any) => setForm({ ...form, password: e.target.value })} />
                <Select label="Assign Counter" value={form.counterId} onChange={(e: any) => setForm({ ...form, counterId: e.target.value })}>
                  <option value="">No counter assigned</option>
                  {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>Permissions</strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="cat-preset" onClick={() => setForm(f => ({ ...f, permissions: CASHIER_PRESET }))}>Cashier Preset</button>
                    <button type="button" className="cat-preset" onClick={() => setForm(f => ({ ...f, permissions: SENIOR_PRESET }))}>Senior Cashier</button>
                    <button type="button" className="cat-preset" onClick={() => setForm(f => ({ ...f, permissions: ALL_PERMISSIONS.map(p => p.code) }))}>All</button>
                    <button type="button" className="cat-preset" style={{ background: "var(--red)", color: "#fff" }} onClick={() => setForm(f => ({ ...f, permissions: [] }))}>Clear</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>
                      <input type="checkbox" checked={form.permissions.includes(p.code)} onChange={() => togglePerm(p.code)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 16 }}>
                <Button type="button" className="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button type="submit" className="primary" disabled={saving}>{saving ? "Saving..." : editUser ? "Save Changes" : "Create Cashier"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/*  SETTINGS  */
function Settings({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [shop, setShop] = useState<any>(); const [error, setError] = useState<unknown>(); const [saved, setSaved] = useState(false);
  useEffect(() => { api("/api/shop").then(setShop).catch(setError); }, []);
  const save = async (e: FormEvent) => { e.preventDefault(); try { setShop(await api("/api/shop", { method: "PATCH", body: JSON.stringify(shop) })); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch (e) { setError(e); } };
  if (!shop) return <Page title="Settings"><div className="loading">Loading settings</div></Page>;
  return (
    <Page title="System Settings" eyebrow="Supermarket Setup">
      <ErrorState error={error} />
      {saved && <div className="success">Settings saved successfully</div>}
      
      <div className="panel" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-2)", padding: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px" }}>&#x1F5A8; Thermal Printer & Receipt Customizer</h3>
          <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "13px" }}>Configure paper width (58mm/80mm), receipt header, logo, item columns, and live receipt preview.</p>
        </div>
        {onNavigate && (
          <Button className="primary" onClick={() => onNavigate("Printer Settings")}>
            Open Printer Settings &rarr;
          </Button>
        )}
      </div>

      <form className="panel form-panel settings-form" onSubmit={save}>
        <h2>Store & Supermarket Profile</h2>
        <Field label="Store Name" required value={shop.name} onChange={(e: any) => setShop({ ...shop, name: e.target.value })} />
        <Field label="Address" value={shop.address || ""} onChange={(e: any) => setShop({ ...shop, address: e.target.value })} />
        <div className="form-grid"><Field label="Phone" value={shop.phone || ""} onChange={(e: any) => setShop({ ...shop, phone: e.target.value })} /><Field label="Invoice Prefix" required value={shop.invoicePrefix} onChange={(e: any) => setShop({ ...shop, invoicePrefix: e.target.value })} /></div>
        <Field label="GSTIN" value={shop.gstin || ""} onChange={(e: any) => setShop({ ...shop, gstin: e.target.value })} />
        <Field label="Email" type="email" value={shop.email || ""} onChange={(e: any) => setShop({ ...shop, email: e.target.value })} />
        <Button className="primary">Save Settings</Button>
      </form>
    </Page>
  );
}

/*  ADMIN DASHBOARD (OWNER)  */
function AdminDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<unknown>();
  const [tab, setTab] = useState<"overview" | "counters" | "alerts" | "health">("overview");
  const [backingUp, setBackingUp] = useState(false);

  const load = async () => {
    try {
      const [d, a, h] = await Promise.all([
        api("/api/admin/dashboard"),
        api("/api/admin/alerts"),
        api("/api/admin/data-health"),
      ]);
      setData(d); setAlerts(a.alerts); setHealth(h);
    } catch (e) { setError(e); }
  };

  useEffect(() => { load(); }, []);

  const downloadBackup = async () => {
    setBackingUp(true);
    try {
      const backup = await api("/api/admin/backup");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e); }
    finally { setBackingUp(false); }
  };

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const warningAlerts = alerts.filter(a => a.severity === "warning");

  const kpi = (label: string, value: string, sub?: string, color?: string) => (
    <div className="panel" style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || "var(--text)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <Page title="Owner Dashboard" eyebrow="Administration"
      action={
        <div style={{ display: "flex", gap: 8 }}>
          <Button className="ghost" onClick={load}>↻ Refresh</Button>
          <Button className="primary" onClick={downloadBackup} disabled={backingUp}>{backingUp ? "Exporting..." : "⬇ Export Backup"}</Button>
        </div>
      }>
      <ErrorState error={error} />

      {/* Alert banner */}
      {criticalAlerts.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>🔴</span>
          <span style={{ color: "#ef4444", fontWeight: 600, fontSize: 13 }}>{criticalAlerts.length} critical alert{criticalAlerts.length > 1 ? "s" : ""} require attention</span>
          <button style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 600, fontSize: 12 }} onClick={() => setTab("alerts")}>View Alerts →</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {(["overview", "counters", "alerts", "health"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 18px", background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent", color: tab === t ? "var(--brand)" : "var(--text-muted)", cursor: "pointer", fontWeight: tab === t ? 700 : 500, fontSize: 13, textTransform: "capitalize", transition: "all .2s" }}>
            {t === "alerts" && criticalAlerts.length > 0 ? `Alerts 🔴${criticalAlerts.length}` : t}
          </button>
        ))}
      </div>

      {!data ? <div className="loading">Loading dashboard data...</div> : (
        <>
          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {kpi("Today Revenue", `₹${money(data.today.revenue)}`, `${data.today.orders} bills`, "var(--brand)")}
                {kpi("This Week", `₹${money(data.week.revenue)}`, `${data.week.orders} bills`)}
                {kpi("This Month", `₹${money(data.month.revenue)}`, `${data.month.orders} bills`)}
                {kpi("Stock Value", `₹${money(data.inventory.stockValuation)}`, `${data.inventory.total} products`)}
                {kpi("Out of Stock", String(data.inventory.outOfStock), `${data.inventory.lowStock} low`, data.inventory.outOfStock > 0 ? "var(--red)" : "var(--green)")}
                {kpi("Active Shifts", String(data.activeShifts), `${data.counters.length} counters`)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Today's sales by cashier */}
                <div className="panel">
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Today — Sales by Cashier</h3>
                  {data.cashierStats.length === 0 ? <div className="empty" style={{ fontSize: 12 }}>No sales today</div> : data.cashierStats.map((cs: any) => (
                    <div key={cs.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <span>{cs.name}</span>
                      <strong style={{ color: "var(--brand)" }}>₹{money(cs.total)}</strong>
                    </div>
                  ))}
                </div>

                {/* Payment method breakdown */}
                <div className="panel">
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Today — Payment Breakdown</h3>
                  {Object.keys(data.paymentBreakdown).length === 0 ? <div className="empty" style={{ fontSize: 12 }}>No payments today</div> : Object.entries(data.paymentBreakdown).map(([method, amount]: any) => (
                    <div key={method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <span className="badge info">{method}</span>
                      <strong>₹{money(amount)}</strong>
                    </div>
                  ))}
                </div>

                {/* Low stock */}
                <div className="panel">
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Low Stock Products</h3>
                  {data.lowStockProducts.length === 0 ? <div className="empty" style={{ fontSize: 12, color: "var(--green)" }}>✓ All stock levels healthy</div> : data.lowStockProducts.map((p: any) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <div><div style={{ fontWeight: 600 }}>{p.name}</div><div className="text-muted">{p.sku}</div></div>
                      <span className={`badge ${Number(p.stock) <= 0 ? "danger" : "warning"}`}>{Number(p.stock) <= 0 ? "OUT" : `${p.stock} left`}</span>
                    </div>
                  ))}
                </div>

                {/* Expiring soon */}
                <div className="panel">
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Expiring Soon (30 days)</h3>
                  {data.expiringSoon.length === 0 ? <div className="empty" style={{ fontSize: 12, color: "var(--green)" }}>✓ No products expiring soon</div> : data.expiringSoon.map((p: any) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <div><div style={{ fontWeight: 600 }}>{p.name}</div><div className="text-muted">{p.sku}</div></div>
                      <div style={{ textAlign: "right" }}>
                        <div className="badge warning">{p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : ""}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>{p.stock} in stock</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent transactions */}
              <div className="panel table-panel" style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Today — Recent Transactions</h3>
                {data.recentSales.length === 0 ? <div className="empty">No sales today</div> : (
                  <Table headers={["Invoice", "Cashier", "Total", "Time"]}>
                    {data.recentSales.map((s: any) => (
                      <tr key={s.id}>
                        <td><code>{s.invoiceNumber}</code></td>
                        <td>{s.cashier}</td>
                        <td style={{ fontWeight: 700, color: "var(--brand)" }}>₹{money(s.total)}</td>
                        <td className="text-muted">{new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            </>
          )}

          {/* ── COUNTERS TAB ── */}
          {tab === "counters" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {data.counters.length === 0 ? <div className="empty">No counters configured. <button style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer" }} onClick={() => onNavigate("Cashiers")}>Go to Cashiers →</button></div> : data.counters.map((ct: any) => (
                <div className="panel" key={ct.id} style={{ borderLeft: `3px solid ${ct.activeShift ? "var(--green)" : "var(--border)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>{ct.name}</strong>
                    <span className={`badge ${ct.activeShift ? "success" : "neutral"}`}>{ct.activeShift ? "OPEN" : "CLOSED"}</span>
                  </div>
                  {ct.activeShift ? (
                    <div style={{ fontSize: 12 }}>
                      <div><span className="text-muted">Cashier:</span> <strong>{ct.activeShift.user?.name}</strong></div>
                      <div><span className="text-muted">Shift since:</span> {new Date(ct.activeShift.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {ct.assignedCashiers.length > 0 ? `Assigned: ${ct.assignedCashiers.map((c: any) => c.name).join(", ")}` : "No cashier assigned"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── ALERTS TAB ── */}
          {tab === "alerts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{
                  padding: "12px 16px", borderRadius: 10, display: "flex", gap: 12, alignItems: "flex-start",
                  background: a.severity === "critical" ? "rgba(239,68,68,0.1)" : a.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                  border: `1px solid ${a.severity === "critical" ? "rgba(239,68,68,0.3)" : a.severity === "warning" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.3)"}`
                }}>
                  <span style={{ fontSize: 20 }}>{a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🟢"}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: a.severity === "critical" ? "#ef4444" : a.severity === "warning" ? "#f59e0b" : "#3b82f6", textTransform: "uppercase" }}>{a.type.replace(/_/g, " ")}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

/*  DATA HEALTH CHECKER  */
function DataHealth() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api("/api/admin/data-health")); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const scoreColor = !data ? "#888" : data.score >= 90 ? "var(--green)" : data.score >= 70 ? "var(--amber)" : "var(--red)";

  return (
    <Page title="Data Health & Integrity" eyebrow="System Reliability"
      action={<Button className="primary" onClick={load}>↻ Re-check Now</Button>}>
      <ErrorState error={error} />
      {loading && <div className="loading">Running data health checks...</div>}
      {data && (
        <>
          {/* Score card */}
          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", border: `5px solid ${scoreColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{data.score}</span>
            </div>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>Health Score: {data.score}/100</h2>
              <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
                {data.score >= 90 ? "Excellent — all systems healthy" : data.score >= 70 ? "Good — minor issues detected" : "Needs attention — critical issues found"}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Last checked: {new Date(data.checkedAt).toLocaleString()}</p>
            </div>
          </div>

          {/* Issues list */}
          {data.issues.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 32, color: "var(--green)" }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>All checks passed. Your data is clean!</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.issues.map((issue: any, i: number) => (
                <div key={i} style={{
                  padding: "12px 16px", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: issue.severity === "critical" ? "rgba(239,68,68,0.1)" : issue.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.08)",
                  border: `1px solid ${issue.severity === "critical" ? "rgba(239,68,68,0.3)" : issue.severity === "warning" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.2)"}`
                }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 18 }}>{issue.severity === "critical" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                    <div>
                      <span className={`badge ${issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "info"}`} style={{ marginRight: 6 }}>{issue.category}</span>
                      <span style={{ fontSize: 13 }}>{issue.description}</span>
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 18, color: issue.severity === "critical" ? "var(--red)" : "var(--amber)", marginLeft: 12 }}>{issue.count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

/*  NAVIGATION  */
type NavItem = { label: string; icon: string; section?: string; adminOnly?: boolean };
const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", icon: "", section: "OPERATIONS" },
  { label: "Billing", icon: "" },
  { label: "Sales", icon: "" },
  { label: "Products", icon: "", section: "CATALOGUE" },
  { label: "Categories", icon: "" },
  { label: "Inventory", icon: "" },
  { label: "Purchases", icon: "" },
  { label: "Suppliers", icon: "" },
  { label: "Customers", icon: "", section: "CUSTOMERS" },
  { label: "Shifts", icon: "", section: "REGISTERS & PROMOS" },
  { label: "Offers", icon: "" },
  { label: "Expenses", icon: "", section: "BUSINESS" },
  { label: "Reports", icon: "" },
  { label: "Owner Dashboard", icon: "", section: "ADMINISTRATION" },
  { label: "Cashiers", icon: "" },
  { label: "Audit Log", icon: "" },
  { label: "Data Health", icon: "" },
  { label: "Settings", icon: "", section: "SYSTEM" },
  { label: "Printer Settings", icon: "" },
];
const CASHIER_NAV: NavItem[] = [
  { label: "My Shift", icon: "", section: "SHIFT" },
  { label: "Billing", icon: "" },
  { label: "Sales", icon: "" },
  { label: "Customers", icon: "", section: "CUSTOMERS" },
  { label: "Inventory", icon: "" },
  { label: "Shifts", icon: "" },
];

/*  APP SHELL  */
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState("Billing");

  // On mount: restore session and always start on Billing
  useEffect(() => {
    if (localStorage.getItem("pos_token")) {
      api("/api/me")
        .then(u => { setUser(u); setPage("Billing"); })
        .catch(() => localStorage.removeItem("pos_token"));
    }
  }, []);

  const handleLogin = (u: User) => { setUser(u); setPage("Billing"); };
  const handleLogout = () => { localStorage.removeItem("pos_token"); setUser(null); setPage("Billing"); };

  if (!user) return <Login onLogin={handleLogin} />;

  const admin = user.role === "ADMIN";
  const navItems = admin ? ADMIN_NAV : CASHIER_NAV;

  // Billing screen gets full-width (no sidebar)
  const isBilling = page === "Billing";

  const screens: Record<string, ReactNode> = {
    Billing: <Billing user={user} onNavigate={setPage} />,
    Dashboard: <Dashboard onNavigate={setPage} />,
    "My Shift": <CashierDashboard user={user} onNavigate={setPage} />,
    Sales: <Sales />,
    Inventory: <Inventory />,
    Products: <Products />,
    Categories: <Categories />,
    Customers: <Customers />,
    Purchases: <Purchases />,
    Suppliers: <Suppliers />,
    Shifts: <Shifts user={user} />,
    Offers: <Offers />,
    Expenses: <Expenses />,
    Reports: <Reports />,
    Cashiers: <Cashiers />,
    "Owner Dashboard": <AdminDashboard onNavigate={setPage} />,
    "Data Health": <DataHealth />,
    "Audit Log": <AuditLogs />,
    Settings: <Settings onNavigate={setPage} />,
    "Printer Settings": <PrinterSettings api={api} userRole={user.role} />,
  };

  if (isBilling) {
    // Full-screen POS mode: no sidebar, Billing takes 100vw
    return (
      <div className="pos-full-shell">
        {screens["Billing"]}
      </div>
    );
  }

  // Other pages use sidebar layout
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">SM</div>
          <div><strong>SuperMarket POS</strong><small>{admin ? "Admin" : "Cashier"}</small></div>
        </div>
        <nav>
          {navItems.map((item) => (
            <div key={item.label}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <button className={page === item.label ? "active" : ""} onClick={() => setPage(item.label)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="profile">
          <strong>{user.name}</strong>
          <small>{user.role.toLowerCase()}</small>
          <button onClick={() => setPage('Billing')} style={{ color: 'var(--sb-active)', opacity: 1, marginBottom: 2 }}> Back to POS</button>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      <main className="content">{screens[page] || <Page title="Not Found"><div className="empty">Page not found</div></Page>}</main>
    </div>
  );
}
