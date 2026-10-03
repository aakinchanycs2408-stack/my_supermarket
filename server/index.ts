import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Role, PaymentMethod, InventoryMovementType, Prisma } from "@prisma/client";
import { z } from "zod";

const db = new PrismaClient(), app = express();
const production = process.env.NODE_ENV === "production";
const SECRET = process.env.JWT_SECRET;
if (production && (!SECRET || SECRET.length < 32)) throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
const jwtSecret = SECRET || crypto.randomBytes(32).toString("hex");
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(origin => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => console.log(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Try again later." } });

type Auth = { userId: string; shopId: string; role: Role; counterId?: string };
const getAuth = (req: express.Request) => (req as any).auth as Auth;

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const t = req.headers.authorization?.replace("Bearer ", "");
  if (!t) return res.status(401).json({ error: "Authentication required" });
  try {
    const claims = jwt.verify(t, jwtSecret) as { userId?: string };
    if (!claims.userId) return res.status(401).json({ error: "Invalid or expired session" });
    db.user.findUnique({ where: { id: claims.userId }, select: { id: true, shopId: true, role: true, active: true, counterId: true } })
      .then(user => {
        if (!user || !user.active) return res.status(401).json({ error: "Account is inactive or unavailable" });
        (req as any).auth = { userId: user.id, shopId: user.shopId, role: user.role, counterId: user.counterId };
        next();
      })
      .catch(() => res.status(503).json({ error: "Authentication service unavailable" }));
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

async function allowed(a: Auth, code: string) {
  if (a.role === Role.ADMIN) return true;
  return !!await db.userPermission.findFirst({ where: { userId: a.userId, permission: { code }, enabled: true } });
}

const perm = (code: string) => async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (await allowed(getAuth(req), code)) return next();
  res.status(403).json({ error: `Missing permission: ${code}` });
};
const admin = perm("USER_MANAGE");

/* ── Health Checks ─────────────────────────────────────── */
app.get("/api/health", async (_, r) => {
  try { await db.$queryRaw`SELECT 1`; r.json({ ok: true, database: "connected", environment: process.env.NODE_ENV || "development" }); }
  catch { r.status(503).json({ ok: false, database: "unavailable", environment: process.env.NODE_ENV || "development" }); }
});
app.get("/api/health/db", async (_, r) => {
  try { await db.$queryRaw`SELECT 1`; r.json({ ok: true, database: "connected" }); }
  catch { r.status(503).json({ ok: false, database: "unavailable" }); }
});

/* ── Auth Routes ───────────────────────────────────────── */
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const p = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid credentials" });
  try {
    const u = await db.user.findUnique({ where: { email: p.data.email } });
    if (!u || !u.active || !(await bcrypt.compare(p.data.password, u.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
    const token = jwt.sign({ userId: u.id }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" } as jwt.SignOptions);
    await db.auditLog.create({ data: { shopId: u.shopId, userId: u.id, action: "USER_LOGIN", entity: "User", entityId: u.id } });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, shopId: u.shopId } });
  } catch {
    res.status(503).json({ error: "Database unavailable. Check the server database configuration." });
  }
});
app.get("/api/me", auth, async (req, res) => res.json(await db.user.findUnique({ where: { id: getAuth(req).userId }, select: { id: true, name: true, email: true, role: true, shopId: true } })));

/* ── Categories API (Hierarchical) ─────────────────────── */
app.get("/api/categories", auth, async (req, res) => {
  const a = getAuth(req);
  res.json(await db.category.findMany({
    where: { shopId: a.shopId },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      _count: { select: { products: true } }
    },
    orderBy: { name: "asc" }
  }));
});
app.post("/api/categories", auth, perm("CATEGORY_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ name: z.string().min(1), parentId: z.string().nullable().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid category name" });
  try {
    const cat = await db.category.create({ data: { shopId: a.shopId, name: p.data.name, parentId: p.data.parentId || null } });
    res.status(201).json(cat);
  } catch {
    res.status(409).json({ error: "Category name already exists" });
  }
});
app.delete("/api/categories/:id", auth, perm("CATEGORY_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  // Prevent deletion if category has products
  const productCount = await db.product.count({ where: { categoryId: String(req.params.id), shopId: a.shopId } });
  if (productCount > 0) return res.status(409).json({ error: `Cannot delete: ${productCount} product(s) are assigned to this category. Reassign them first.` });
  // Also prevent deletion if category has subcategories
  const childCount = await db.category.count({ where: { parentId: String(req.params.id), shopId: a.shopId } });
  if (childCount > 0) return res.status(409).json({ error: `Cannot delete: this category has ${childCount} subcategory/subcategories. Delete them first.` });
  const x = await db.category.deleteMany({ where: { id: String(req.params.id), shopId: a.shopId } });
  if (!x.count) return res.status(404).json({ error: "Category not found" });
  res.json({ ok: true });
});


app.get("/api/products", auth, perm("PRODUCT_VIEW"), async (req, res) => {
  const a = getAuth(req);
  const q = String(req.query.q || "").trim();
  const categoryId = req.query.category ? String(req.query.category) : undefined;
  const brand = req.query.brand ? String(req.query.brand) : undefined;
  const stockStatus = req.query.stockStatus ? String(req.query.stockStatus) : undefined;
  const activeOnly = req.query.active !== "false" && req.query.active !== "all";

  const where: any = { shopId: a.shopId };
  if (activeOnly) where.active = true;
  if (categoryId) where.categoryId = categoryId;
  if (brand) where.brand = brand;

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { sku: { contains: q } },
      { barcode: { contains: q } },
      { brand: { contains: q } }
    ];
  }

  let products = await db.product.findMany({
    where,
    include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 500
  });

  if (stockStatus === "low") {
    products = products.filter(p => Number(p.stock) <= Number(p.minimumStock) && Number(p.stock) > 0);
  } else if (stockStatus === "out") {
    products = products.filter(p => Number(p.stock) <= 0);
  } else if (stockStatus === "in") {
    products = products.filter(p => Number(p.stock) > Number(p.minimumStock));
  }

  res.json(products);
});

app.post("/api/products", auth, perm("PRODUCT_CREATE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({
    sku: z.string().min(1),
    barcode: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    brand: z.string().optional(),
    unit: z.string().default("pcs"),
    purchasePrice: z.coerce.number().nonnegative(),
    sellingPrice: z.coerce.number().nonnegative(),
    mrp: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(100).default(0),
    stock: z.coerce.number().nonnegative().default(0),
    minimumStock: z.coerce.number().nonnegative().default(0),
    categoryId: z.string().optional(),
    subcategoryId: z.string().optional(),
    supplierId: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    imageUrl: z.string().optional(),
  }).safeParse(req.body);

  if (!p.success) return res.status(400).json({ error: "Invalid product data" });

  try {
    const x = await db.product.create({ data: { ...p.data, shopId: a.shopId } });
    await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "PRODUCT_CREATED", entity: "Product", entityId: x.id, metadata: { name: x.name, sku: x.sku } } });
    res.status(201).json(x);
  } catch (err: any) {
    res.status(409).json({ error: "SKU or barcode already exists in database" });
  }
});

