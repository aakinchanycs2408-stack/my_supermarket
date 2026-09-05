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

const db=new PrismaClient(), app=express();
const production=process.env.NODE_ENV === "production";
const SECRET=process.env.JWT_SECRET;
if(production && (!SECRET || SECRET.length < 32)) throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
const jwtSecret=SECRET || crypto.randomBytes(32).toString("hex");
const allowedOrigins=(process.env.FRONTEND_URL||"http://localhost:5173").split(",").map(origin=>origin.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({origin:(origin,callback)=>{if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(new Error("Origin is not allowed"));},credentials:true}));
app.use(express.json({limit:"100kb"}));
app.use((req,res,next)=>{const requestId=crypto.randomUUID();const started=Date.now();res.setHeader("X-Request-Id",requestId);res.on("finish",()=>console.log(JSON.stringify({requestId,method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started})));next();});
const loginLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{error:"Too many login attempts. Try again later."}});
type Auth={userId:string;shopId:string;role:Role};
const getAuth=(req:express.Request)=>(req as any).auth as Auth;

function auth(req:express.Request,res:express.Response,next:express.NextFunction){
 const t=req.headers.authorization?.replace("Bearer ","");
 if(!t)return res.status(401).json({error:"Authentication required"});
 try{const claims=jwt.verify(t,jwtSecret) as {userId?:string};if(!claims.userId)return res.status(401).json({error:"Invalid or expired session"});db.user.findUnique({where:{id:claims.userId},select:{id:true,shopId:true,role:true,active:true}}).then(user=>{if(!user||!user.active)return res.status(401).json({error:"Account is inactive or unavailable"});(req as any).auth={userId:user.id,shopId:user.shopId,role:user.role};next();}).catch(()=>res.status(503).json({error:"Authentication service unavailable"}));}catch{return res.status(401).json({error:"Invalid or expired session"});}
}
async function allowed(a:Auth,code:string){if(a.role===Role.ADMIN)return true;return !!await db.userPermission.findFirst({where:{userId:a.userId,permission:{code},enabled:true}})}
const perm=(code:string)=>async(req:express.Request,res:express.Response,next:express.NextFunction)=>{if(await allowed(getAuth(req),code))return next();res.status(403).json({error:`Missing permission: ${code}`})};
const admin=perm("USER_MANAGE");

app.get("/api/health",async(_,r)=>{try{await db.$queryRaw`SELECT 1`;r.json({ok:true,database:"connected",environment:process.env.NODE_ENV||"development"});}catch{r.status(503).json({ok:false,database:"unavailable",environment:process.env.NODE_ENV||"development"});}});
app.get("/api/health/db",async(_,r)=>{try{await db.$queryRaw`SELECT 1`;r.json({ok:true,database:"connected"});}catch{r.status(503).json({ok:false,database:"unavailable"});}});

app.post("/api/auth/login",loginLimiter,async(req,res)=>{
 const p=z.object({email:z.string().email(),password:z.string()}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:"Invalid credentials"});
 try {
  const u=await db.user.findUnique({where:{email:p.data.email}});
  if(!u||!u.active||!(await bcrypt.compare(p.data.password,u.passwordHash)))return res.status(401).json({error:"Invalid email or password"});
    const token=jwt.sign({userId:u.id},jwtSecret,{expiresIn:process.env.JWT_EXPIRES_IN||"8h"} as jwt.SignOptions);
  res.json({token,user:{id:u.id,name:u.name,email:u.email,role:u.role,shopId:u.shopId}});
 } catch {
    res.status(503).json({error:"Database unavailable. Check the server database configuration."});
 }
});
app.get("/api/me",auth,async(req,res)=>res.json(await db.user.findUnique({where:{id:getAuth(req).userId},select:{id:true,name:true,email:true,role:true,shopId:true}})));