app.post("/api/products/bulk", auth, perm("PRODUCT_CREATE"), async (req, res) => {
  const a = getAuth(req);
  const items = Array.isArray(req.body) ? req.body : [];
  if (!items.length) return res.status(400).json({ error: "No products provided for bulk import" });

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.name || !item.sku || item.sellingPrice === undefined) { skipped++; continue; }
    try {
      await db.product.create({
        data: {
          shopId: a.shopId,
          sku: String(item.sku).trim(),
          barcode: item.barcode ? String(item.barcode).trim() : undefined,
          name: String(item.name).trim(),
          brand: item.brand ? String(item.brand).trim() : undefined,
          purchasePrice: Number(item.purchasePrice || 0),
          sellingPrice: Number(item.sellingPrice || 0),
          mrp: item.mrp ? Number(item.mrp) : undefined,
          stock: Number(item.stock || 0),
          minimumStock: Number(item.minimumStock || 0),
          unit: item.unit || "pcs"
        }
      });
      inserted++;
    } catch {
      skipped++;
    }
  }

  res.json({ inserted, skipped, total: items.length });
});

app.get("/api/products/:id", auth, perm("PRODUCT_VIEW"), async (req, res) => {
  const p = await db.product.findFirst({
    where: { id: String(req.params.id), shopId: getAuth(req).shopId },
    include: { category: { select: { name: true } }, supplier: { select: { name: true } } }
  });
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});

app.patch("/api/products/:id", auth, perm("PRODUCT_EDIT"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({
    name: z.string().min(1).optional(),
    brand: z.string().optional(),
    unit: z.string().optional(),
    sellingPrice: z.coerce.number().nonnegative().optional(),
    purchasePrice: z.coerce.number().nonnegative().optional(),
    mrp: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    minimumStock: z.coerce.number().nonnegative().optional(),
    categoryId: z.string().nullable().optional(),
    supplierId: z.string().nullable().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().nullable().optional().transform(val => val ? new Date(val) : null),
    active: z.boolean().optional()
  }).safeParse(req.body);

  if (!p.success) return res.status(400).json({ error: "Invalid update payload" });

  const x = await db.product.updateMany({ where: { id: String(req.params.id), shopId: a.shopId }, data: p.data });
  if (!x.count) return res.status(404).json({ error: "Product not found" });

  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "PRODUCT_UPDATED", entity: "Product", entityId: String(req.params.id) } });
  res.json({ ok: true });
});

app.delete("/api/products/:id", auth, perm("PRODUCT_DELETE"), async (req, res) => {
  const a = getAuth(req);
  const x = await db.product.deleteMany({ where: { id: String(req.params.id), shopId: a.shopId } });
  if (!x.count) return res.status(404).json({ error: "Product not found" });
  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "PRODUCT_DELETED", entity: "Product", entityId: String(req.params.id) } });
  res.json({ ok: true });
});


/* ── Customers & Khata (Credit Ledger) API ──────────────── */
app.get("/api/customers/search", auth, perm("CUSTOMER_VIEW"), async (req, res) => {
  const shopId = getAuth(req).shopId;
  const q = String(req.query.q || "").trim();
  if (!q) {
    const defaultCusts = await db.customer.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return res.json(defaultCusts);
  }

  const customers = await db.customer.findMany({
    where: {
      shopId,
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } }
      ]
    },
    orderBy: { name: "asc" },
    take: 30
  });
  res.json(customers);
});

app.get("/api/customers", auth, perm("CUSTOMER_VIEW"), async (req, res) => {
  res.json(await db.customer.findMany({
    where: { shopId: getAuth(req).shopId },
    include: { _count: { select: { sales: true } } },
    orderBy: { name: "asc" }
  }));
});

app.post("/api/customers", auth, perm("CUSTOMER_CREATE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    gstin: z.string().optional(),
    creditLimit: z.coerce.number().min(0).optional()
  }).safeParse(req.body);

  if (!p.success) return res.status(400).json({ error: "Invalid customer data: " + p.error.errors.map(e => e.message).join(", ") });
  
  if (p.data.phone && p.data.phone.trim()) {
    const existing = await db.customer.findFirst({
      where: { shopId: a.shopId, phone: p.data.phone.trim() }
    });
    if (existing) {
      return res.status(400).json({ error: `Customer with phone ${p.data.phone} already exists (${existing.name})` });
    }
  }

  const cust = await db.customer.create({
    data: {
      name: p.data.name,
      phone: p.data.phone?.trim() || null,
      email: p.data.email?.trim() || null,
      address: p.data.address?.trim() || null,
      gstin: p.data.gstin?.trim() || null,
      shopId: a.shopId
    }
  });
  res.status(201).json(cust);
});

/* ── Quick Access Products API ─────────────────────────── */
app.get("/api/quick-access", auth, perm("POS_ACCESS"), async (req, res) => {
  const shopId = getAuth(req).shopId;
  const items = await db.quickAccessProduct.findMany({
    where: { shopId },
    include: { product: true },
    orderBy: { displayOrder: "asc" }
  });
  res.json(items);
});

app.post("/api/quick-access", auth, perm("SETTINGS_VIEW"), async (req, res) => {
  const shopId = getAuth(req).shopId;
  const p = z.object({
    productId: z.string().min(1),
    badgeText: z.string().optional(),
    badgeColor: z.string().optional()
  }).safeParse(req.body);

  if (!p.success) return res.status(400).json({ error: "Product ID required" });

  const count = await db.quickAccessProduct.count({ where: { shopId } });
  
  const item = await db.quickAccessProduct.upsert({
    where: { shopId_productId: { shopId, productId: p.data.productId } },
    create: {
      shopId,
      productId: p.data.productId,
      displayOrder: count,
      badgeText: p.data.badgeText || null,
      badgeColor: p.data.badgeColor || null
    },
    update: {
      badgeText: p.data.badgeText || null,
      badgeColor: p.data.badgeColor || null
    },
    include: { product: true }
  });
  res.json(item);
});