app.get("/api/products",auth,perm("PRODUCT_VIEW"),async(req,res)=>{
 const a=getAuth(req),q=String(req.query.q||"").trim();
 res.json(await db.product.findMany({where:{shopId:a.shopId,active:true,OR:q?[{name:{contains:q}},{sku:{contains:q}},{barcode:{contains:q}}]:undefined},orderBy:{name:"asc"},take:100}));
});
app.post("/api/products",auth,perm("PRODUCT_CREATE"),async(req,res)=>{
 const a=getAuth(req); const p=z.object({sku:z.string().min(1),barcode:z.string().optional(),name:z.string().min(1),purchasePrice:z.coerce.number().nonnegative(),sellingPrice:z.coerce.number().nonnegative(),mrp:z.coerce.number().nonnegative().optional(),taxRate:z.coerce.number().min(0).max(100).default(0),stock:z.coerce.number().nonnegative().default(0),minimumStock:z.coerce.number().nonnegative().default(0)}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:"Invalid product data"});
 try{const x=await db.product.create({data:{...p.data,shopId:a.shopId}});res.status(201).json(x)}catch{res.status(409).json({error:"SKU or barcode already exists"})}
});
app.patch("/api/products/:id",auth,perm("PRODUCT_EDIT"),async(req,res)=>{
 const a=getAuth(req);const p=z.object({name:z.string().min(1).optional(),sellingPrice:z.coerce.number().nonnegative().optional(),purchasePrice:z.coerce.number().nonnegative().optional(),mrp:z.coerce.number().nonnegative().optional(),taxRate:z.coerce.number().min(0).max(100).optional(),minimumStock:z.coerce.number().nonnegative().optional(),active:z.boolean().optional()}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:"Invalid update"});
 const x=await db.product.updateMany({where:{id:String(req.params.id),shopId:a.shopId},data:p.data});
 if(!x.count)return res.status(404).json({error:"Product not found"});res.json({ok:true});
});