app.post("/api/quick-access/reorder", auth, perm("SETTINGS_VIEW"), async (req, res) => {
  const shopId = getAuth(req).shopId;
  const p = z.object({ productIds: z.array(z.string()) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Array of productIds required" });

  await db.$transaction(
    p.data.productIds.map((pid, idx) =>
      db.quickAccessProduct.updateMany({
        where: { shopId, productId: pid },
        data: { displayOrder: idx }
      })
    )
  );
  res.json({ ok: true });
});

app.delete("/api/quick-access/:id", auth, perm("SETTINGS_VIEW"), async (req, res) => {
  const shopId = getAuth(req).shopId;
  await db.quickAccessProduct.deleteMany({
    where: { id: String(req.params.id), shopId }
  });
  res.json({ ok: true });
});

app.patch("/api/customers/:id", auth, perm("CUSTOMER_EDIT"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ name: z.string().min(1).optional(), phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), gstin: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid customer update" });
  const x = await db.customer.updateMany({ where: { id: String(req.params.id), shopId: a.shopId }, data: p.data });
  if (!x.count) return res.status(404).json({ error: "Customer not found" });
  res.json({ ok: true });
});

app.get("/api/customers/:id/ledger", auth, perm("CUSTOMER_VIEW"), async (req, res) => {
  const a = getAuth(req);
  const ledgers = await db.customerCreditLedger.findMany({
    where: { shopId: a.shopId, customerId: String(req.params.id) },
    include: { user: { select: { name: true } }, sale: { select: { invoiceNumber: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(ledgers);
});

app.post("/api/customers/:id/payment", auth, perm("CUSTOMER_CREDIT"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ amount: z.coerce.number().positive(), notes: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Valid positive payment amount required" });

  try {
    await db.$transaction(async tx => {
      const cust = await tx.customer.findFirst({ where: { id: String(req.params.id), shopId: a.shopId } });
      if (!cust) throw Error("Customer not found");

      await tx.customer.update({ where: { id: cust.id }, data: { creditBalance: { decrement: p.data.amount } } });
      await tx.customerCreditLedger.create({
        data: {
          shopId: a.shopId,
          customerId: cust.id,
          userId: a.userId,
          type: "PAYMENT_RECEIVED",
          amount: p.data.amount,
          notes: p.data.notes || "Khata debt settlement payment"
        }
      });
      await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "CREDIT_PAYMENT_RECEIVED", entity: "Customer", entityId: cust.id, metadata: { amount: p.data.amount } } });
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Staff, Cashiers & Counters API ─────────────────────── */
app.get("/api/cashiers", auth, admin, async (req, res) => res.json(await db.user.findMany({ where: { shopId: getAuth(req).shopId, role: Role.CASHIER }, select: { id: true, name: true, email: true, active: true, counterId: true, counter: { select: { name: true } }, permissions: { include: { permission: true } } } })));
app.get("/api/permissions", auth, admin, async (_, res) => res.json(await db.permission.findMany({ orderBy: { code: "asc" } })));
app.get("/api/counters", auth, async (req, res) => res.json(await db.counter.findMany({ where: { shopId: getAuth(req).shopId }, orderBy: { name: "asc" } })));
app.post("/api/counters", auth, admin, async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Counter name required" });
  res.status(201).json(await db.counter.create({ data: { shopId: a.shopId, name: p.data.name } }));
});

app.post("/api/cashiers", auth, perm("CASHIER_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), counterId: z.string().optional(), permissions: z.array(z.string()).default([]) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid cashier data" });
  try {
    if (p.data.counterId && !await db.counter.findFirst({ where: { id: p.data.counterId, shopId: a.shopId } })) return res.status(400).json({ error: "Counter does not belong to this shop" });
    const u = await db.user.create({ data: { shopId: a.shopId, name: p.data.name, email: p.data.email, passwordHash: await bcrypt.hash(p.data.password, 12), role: Role.CASHIER, counterId: p.data.counterId } });
    const ps = await db.permission.findMany({ where: { code: { in: p.data.permissions } } });
    if (ps.length) await db.userPermission.createMany({ data: ps.map(x => ({ userId: u.id, permissionId: x.id, enabled: true })) });
    res.status(201).json(u);
  } catch {
    res.status(409).json({ error: "Unable to create cashier; email may already exist" });
  }
});

app.patch("/api/cashiers/:id", auth, perm("CASHIER_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional(), counterId: z.string().nullable().optional(), password: z.string().min(8).optional(), permissions: z.array(z.string()).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid update" });

  const u = await db.user.findFirst({ where: { id: String(req.params.id), shopId: a.shopId, role: Role.CASHIER } });
  if (!u) return res.status(404).json({ error: "Cashier not found" });

  const data: any = {};
  if (p.data.name !== undefined) data.name = p.data.name;
  if (p.data.active !== undefined) data.active = p.data.active;
  if (p.data.counterId !== undefined) data.counterId = p.data.counterId;
  if (p.data.password) data.passwordHash = await bcrypt.hash(p.data.password, 12);

  await db.$transaction(async tx => {
    await tx.user.update({ where: { id: u.id }, data });
    if (p.data.permissions) {
      await tx.userPermission.deleteMany({ where: { userId: u.id } });
      const ps = await tx.permission.findMany({ where: { code: { in: p.data.permissions } } });
      if (ps.length) await tx.userPermission.createMany({ data: ps.map(x => ({ userId: u.id, permissionId: x.id, enabled: true })) });
    }
    await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "CASHIER_UPDATED", entity: "User", entityId: u.id } });
  });
  res.json({ ok: true });
});

/* ── Shift Management & Cash Register API ──────────────── */
app.get("/api/shifts/current", auth, async (req, res) => {
  const a = getAuth(req);
  const current = await db.shift.findFirst({
    where: { shopId: a.shopId, userId: a.userId, status: "OPEN" },
    include: { counter: { select: { name: true } } }
  });
  res.json(current || null);
});

app.post("/api/shifts/start", auth, async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ openingCash: z.coerce.number().nonnegative().default(0), counterId: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Valid opening cash required" });

  const active = await db.shift.findFirst({ where: { shopId: a.shopId, userId: a.userId, status: "OPEN" } });
  if (active) return res.status(400).json({ error: "You already have an open shift" });

  const user = await db.user.findUnique({ where: { id: a.userId } });
  const shift = await db.shift.create({
    data: {
      shopId: a.shopId,
      userId: a.userId,
      counterId: p.data.counterId || user?.counterId || undefined,
      openingCash: p.data.openingCash,
      status: "OPEN"
    }
  });

  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "SHIFT_STARTED", entity: "Shift", entityId: shift.id, metadata: { openingCash: p.data.openingCash } } });
  res.status(201).json(shift);
});

app.post("/api/shifts/end", auth, async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ actualCash: z.coerce.number().nonnegative(), notes: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Actual cash count required" });

  const active = await db.shift.findFirst({ where: { shopId: a.shopId, userId: a.userId, status: "OPEN" } });
  if (!active) return res.status(400).json({ error: "No active open shift found to close" });

  const shiftSales = await db.sale.findMany({
    where: { shopId: a.shopId, cashierId: a.userId, createdAt: { gte: active.startTime } },
    include: { payments: true }
  });

  let cashSales = 0;
  shiftSales.forEach(s => s.payments.forEach(p => { if (p.method === "CASH") cashSales += Number(p.amount); }));

  const shiftExpenses = await db.expense.aggregate({
    where: { shopId: a.shopId, userId: a.userId, createdAt: { gte: active.startTime } },
    _sum: { amount: true }
  });
  const cashExpenses = Number(shiftExpenses._sum.amount || 0);

  const expectedCash = Number(active.openingCash) + cashSales - cashExpenses;
  const difference = p.data.actualCash - expectedCash;

  const closed = await db.shift.update({
    where: { id: active.id },
    data: {
      endTime: new Date(),
      cashSales,
      cashExpenses,
      expectedCash,
      actualCash: p.data.actualCash,
      difference,
      notes: p.data.notes,
      status: "CLOSED"
    }
  });

  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "SHIFT_CLOSED", entity: "Shift", entityId: closed.id, metadata: { expectedCash, actualCash: p.data.actualCash, difference } } });
  res.json(closed);
});

app.get("/api/shifts", auth, admin, async (req, res) => {
  res.json(await db.shift.findMany({
    where: { shopId: getAuth(req).shopId },
    include: { user: { select: { name: true } }, counter: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100
  }));
});

/* ── Suppliers API ─────────────────────────────────────── */
app.get("/api/suppliers", auth, perm("SUPPLIER_VIEW"), async (req, res) => res.json(await db.supplier.findMany({ where: { shopId: getAuth(req).shopId }, orderBy: { name: "asc" }, include: { _count: { select: { purchases: true } } } })));
app.post("/api/suppliers", auth, perm("SUPPLIER_CREATE"), async (req, res) => {
  const a = getAuth(req), p = z.object({ name: z.string().min(1), phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), gstin: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid supplier data" });
  res.status(201).json(await db.supplier.create({ data: { ...p.data, shopId: a.shopId } }));
});
app.patch("/api/suppliers/:id", auth, perm("SUPPLIER_CREATE"), async (req, res) => {
  const a = getAuth(req), p = z.object({ name: z.string().min(1).optional(), phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), gstin: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid supplier update" });
  const x = await db.supplier.updateMany({ where: { id: String(req.params.id), shopId: a.shopId }, data: p.data });
  if (!x.count) return res.status(404).json({ error: "Supplier not found" });
  res.json({ ok: true });
});

/* ── Purchases API ─────────────────────────────────────── */
app.get("/api/purchases", auth, perm("PURCHASE_CREATE"), async (req, res) => res.json(await db.purchase.findMany({ where: { shopId: getAuth(req).shopId }, include: { supplier: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { createdAt: "desc" }, take: 200 })));
app.post("/api/purchases", auth, perm("PURCHASE_CREATE"), async (req, res) => {
  const a = getAuth(req), p = z.object({ supplierId: z.string().optional(), invoiceNumber: z.string().min(1), items: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().nonnegative() })).min(1) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid purchase data" });
  try {
    const out = await db.$transaction(async tx => {
      if (p.data.supplierId && !await tx.supplier.findFirst({ where: { id: p.data.supplierId, shopId: a.shopId } })) throw Error("Supplier does not belong to this shop");
      const lines = p.data.items.map(i => ({ ...i, total: i.quantity * i.unitPrice }));
      const total = lines.reduce((s, i) => s + i.total, 0);
      const purchase = await tx.purchase.create({ data: { shopId: a.shopId, supplierId: p.data.supplierId || undefined, invoiceNumber: p.data.invoiceNumber, total } });
      for (const i of lines) {
        const product = await tx.product.findFirst({ where: { id: i.productId, shopId: a.shopId } });
        if (!product) throw Error("Product not found");
        await tx.purchaseItem.create({ data: { purchaseId: purchase.id, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total } });
        await tx.product.update({ where: { id: i.productId }, data: { stock: { increment: i.quantity }, purchasePrice: i.unitPrice } });
        await tx.inventoryMovement.create({ data: { shopId: a.shopId, productId: i.productId, type: InventoryMovementType.PURCHASE, quantity: i.quantity, referenceId: purchase.id, userId: a.userId } });
      }
      await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "PURCHASE_CREATED", entity: "Purchase", entityId: purchase.id, metadata: { invoiceNumber: p.data.invoiceNumber, total } } });
      return purchase;
    });
    res.status(201).json(out);
  } catch (e: any) { res.status(400).json({ error: e.message || "Purchase failed" }); }
});