app.get("/api/customers",auth,perm("CUSTOMER_VIEW"),async(req,res)=>res.json(await db.customer.findMany({where:{shopId:getAuth(req).shopId},orderBy:{name:"asc"}})));
app.post("/api/customers",auth,perm("CUSTOMER_CREATE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1),phone:z.string().optional(),email:z.string().email().optional(),address:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid customer"});res.status(201).json(await db.customer.create({data:{...p.data,shopId:a.shopId}}))});
app.patch("/api/customers/:id",auth,perm("CUSTOMER_EDIT"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1).optional(),phone:z.string().optional(),email:z.string().email().optional(),address:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid customer"});const x=await db.customer.updateMany({where:{id:String(req.params.id),shopId:a.shopId},data:p.data});if(!x.count)return res.status(404).json({error:"Customer not found"});res.json({ok:true})});

app.get("/api/cashiers",auth,admin,async(req,res)=>res.json(await db.user.findMany({where:{shopId:getAuth(req).shopId,role:Role.CASHIER},select:{id:true,name:true,email:true,active:true,counterId:true,counter:{select:{name:true}},permissions:{include:{permission:true}}}})));
app.get("/api/permissions",auth,admin,async(_,res)=>res.json(await db.permission.findMany({orderBy:{code:"asc"}})));
app.get("/api/counters",auth,async(req,res)=>res.json(await db.counter.findMany({where:{shopId:getAuth(req).shopId},orderBy:{name:"asc"}})));
app.get("/api/suppliers",auth,perm("SUPPLIER_VIEW"),async(req,res)=>res.json(await db.supplier.findMany({where:{shopId:getAuth(req).shopId},orderBy:{name:"asc"},include:{_count:{select:{purchases:true}}}})));
app.post("/api/suppliers",auth,perm("SUPPLIER_CREATE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1),phone:z.string().optional(),email:z.string().email().optional(),address:z.string().optional(),gstin:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid supplier"});res.status(201).json(await db.supplier.create({data:{...p.data,shopId:a.shopId}}))});
app.patch("/api/suppliers/:id",auth,perm("SUPPLIER_CREATE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1).optional(),phone:z.string().optional(),email:z.string().email().optional(),address:z.string().optional(),gstin:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid supplier"});const x=await db.supplier.updateMany({where:{id:String(req.params.id),shopId:a.shopId},data:p.data});if(!x.count)return res.status(404).json({error:"Supplier not found"});res.json({ok:true})});
app.get("/api/shop",auth,async(req,res)=>res.json(await db.shop.findUnique({where:{id:getAuth(req).shopId}})));
app.patch("/api/shop",auth,perm("SETTINGS_MANAGE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1),address:z.string().optional(),phone:z.string().optional(),email:z.string().email().optional(),gstin:z.string().optional(),invoicePrefix:z.string().min(1).max(8)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid shop settings"});res.json(await db.shop.update({where:{id:a.shopId},data:p.data}))});
app.post("/api/cashiers",auth,perm("CASHIER_MANAGE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1),email:z.string().email(),password:z.string().min(8),counterId:z.string().optional(),permissions:z.array(z.string()).default([])}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid cashier data"});try{if(p.data.counterId&&!await db.counter.findFirst({where:{id:p.data.counterId,shopId:a.shopId}}))return res.status(400).json({error:"Counter does not belong to this shop"});const u=await db.user.create({data:{shopId:a.shopId,name:p.data.name,email:p.data.email,passwordHash:await bcrypt.hash(p.data.password,12),role:Role.CASHIER,counterId:p.data.counterId}});const ps=await db.permission.findMany({where:{code:{in:p.data.permissions}}});if(ps.length)await db.userPermission.createMany({data:ps.map(x=>({userId:u.id,permissionId:x.id,enabled:true}))});res.status(201).json(u)}catch{res.status(409).json({error:"Unable to create cashier"})}});
app.patch("/api/cashiers/:id",auth,perm("CASHIER_MANAGE"),async(req,res)=>{const a=getAuth(req),p=z.object({name:z.string().min(1).optional(),active:z.boolean().optional(),counterId:z.string().nullable().optional(),password:z.string().min(8).optional(),permissions:z.array(z.string()).optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid update"});if(p.data.counterId&&!await db.counter.findFirst({where:{id:p.data.counterId,shopId:a.shopId}}))return res.status(400).json({error:"Counter does not belong to this shop"});const u=await db.user.findFirst({where:{id:String(req.params.id),shopId:a.shopId,role:Role.CASHIER}});if(!u)return res.status(404).json({error:"Cashier not found"});const data:any={};if(p.data.name!==undefined)data.name=p.data.name;if(p.data.active!==undefined)data.active=p.data.active;if(p.data.counterId!==undefined)data.counterId=p.data.counterId;if(p.data.password)data.passwordHash=await bcrypt.hash(p.data.password,12);await db.$transaction(async tx=>{await tx.user.update({where:{id:u.id},data});if(p.data.permissions){await tx.userPermission.deleteMany({where:{userId:u.id}});const ps=await tx.permission.findMany({where:{code:{in:p.data.permissions}}});if(ps.length)await tx.userPermission.createMany({data:ps.map(x=>({userId:u.id,permissionId:x.id,enabled:true}))});}await tx.auditLog.create({data:{shopId:a.shopId,userId:a.userId,action:"CASHIER_UPDATED",entity:"User",entityId:u.id}})});res.json({ok:true})});

app.get("/api/sales",auth,perm("BILL_VIEW"),async(req,res)=>{const a=getAuth(req);res.json(await db.sale.findMany({where:{shopId:a.shopId},include:{cashier:{select:{name:true}},customer:{select:{name:true}},payments:true,items:{include:{product:true}}},orderBy:{createdAt:"desc"},take:200}))});
app.post("/api/sales",auth,perm("BILL_CREATE"),async(req,res)=>{
 const a=getAuth(req),idempotencyKey=req.header("Idempotency-Key");
 if(!idempotencyKey||idempotencyKey.length>100)return res.status(400).json({error:"Idempotency-Key header is required"});
 const p=z.object({customerId:z.string().optional(),discount:z.coerce.number().nonnegative().default(0),items:z.array(z.object({productId:z.string(),quantity:z.coerce.number().positive()})).min(1),payments:z.array(z.object({method:z.nativeEnum(PaymentMethod),amount:z.coerce.number().positive()})).min(1)}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:"Invalid sale data"});
 try{
  const sale=await db.$transaction(async tx=>{
   const prior=await tx.idempotencyKey.findUnique({where:{shopId_operation_key:{shopId:a.shopId,operation:"SALE_CREATE",key:idempotencyKey}}});
   if(prior?.response&&typeof prior.response === "object"&&"saleId" in prior.response){return tx.sale.findUniqueOrThrow({where:{id:String((prior.response as {saleId:string}).saleId)},include:{items:{include:{product:true}},payments:true,customer:true,cashier:{select:{name:true}}}})}
   const merged=new Map<string,number>();for(const item of p.data.items)merged.set(item.productId,(merged.get(item.productId)||0)+item.quantity);
   const lines:any[]=[];let subtotal=new Prisma.Decimal(0);let tax=new Prisma.Decimal(0);
   for(const [productId,quantity] of merged){const product=await tx.product.findFirst({where:{id:productId,shopId:a.shopId,active:true}});if(!product)throw Error("Product not found");const base=new Prisma.Decimal(product.sellingPrice).mul(quantity);const t=base.mul(new Prisma.Decimal(product.taxRate)).div(100);subtotal=subtotal.plus(base);tax=tax.plus(t);lines.push({quantity,product,base,t})}
   const discount=new Prisma.Decimal(p.data.discount);if(discount.gt(subtotal))throw Error("Discount cannot exceed subtotal");const total=subtotal.minus(discount).plus(tax);const paid=p.data.payments.reduce((sum,item)=>sum.plus(item.amount),new Prisma.Decimal(0));const hasCredit=p.data.payments.some(item=>item.method===PaymentMethod.CREDIT);if(hasCredit&&!p.data.customerId)throw Error("A customer is required for credit payments");if(p.data.customerId){const customer=await tx.customer.findFirst({where:{id:p.data.customerId,shopId:a.shopId}});if(!customer)throw Error("Customer not found");}if(p.data.discount>0&&!await allowed(a,"BILL_DISCOUNT"))throw Error("Missing permission: BILL_DISCOUNT");if(paid.lt(total))throw Error(`Payment is short by ${money(total.minus(paid).toNumber())}`);if(paid.gt(total)&&!p.data.payments.some(item=>item.method===PaymentMethod.CASH))throw Error("Only cash payments may include change");
   const shop=await tx.shop.findUniqueOrThrow({where:{id:a.shopId}});const year=new Date().getFullYear();const counter=await tx.invoiceCounter.upsert({where:{shopId_year:{shopId:a.shopId,year}},create:{shopId:a.shopId,year,value:1},update:{value:{increment:1}}});const invoice=`${shop.invoicePrefix}-${year}-${String(counter.value).padStart(6,"0")}`;
   const s=await tx.sale.create({data:{shopId:a.shopId,invoiceNumber:invoice,idempotencyKey,cashierId:a.userId,customerId:p.data.customerId,subtotal,discount,tax,total}});
   for(const l of lines){const updated=await tx.product.updateMany({where:{id:l.product.id,shopId:a.shopId,active:true,stock:{gte:l.quantity}},data:{stock:{decrement:l.quantity}}});if(!updated.count)throw Error(`Insufficient stock for ${l.product.name}`);await tx.saleItem.create({data:{saleId:s.id,productId:l.product.id,quantity:l.quantity,unitPrice:l.product.sellingPrice,unitCost:l.product.purchasePrice,tax:l.t,total:l.base.plus(l.t)}});await tx.inventoryMovement.create({data:{shopId:a.shopId,productId:l.product.id,type:"SALE",quantity:-l.quantity,referenceId:s.id,userId:a.userId}})}
   for(const x of p.data.payments)await tx.payment.create({data:{saleId:s.id,method:x.method,amount:x.amount}});
   if(p.data.customerId){const credit=p.data.payments.filter(x=>x.method===PaymentMethod.CREDIT).reduce((sum,item)=>sum+item.amount,0);if(credit)await tx.customer.update({where:{id:p.data.customerId},data:{creditBalance:{increment:credit}}})}
   await tx.idempotencyKey.create({data:{shopId:a.shopId,userId:a.userId,operation:"SALE_CREATE",key:idempotencyKey,response:{saleId:s.id}}});await tx.auditLog.create({data:{shopId:a.shopId,userId:a.userId,action:"SALE_CREATED",entity:"Sale",entityId:s.id,metadata:{invoice}}});return tx.sale.findUnique({where:{id:s.id},include:{items:{include:{product:true}},payments:true,customer:true,cashier:{select:{name:true}}}});
  });res.status(201).json(sale);
 }catch(e:any){res.status(400).json({error:e.message||"Sale failed; no changes were committed"})}
});

app.post("/api/returns",auth,perm("REFUND_CREATE"),async(req,res)=>{
 const a=getAuth(req),p=z.object({saleId:z.string(),reason:z.string().min(2),items:z.array(z.object({saleItemId:z.string(),quantity:z.coerce.number().positive()})).min(1)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid return data"});
 try{const out=await db.$transaction(async tx=>{const sale=await tx.sale.findFirst({where:{id:p.data.saleId,shopId:a.shopId},include:{items:true}});if(!sale)throw Error("Original sale not found");let refund=0;const r=await tx.saleReturn.create({data:{shopId:a.shopId,saleId:sale.id,userId:a.userId,refundAmount:0,reason:p.data.reason}});for(const i of p.data.items){const si=sale.items.find(x=>x.id===i.saleItemId);if(!si)throw Error("Sale item not found");const prior=await tx.returnItem.aggregate({where:{saleItemId:si.id},_sum:{quantity:true}});if(Number(prior._sum.quantity||0)+i.quantity>Number(si.quantity))throw Error("Return quantity exceeds sold quantity");const amount=Number(si.unitPrice)*i.quantity;refund+=amount;await tx.returnItem.create({data:{returnId:r.id,saleItemId:si.id,productId:si.productId,quantity:i.quantity,amount}});await tx.product.update({where:{id:si.productId},data:{stock:{increment:i.quantity}}});await tx.inventoryMovement.create({data:{shopId:a.shopId,productId:si.productId,type:InventoryMovementType.RETURN,quantity:i.quantity,referenceId:r.id,userId:a.userId}})}await tx.saleReturn.update({where:{id:r.id},data:{refundAmount:refund}});await tx.auditLog.create({data:{shopId:a.shopId,userId:a.userId,action:"SALE_RETURN",entity:"SaleReturn",entityId:r.id,metadata:{saleId:sale.id,refund}}});return {id:r.id,refund}});res.status(201).json(out)}catch(e:any){res.status(400).json({error:e.message})}
});
app.get("/api/returns",auth,perm("REFUND_CREATE"),async(req,res)=>res.json(await db.saleReturn.findMany({where:{shopId:getAuth(req).shopId},include:{sale:{select:{invoiceNumber:true}},items:{include:{product:true}}},orderBy:{createdAt:"desc"},take:200})));

app.get("/api/purchases",auth,perm("PURCHASE_CREATE"),async(req,res)=>res.json(await db.purchase.findMany({where:{shopId:getAuth(req).shopId},include:{supplier:{select:{name:true}},items:{include:{product:{select:{name:true,sku:true}}}}},orderBy:{createdAt:"desc"},take:200})));
app.post("/api/purchases",auth,perm("PURCHASE_CREATE"),async(req,res)=>{const a=getAuth(req),p=z.object({supplierId:z.string().optional(),invoiceNumber:z.string().min(1),items:z.array(z.object({productId:z.string(),quantity:z.coerce.number().positive(),unitPrice:z.coerce.number().nonnegative()})).min(1)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid purchase data"});try{const out=await db.$transaction(async tx=>{if(p.data.supplierId&&!await tx.supplier.findFirst({where:{id:p.data.supplierId,shopId:a.shopId}}))throw Error("Supplier does not belong to this shop");const lines=p.data.items.map(i=>({...i,total:i.quantity*i.unitPrice}));const total=lines.reduce((s,i)=>s+i.total,0);const purchase=await tx.purchase.create({data:{shopId:a.shopId,supplierId:p.data.supplierId||undefined,invoiceNumber:p.data.invoiceNumber,total}});for(const i of lines){const product=await tx.product.findFirst({where:{id:i.productId,shopId:a.shopId}});if(!product)throw Error("Product not found");await tx.purchaseItem.create({data:{purchaseId:purchase.id,productId:i.productId,quantity:i.quantity,unitPrice:i.unitPrice,total:i.total}});await tx.product.update({where:{id:i.productId},data:{stock:{increment:i.quantity},purchasePrice:i.unitPrice}});await tx.inventoryMovement.create({data:{shopId:a.shopId,productId:i.productId,type:InventoryMovementType.PURCHASE,quantity:i.quantity,referenceId:purchase.id,userId:a.userId}})}return purchase});res.status(201).json(out)}catch(e:any){res.status(400).json({error:e.message||"Purchase failed"})}});

app.get("/api/inventory",auth,perm("INVENTORY_VIEW"),async(req,res)=>{const a=getAuth(req),q=String(req.query.q||"").trim();res.json(await db.product.findMany({where:{shopId:a.shopId,OR:q?[{name:{contains:q}},{sku:{contains:q}},{barcode:{contains:q}}]:undefined},orderBy:{name:"asc"},take:500}))});
app.patch("/api/inventory/:id",auth,perm("INVENTORY_ADJUST"),async(req,res)=>{const a=getAuth(req),p=z.object({quantity:z.coerce.number().nonnegative(),reason:z.string().min(2)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Quantity and reason are required"});try{const x=await db.$transaction(async tx=>{const old=await tx.product.findFirst({where:{id:String(req.params.id),shopId:a.shopId}});if(!old)throw Error("Product not found");const u=await tx.product.update({where:{id:old.id},data:{stock:p.data.quantity}});await tx.inventoryMovement.create({data:{shopId:a.shopId,productId:old.id,type:"ADJUSTMENT",quantity:p.data.quantity-Number(old.stock),reason:p.data.reason,userId:a.userId}});await tx.auditLog.create({data:{shopId:a.shopId,userId:a.userId,action:"STOCK_ADJUSTED",entity:"Product",entityId:old.id,metadata:{from:Number(old.stock),to:p.data.quantity,reason:p.data.reason}}});return u});res.json(x)}catch(e:any){res.status(400).json({error:e.message})}});

app.get("/api/dashboard",auth,async(req,res)=>{const a=getAuth(req),start=new Date();start.setHours(0,0,0,0);const sales=await db.sale.aggregate({where:{shopId:a.shopId,status:"COMPLETED",createdAt:{gte:start}},_sum:{total:true},_count:{id:true}});const products=await db.product.count({where:{shopId:a.shopId,active:true}});const all=await db.product.findMany({where:{shopId:a.shopId,active:true},select:{stock:true,minimumStock:true}});const low=all.filter(x=>Number(x.stock)<=Number(x.minimumStock)).length;res.json({sales:Number(sales._sum.total||0),orders:sales._count.id,products,lowStock:low})});

app.get("/api/expenses",auth,perm("EXPENSE_MANAGE"),async(req,res)=>res.json(await db.expense.findMany({where:{shopId:getAuth(req).shopId},orderBy:{createdAt:"desc"},take:200})));
app.post("/api/expenses",auth,perm("EXPENSE_MANAGE"),async(req,res)=>{const a=getAuth(req),p=z.object({categoryName:z.string().min(1),amount:z.coerce.number().positive(),description:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid expense"});res.status(201).json(await db.expense.create({data:{...p.data,shopId:a.shopId,userId:a.userId}}))});

app.get("/api/reports/summary",auth,perm("REPORT_VIEW"),async(req,res)=>{const a=getAuth(req);const from=req.query.from?new Date(String(req.query.from)):new Date(new Date().setHours(0,0,0,0));const to=req.query.to?new Date(String(req.query.to)):new Date();const sales=await db.sale.findMany({where:{shopId:a.shopId,status:"COMPLETED",createdAt:{gte:from,lte:to}},include:{items:{include:{product:true}},payments:true}});const expenses=await db.expense.aggregate({where:{shopId:a.shopId,createdAt:{gte:from,lte:to}},_sum:{amount:true}});let revenue=0,cogs=0;for(const s of sales){revenue+=Number(s.total);for(const i of s.items)cogs+=Number(i.product.purchasePrice)*Number(i.quantity)}const gross=revenue-cogs,exp=Number(expenses._sum.amount||0);res.json({revenue,cogs,grossProfit:gross,expenses:exp,netProfit:gross-exp,orders:sales.length})});

function money(n:number){return `₹${n.toFixed(2)}`}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(res.headersSent)return;res.status(500).json({error:"Internal server error"});});
export { app, db };
if(process.env.NODE_ENV !== "test"){const port=Number(process.env.PORT)||4000;const server=app.listen(port,"0.0.0.0",()=>console.log(JSON.stringify({event:"server_started",port,environment:process.env.NODE_ENV||"development"})));const shutdown=async()=>{server.close();await db.$disconnect();};process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);}