/* ── Sales / Billing POS API ────────────────────────────── */
app.get("/api/sales", auth, perm("BILL_VIEW"), async (req, res) => {
  const a = getAuth(req);
  res.json(await db.sale.findMany({
    where: { shopId: a.shopId },
    include: { cashier: { select: { name: true } }, customer: { select: { name: true } }, payments: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

app.post("/api/sales", auth, perm("BILL_CREATE"), async (req, res) => {
  const a = getAuth(req), idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length > 100) return res.status(400).json({ error: "Idempotency-Key header is required" });
  const p = z.object({ customerId: z.string().optional(), discount: z.coerce.number().nonnegative().default(0), items: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive() })).min(1), payments: z.array(z.object({ method: z.nativeEnum(PaymentMethod), amount: z.coerce.number().positive() })).min(1) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid sale payload" });

  try {
    const sale = await db.$transaction(async tx => {
      const prior = await tx.idempotencyKey.findUnique({ where: { shopId_operation_key: { shopId: a.shopId, operation: "SALE_CREATE", key: idempotencyKey } } });
      if (prior?.response && typeof prior.response === "object" && "saleId" in prior.response) {
        return tx.sale.findUniqueOrThrow({ where: { id: String((prior.response as { saleId: string }).saleId) }, include: { items: { include: { product: true } }, payments: true, customer: true, cashier: { select: { name: true } } } });
      }

      const merged = new Map<string, number>();
      for (const item of p.data.items) merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity);

      const lines: any[] = []; let subtotal = new Prisma.Decimal(0); let tax = new Prisma.Decimal(0);
      for (const [productId, quantity] of merged) {
        const product = await tx.product.findFirst({ where: { id: productId, shopId: a.shopId, active: true } });
        if (!product) throw Error("Product not found");
        const base = new Prisma.Decimal(product.sellingPrice).mul(quantity);
        const t = base.mul(new Prisma.Decimal(product.taxRate)).div(100);
        subtotal = subtotal.plus(base);
        tax = tax.plus(t);
        lines.push({ quantity, product, base, t });
      }

      const discount = new Prisma.Decimal(p.data.discount);
      if (discount.gt(subtotal)) throw Error("Discount cannot exceed subtotal");
      const total = subtotal.minus(discount).plus(tax);
      const paid = p.data.payments.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const hasCredit = p.data.payments.some(item => item.method === PaymentMethod.CREDIT);

      if (hasCredit && !p.data.customerId) throw Error("A customer is required for credit payments");
      if (p.data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: p.data.customerId, shopId: a.shopId } });
        if (!customer) throw Error("Customer not found");
      }

      if (p.data.discount > 0 && !await allowed(a, "BILL_DISCOUNT")) throw Error("Missing permission: BILL_DISCOUNT");
      if (paid.lt(total)) throw Error(`Payment is short by ${money(total.minus(paid).toNumber())}`);
      if (paid.gt(total) && !p.data.payments.some(item => item.method === PaymentMethod.CASH)) throw Error("Only cash payments may include change");

      const shop = await tx.shop.findUniqueOrThrow({ where: { id: a.shopId } });
      const year = new Date().getFullYear();
      const counter = await tx.invoiceCounter.upsert({ where: { shopId_year: { shopId: a.shopId, year } }, create: { shopId: a.shopId, year, value: 1 }, update: { value: { increment: 1 } } });
      const invoice = `${shop.invoicePrefix}-${year}-${String(counter.value).padStart(6, "0")}`;

      const s = await tx.sale.create({ data: { shopId: a.shopId, invoiceNumber: invoice, idempotencyKey, cashierId: a.userId, customerId: p.data.customerId, subtotal, discount, tax, total } });

      for (const l of lines) {
        const updated = await tx.product.updateMany({ where: { id: l.product.id, shopId: a.shopId, active: true, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
        if (!updated.count) throw Error(`Insufficient stock for ${l.product.name}`);
        await tx.saleItem.create({ data: { saleId: s.id, productId: l.product.id, quantity: l.quantity, unitPrice: l.product.sellingPrice, unitCost: l.product.purchasePrice, tax: l.t, total: l.base.plus(l.t) } });
        await tx.inventoryMovement.create({ data: { shopId: a.shopId, productId: l.product.id, type: "SALE", quantity: -l.quantity, referenceId: s.id, userId: a.userId } });
      }

      for (const x of p.data.payments) await tx.payment.create({ data: { saleId: s.id, method: x.method, amount: x.amount } });

      if (p.data.customerId) {
        const credit = p.data.payments.filter(x => x.method === PaymentMethod.CREDIT).reduce((sum, item) => sum + item.amount, 0);
        if (credit) {
          await tx.customer.update({ where: { id: p.data.customerId }, data: { creditBalance: { increment: credit } } });
          await tx.customerCreditLedger.create({ data: { shopId: a.shopId, customerId: p.data.customerId, saleId: s.id, userId: a.userId, type: "CREDIT_GIVEN", amount: credit, notes: `Invoice ${invoice}` } });
        }
      }

      await tx.idempotencyKey.create({ data: { shopId: a.shopId, userId: a.userId, operation: "SALE_CREATE", key: idempotencyKey, response: { saleId: s.id } } });
      await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "SALE_CREATED", entity: "Sale", entityId: s.id, metadata: { invoice, total: total.toNumber() } } });
      return tx.sale.findUnique({ where: { id: s.id }, include: { items: { include: { product: true } }, payments: true, customer: true, cashier: { select: { name: true } } } });
    });

    res.status(201).json(sale);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Sale failed; no changes were committed" });
  }
});

/* ── Returns & Refunds API ─────────────────────────────── */
app.post("/api/returns", auth, perm("REFUND_CREATE"), async (req, res) => {
  const a = getAuth(req), p = z.object({ saleId: z.string(), reason: z.string().min(2), items: z.array(z.object({ saleItemId: z.string(), quantity: z.coerce.number().positive() })).min(1) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid return payload" });

  try {
    const out = await db.$transaction(async tx => {
      const sale = await tx.sale.findFirst({ where: { id: p.data.saleId, shopId: a.shopId }, include: { items: true } });
      if (!sale) throw Error("Original sale not found");

      let refund = 0;
      const r = await tx.saleReturn.create({ data: { shopId: a.shopId, saleId: sale.id, userId: a.userId, refundAmount: 0, reason: p.data.reason } });

      for (const i of p.data.items) {
        const si = sale.items.find(x => x.id === i.saleItemId);
        if (!si) throw Error("Sale item not found");
        const prior = await tx.returnItem.aggregate({ where: { saleItemId: si.id }, _sum: { quantity: true } });
        if (Number(prior._sum.quantity || 0) + i.quantity > Number(si.quantity)) throw Error("Return quantity exceeds sold quantity");

        const amount = Number(si.unitPrice) * i.quantity;
        refund += amount;

        await tx.returnItem.create({ data: { returnId: r.id, saleItemId: si.id, productId: si.productId, quantity: i.quantity, amount } });
        await tx.product.update({ where: { id: si.productId }, data: { stock: { increment: i.quantity } } });
        await tx.inventoryMovement.create({ data: { shopId: a.shopId, productId: si.productId, type: InventoryMovementType.RETURN, quantity: i.quantity, referenceId: r.id, userId: a.userId } });
      }

      await tx.saleReturn.update({ where: { id: r.id }, data: { refundAmount: refund } });
      await tx.sale.update({ where: { id: sale.id }, data: { status: "RETURNED" } });
      await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "SALE_RETURN", entity: "SaleReturn", entityId: r.id, metadata: { saleId: sale.id, refund } } });
      return { id: r.id, refund };
    });

    res.status(201).json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/returns", auth, perm("REFUND_CREATE"), async (req, res) => res.json(await db.saleReturn.findMany({ where: { shopId: getAuth(req).shopId }, include: { sale: { select: { invoiceNumber: true } }, items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 200 })));

/* ── Inventory Movements & Expiry API ───────────────────── */
app.get("/api/inventory", auth, perm("INVENTORY_VIEW"), async (req, res) => {
  const a = getAuth(req), q = String(req.query.q || "").trim();
  res.json(await db.product.findMany({
    where: { shopId: a.shopId, OR: q ? [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] : undefined },
    include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 500
  }));
});

app.get("/api/inventory/movements", auth, perm("INVENTORY_VIEW"), async (req, res) => {
  const a = getAuth(req);
  res.json(await db.inventoryMovement.findMany({
    where: { shopId: a.shopId },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

app.patch("/api/inventory/:id", auth, perm("INVENTORY_ADJUST"), async (req, res) => {
  const a = getAuth(req), p = z.object({ quantity: z.coerce.number().nonnegative(), reason: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Quantity and reason are required" });
  try {
    const x = await db.$transaction(async tx => {
      const old = await tx.product.findFirst({ where: { id: String(req.params.id), shopId: a.shopId } });
      if (!old) throw Error("Product not found");

      const u = await tx.product.update({ where: { id: old.id }, data: { stock: p.data.quantity } });
      const diff = p.data.quantity - Number(old.stock);
      await tx.inventoryMovement.create({ data: { shopId: a.shopId, productId: old.id, type: "ADJUSTMENT", quantity: diff, reason: p.data.reason, userId: a.userId } });
      await tx.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "STOCK_ADJUSTED", entity: "Product", entityId: old.id, metadata: { from: Number(old.stock), to: p.data.quantity, reason: p.data.reason } } });
      return u;
    });
    res.json(x);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/* ── Offers & Promotions API ────────────────────────────── */
app.get("/api/offers", auth, async (req, res) => {
  res.json(await db.offer.findMany({ where: { shopId: getAuth(req).shopId }, orderBy: { createdAt: "desc" } }));
});

app.post("/api/offers", auth, perm("OFFER_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    type: z.enum(["PERCENTAGE", "FIXED", "BUY_X_GET_Y", "MIN_BILL"]),
    value: z.coerce.number().nonnegative().default(0),
    minBillAmount: z.coerce.number().nonnegative().optional(),
    buyQty: z.coerce.number().positive().optional(),
    getQty: z.coerce.number().positive().optional(),
    categoryId: z.string().optional(),
    productId: z.string().optional()
  }).safeParse(req.body);

  if (!p.success) return res.status(400).json({ error: "Invalid offer payload" });

  const offer = await db.offer.create({ data: { ...p.data, shopId: a.shopId } });
  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "OFFER_CREATED", entity: "Offer", entityId: offer.id, metadata: { name: offer.name } } });
  res.status(201).json(offer);
});

app.patch("/api/offers/:id", auth, perm("OFFER_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({ active: z.boolean().optional(), name: z.string().optional(), value: z.coerce.number().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid update" });
  await db.offer.updateMany({ where: { id: String(req.params.id), shopId: a.shopId }, data: p.data });
  res.json({ ok: true });
});

/* ── Audit Logs API ─────────────────────────────────────── */
app.get("/api/audit-logs", auth, admin, async (req, res) => {
  res.json(await db.auditLog.findMany({
    where: { shopId: getAuth(req).shopId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

/* ── Dashboard Overview API ─────────────────────────────── */
app.get("/api/dashboard", auth, async (req, res) => {
  const a = getAuth(req), start = new Date();
  start.setHours(0, 0, 0, 0);

  const sales = await db.sale.aggregate({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: start } }, _sum: { total: true }, _count: { id: true } });
  const productsCount = await db.product.count({ where: { shopId: a.shopId, active: true } });
  const allProducts = await db.product.findMany({ where: { shopId: a.shopId, active: true }, select: { stock: true, minimumStock: true } });
  const low = allProducts.filter(x => Number(x.stock) <= Number(x.minimumStock)).length;

  res.json({ sales: Number(sales._sum.total || 0), orders: sales._count.id, products: productsCount, lowStock: low });
});

/* ── Expenses API ───────────────────────────────────────── */
app.get("/api/expenses", auth, perm("EXPENSE_MANAGE"), async (req, res) => res.json(await db.expense.findMany({ where: { shopId: getAuth(req).shopId }, orderBy: { createdAt: "desc" }, take: 200 })));
app.post("/api/expenses", auth, perm("EXPENSE_MANAGE"), async (req, res) => {
  const a = getAuth(req), p = z.object({ categoryName: z.string().min(1), amount: z.coerce.number().positive(), description: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid expense payload" });
  res.status(201).json(await db.expense.create({ data: { ...p.data, shopId: a.shopId, userId: a.userId } }));
});

/* ── Reports Summary & Analytics API ───────────────────── */
app.get("/api/reports/summary", auth, perm("REPORT_VIEW"), async (req, res) => {
  const a = getAuth(req);
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const sales = await db.sale.findMany({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: from, lte: to } }, include: { items: { include: { product: true } }, payments: true } });
  const expenses = await db.expense.aggregate({ where: { shopId: a.shopId, createdAt: { gte: from, lte: to } }, _sum: { amount: true } });
  const allProducts = await db.product.findMany({ where: { shopId: a.shopId, active: true }, select: { stock: true, purchasePrice: true } });

  let revenue = 0, cogs = 0;
  for (const s of sales) {
    revenue += Number(s.total);
    for (const i of s.items) cogs += Number(i.product.purchasePrice) * Number(i.quantity);
  }
  const gross = revenue - cogs;
  const exp = Number(expenses._sum.amount || 0);
  const stockValuation = allProducts.reduce((sum, p) => sum + (Number(p.stock) * Number(p.purchasePrice)), 0);

  res.json({ revenue, cogs, grossProfit: gross, expenses: exp, netProfit: gross - exp, orders: sales.length, stockValuation });
});


/* ── Shop Profile API ───────────────────────────────────── */
app.get("/api/shop", auth, async (req, res) => {
  const a = getAuth(req);
  const shop = await db.shop.findUnique({ where: { id: a.shopId }, select: { id: true, name: true, address: true, phone: true, email: true, gstin: true, invoicePrefix: true } });
  if (!shop) return res.status(404).json({ error: "Shop not found" });
  res.json(shop);
});

app.patch("/api/shop", auth, perm("SETTINGS_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const p = z.object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    gstin: z.string().optional(),
    invoicePrefix: z.string().min(1).optional()
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid shop data" });
  const updated = await db.shop.update({ where: { id: a.shopId }, data: p.data });
  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "SHOP_UPDATED", entity: "Shop", entityId: a.shopId, metadata: p.data } });
  res.json(updated);
});

/* ── Admin Dashboard (Owner) API ────────────────────────── */
app.get("/api/admin/dashboard", auth, admin, async (req, res) => {
  const a = getAuth(req);
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [todaySales, weekSales, monthSales, activeShifts, counters, cashiers, allProducts, recentSales, lowStockProducts, expirySoon] = await Promise.all([
    db.sale.aggregate({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: todayStart } }, _sum: { total: true }, _count: { id: true } }),
    db.sale.aggregate({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: weekStart } }, _sum: { total: true }, _count: { id: true } }),
    db.sale.aggregate({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: monthStart } }, _sum: { total: true }, _count: { id: true } }),
    db.shift.findMany({ where: { shopId: a.shopId, status: "OPEN" }, include: { user: { select: { name: true } }, counter: { select: { name: true } } } }),
    db.counter.findMany({ where: { shopId: a.shopId }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { shopId: a.shopId, role: "CASHIER" }, select: { id: true, name: true, active: true, counterId: true, counter: { select: { name: true } } } }),
    db.product.findMany({ where: { shopId: a.shopId, active: true }, select: { stock: true, minimumStock: true, purchasePrice: true } }),
    db.sale.findMany({ where: { shopId: a.shopId, status: "COMPLETED", createdAt: { gte: todayStart } }, include: { cashier: { select: { name: true } }, payments: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.product.findMany({ where: { shopId: a.shopId, active: true }, select: { id: true, name: true, sku: true, stock: true, minimumStock: true }, orderBy: { stock: "asc" }, take: 10 }),
    db.product.findMany({ where: { shopId: a.shopId, active: true, expiryDate: { lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), gte: now } }, select: { id: true, name: true, sku: true, stock: true, expiryDate: true }, orderBy: { expiryDate: "asc" }, take: 10 }),
  ]);

  const stockValuation = allProducts.reduce((s, p) => s + Number(p.stock) * Number(p.purchasePrice), 0);
  const outOfStock = allProducts.filter(p => Number(p.stock) <= 0).length;
  const lowStock = allProducts.filter(p => Number(p.stock) > 0 && Number(p.stock) <= Number(p.minimumStock)).length;

  // Cashier-level sales for today
  const cashierSalesMap = new Map<string, number>();
  recentSales.forEach(s => { const cur = cashierSalesMap.get(s.cashier.name) || 0; cashierSalesMap.set(s.cashier.name, cur + Number(s.total)); });
  const cashierStats = Array.from(cashierSalesMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

  // Payment method breakdown
  const paymentBreakdown: Record<string, number> = {};
  recentSales.forEach(s => s.payments.forEach(p => { paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount); }));

  const counterStatus = counters.map(ct => ({
    ...ct,
    activeShift: activeShifts.find(s => s.counterId === ct.id) || null,
    assignedCashiers: cashiers.filter(c => c.counterId === ct.id)
  }));

  res.json({
    today: { revenue: Number(todaySales._sum.total || 0), orders: todaySales._count.id },
    week: { revenue: Number(weekSales._sum.total || 0), orders: weekSales._count.id },
    month: { revenue: Number(monthSales._sum.total || 0), orders: monthSales._count.id },
    inventory: { total: allProducts.length, outOfStock, lowStock, stockValuation },
    counters: counterStatus,
    activeShifts: activeShifts.length,
    cashierStats,
    paymentBreakdown,
    recentSales: recentSales.map(s => ({ id: s.id, invoiceNumber: s.invoiceNumber, total: Number(s.total), cashier: s.cashier.name, createdAt: s.createdAt })),
    lowStockProducts: lowStockProducts.filter(p => Number(p.stock) <= Number(p.minimumStock)).map(p => ({ ...p, stock: Number(p.stock), minimumStock: Number(p.minimumStock) })),
    expiringSoon: expirySoon.map(p => ({ ...p, stock: Number(p.stock) }))
  });
});

/* ── Smart Alerts API ───────────────────────────────────── */
app.get("/api/admin/alerts", auth, admin, async (req, res) => {
  const a = getAuth(req);
  const now = new Date();
  const alerts: Array<{ type: string; severity: "critical" | "warning" | "info"; message: string; entityId?: string }> = [];

  // Low/Out of stock alerts
  const stockProducts = await db.product.findMany({ where: { shopId: a.shopId, active: true }, select: { id: true, name: true, stock: true, minimumStock: true } });
  const outOfStock = stockProducts.filter(p => Number(p.stock) <= 0);
  const lowStock = stockProducts.filter(p => Number(p.stock) > 0 && Number(p.stock) <= Number(p.minimumStock));
  if (outOfStock.length) alerts.push({ type: "OUT_OF_STOCK", severity: "critical", message: `${outOfStock.length} product(s) are out of stock: ${outOfStock.slice(0, 3).map(p => p.name).join(", ")}${outOfStock.length > 3 ? " +" + (outOfStock.length - 3) + " more" : ""}` });
  if (lowStock.length) alerts.push({ type: "LOW_STOCK", severity: "warning", message: `${lowStock.length} product(s) running low on stock` });

  // Expiry alerts (within 7 days = critical, within 30 days = warning)
  const expiry7 = await db.product.findMany({ where: { shopId: a.shopId, active: true, expiryDate: { lte: new Date(now.getTime() + 7 * 86400000), gte: now } }, select: { name: true } });
  const expiry30 = await db.product.findMany({ where: { shopId: a.shopId, active: true, expiryDate: { lte: new Date(now.getTime() + 30 * 86400000), gte: new Date(now.getTime() + 7 * 86400000) } }, select: { name: true } });
  if (expiry7.length) alerts.push({ type: "EXPIRY_CRITICAL", severity: "critical", message: `${expiry7.length} product(s) expire within 7 days: ${expiry7.slice(0, 2).map(p => p.name).join(", ")}` });
  if (expiry30.length) alerts.push({ type: "EXPIRY_WARNING", severity: "warning", message: `${expiry30.length} product(s) expire within 30 days` });

  // Cash discrepancy alerts (shifts with significant difference)
  const shiftDiscrepancies = await db.shift.findMany({ where: { shopId: a.shopId, status: "CLOSED", difference: { not: null } }, select: { id: true, difference: true, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  const bigDiff = shiftDiscrepancies.filter(s => Math.abs(Number(s.difference || 0)) > 100);
  if (bigDiff.length) alerts.push({ type: "CASH_DISCREPANCY", severity: "warning", message: `${bigDiff.length} recent shift(s) have cash discrepancy > ₹100`, entityId: bigDiff[0].id });

  // Customers with high credit outstanding
  const highCredit = await db.customer.findMany({ where: { shopId: a.shopId, creditBalance: { gt: 5000 } }, select: { name: true, creditBalance: true }, orderBy: { creditBalance: "desc" }, take: 3 });
  if (highCredit.length) alerts.push({ type: "HIGH_CREDIT", severity: "warning", message: `${highCredit.length} customer(s) have credit balance > ₹5000: ${highCredit.map(c => `${c.name} (₹${Number(c.creditBalance).toFixed(0)})`).join(", ")}` });

  // Open shifts more than 12 hours
  const oldShifts = await db.shift.findMany({ where: { shopId: a.shopId, status: "OPEN", startTime: { lt: new Date(now.getTime() - 12 * 3600000) } }, include: { user: { select: { name: true } } } });
  if (oldShifts.length) alerts.push({ type: "LONG_SHIFT", severity: "warning", message: `${oldShifts.length} shift(s) open for more than 12 hours: ${oldShifts.map(s => s.user.name).join(", ")}` });

  if (!alerts.length) alerts.push({ type: "ALL_CLEAR", severity: "info", message: "All systems normal. No issues detected." });

  res.json({ alerts, generatedAt: now });
});

/* ── Backup & Export API ────────────────────────────────── */
app.get("/api/admin/backup", auth, admin, async (req, res) => {
  const a = getAuth(req);
  const [products, customers, sales, expenses, suppliers, cashiers] = await Promise.all([
    db.product.findMany({ where: { shopId: a.shopId }, include: { category: { select: { name: true } } } }),
    db.customer.findMany({ where: { shopId: a.shopId } }),
    db.sale.findMany({ where: { shopId: a.shopId }, include: { items: { include: { product: { select: { name: true, sku: true } } } }, payments: true, cashier: { select: { name: true } }, customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 2000 }),
    db.expense.findMany({ where: { shopId: a.shopId } }),
    db.supplier.findMany({ where: { shopId: a.shopId } }),
    db.user.findMany({ where: { shopId: a.shopId, role: "CASHIER" }, select: { id: true, name: true, email: true, active: true } }),
  ]);
  await db.auditLog.create({ data: { shopId: a.shopId, userId: a.userId, action: "DATA_EXPORT", entity: "System", entityId: a.shopId, metadata: { productsCount: products.length, salesCount: sales.length } } });
  res.json({ exportedAt: new Date(), shopId: a.shopId, products, customers, sales, expenses, suppliers, cashiers });
});

/* ── Data Health API ────────────────────────────────────── */
app.get("/api/admin/data-health", auth, admin, async (req, res) => {
  const a = getAuth(req);
  const issues: Array<{ severity: "critical" | "warning" | "info"; category: string; description: string; count: number }> = [];

  // Products with negative stock
  const negativeStock = await db.product.count({ where: { shopId: a.shopId, active: true, stock: { lt: 0 } } });
  if (negativeStock) issues.push({ severity: "critical", category: "Inventory", description: "Products with negative stock (data integrity issue)", count: negativeStock });

  // Products with no SKU (should never happen but check)
  const noSku = await db.product.count({ where: { shopId: a.shopId, sku: "" } });
  if (noSku) issues.push({ severity: "warning", category: "Products", description: "Products missing SKU code", count: noSku });

  // Duplicate barcodes check (products sharing barcode)
  const barcodeGroups = await db.product.groupBy({ by: ["barcode"], where: { shopId: a.shopId, barcode: { not: null } }, _count: { id: true }, having: { id: { _count: { gt: 1 } } } });
  if (barcodeGroups.length) issues.push({ severity: "critical", category: "Products", description: "Duplicate barcode values detected", count: barcodeGroups.length });

  // Sales with no payment records
  const salesNoPay = await db.sale.count({ where: { shopId: a.shopId, status: "COMPLETED", payments: { none: {} } } });
  if (salesNoPay) issues.push({ severity: "critical", category: "Sales", description: "Completed sales with no payment records", count: salesNoPay });

  // Customers with very high credit (potential uncollected debt)
  const highCredit = await db.customer.count({ where: { shopId: a.shopId, creditBalance: { gt: 10000 } } });
  if (highCredit) issues.push({ severity: "warning", category: "Customers", description: "Customers with credit balance > ₹10,000", count: highCredit });

  // Expired products still active in inventory
  const expired = await db.product.count({ where: { shopId: a.shopId, active: true, expiryDate: { lt: new Date() } } });
  if (expired) issues.push({ severity: "warning", category: "Inventory", description: "Expired products still active in catalogue", count: expired });

  // Cashiers without counter assignment
  const noCashierCounter = await db.user.count({ where: { shopId: a.shopId, role: "CASHIER", active: true, counterId: null } });
  if (noCashierCounter) issues.push({ severity: "info", category: "Staff", description: "Active cashiers not assigned to a counter", count: noCashierCounter });

  // Overall scoring
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const score = Math.max(0, 100 - criticalCount * 20 - warningCount * 5);

  res.json({ score, issues, checkedAt: new Date() });
});

/* ── Printer & Receipt Customizer API ─────────────────────── */
app.get("/api/printer-settings", auth, async (req, res) => {
  const a = getAuth(req);
  const counterId = (req.query.counterId as string) || a.counterId || null;
  let setting = await db.printerSetting.findFirst({
    where: { shopId: a.shopId, counterId: counterId || undefined }
  });
  if (!setting) {
    // If specific counter setting not found, try default shop setting
    setting = await db.printerSetting.findFirst({
      where: { shopId: a.shopId }
    });
  }
  if (!setting) {
    // Create initial default printer setting
    const shop = await db.shop.findUnique({ where: { id: a.shopId } });
    setting = await db.printerSetting.create({
      data: {
        shopId: a.shopId,
        counterId: counterId,
        shopName: shop?.name || "SUPERMARKET POS",
        tagline: "Quality & Savings Guaranteed",
        address: shop?.address || "Main Market Street",
        phone: shop?.phone || "",
        gstin: shop?.gstin || "",
        email: shop?.email || "",
      }
    });
  }
  res.json(setting);
});

app.patch("/api/printer-settings", auth, perm("SETTINGS_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const counterId = req.body.counterId || null;
  const existing = await db.printerSetting.findFirst({
    where: { shopId: a.shopId, counterId: counterId || undefined }
  });
  
  const payload = { ...req.body };
  delete payload.id;
  delete payload.shopId;
  delete payload.createdAt;
  delete payload.updatedAt;

  if (existing) {
    const updated = await db.printerSetting.update({
      where: { id: existing.id },
      data: payload
    });
    return res.json(updated);
  } else {
    const created = await db.printerSetting.create({
      data: {
        ...payload,
        shopId: a.shopId,
        counterId: counterId
      }
    });
    return res.json(created);
  }
});

app.get("/api/receipt-templates", auth, async (req, res) => {
  const a = getAuth(req);
  const templates = await db.receiptTemplate.findMany({
    where: { shopId: a.shopId },
    orderBy: { createdAt: "desc" }
  });
  res.json(templates);
});

app.post("/api/receipt-templates", auth, perm("SETTINGS_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const { name, paperWidth, configuration, isDefault } = req.body;
  if (!name || !configuration) return res.status(400).json({ error: "Name and configuration required" });

  if (isDefault) {
    await db.receiptTemplate.updateMany({
      where: { shopId: a.shopId },
      data: { isDefault: false }
    });
  }

  const template = await db.receiptTemplate.create({
    data: {
      shopId: a.shopId,
      name,
      paperWidth: paperWidth || "80mm",
      configuration: typeof configuration === "string" ? configuration : JSON.stringify(configuration),
      isDefault: !!isDefault
    }
  });
  res.json(template);
});

app.patch("/api/receipt-templates/:id", auth, perm("SETTINGS_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const id = String(req.params.id);
  const { name, paperWidth, configuration, isDefault } = req.body;

  if (isDefault) {
    await db.receiptTemplate.updateMany({
      where: { shopId: a.shopId },
      data: { isDefault: false }
    });
  }

  const dataToUpdate: any = {};
  if (name !== undefined) dataToUpdate.name = name;
  if (paperWidth !== undefined) dataToUpdate.paperWidth = paperWidth;
  if (configuration !== undefined) dataToUpdate.configuration = typeof configuration === "string" ? configuration : JSON.stringify(configuration);
  if (isDefault !== undefined) dataToUpdate.isDefault = isDefault;

  const updated = await db.receiptTemplate.update({
    where: { id },
    data: dataToUpdate
  });
  res.json(updated);
});

app.delete("/api/receipt-templates/:id", auth, perm("SETTINGS_MANAGE"), async (req, res) => {
  const a = getAuth(req);
  const id = String(req.params.id);
  await db.receiptTemplate.deleteMany({
    where: { id, shopId: a.shopId }
  });
  res.json({ ok: true });
});



function money(n: number) { return `₹${n.toFixed(2)}`; }

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export { app, db };

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ event: "server_started", port, environment: process.env.NODE_ENV || "development" })));
  const shutdown = async () => { server.close(); await db.$disconnect(); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
