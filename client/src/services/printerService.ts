import qz from "qz-tray";

export interface PrinterSettingConfig {
  id?: string;
  printerName: string;
  paperWidth: "58mm" | "80mm" | string;
  copies: number;
  autoPrint: boolean;
  cutPaper: boolean;
  openCashDrawer: boolean;
  printMode: "ESC_POS" | "BROWSER"; // Primary print engine selection

  // Header Customization
  shopName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  website: string;
  additionalHeader: string;

  // Logo
  logoUrl: string;
  showLogo: boolean;
  logoAlign: "left" | "center" | "right" | string;

  // Header Options
  showShopName: boolean;
  showTagline: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showGstin: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  headerAlign: "left" | "center" | "right" | string;

  // Item Columns
  showProductName: boolean;
  showQuantity: boolean;
  showRate: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showTotal: boolean;
  showSku: boolean;
  showBarcode: boolean;

  // Bill Info
  showInvoiceNum: boolean;
  showDate: boolean;
  showTime: boolean;
  showCounterNum: boolean;
  showCashierName: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showCustomerGstin: boolean;

  // Totals
  showSubtotal: boolean;
  showSummaryDiscount: boolean;
  showGstTax: boolean;
  showOtherCharges: boolean;
  showGrandTotal: boolean;

  // Payment
  showPaymentMethod: boolean;
  showAmountReceived: boolean;
  showChangeReturned: boolean;
  showTransactionRef: boolean;

  // Footer
  thankYouMessage: string;
  additionalFooter: string;
  returnPolicy: string;
  customerSupport: string;
  showThankYou: boolean;
  showReturnPolicy: boolean;
  showAdditionalFooter: boolean;
  footerAlign: "left" | "center" | "right" | string;

  // Barcode / QR Code
  showQrCode: boolean;
  qrTargetUrl: string;
  showInvoiceBarcode: boolean;

  // Appearance
  fontSize: "small" | "medium" | "large" | string;
  shopNameSize: "small" | "medium" | "large" | string;
  shopNameStyle: "normal" | "bold" | string;
  itemTextStyle: "normal" | "compact" | string;
  dividerStyle: "dashed" | "double" | "solid" | "none" | string;
}

export interface SaleReceiptData {
  invoiceNumber: string;
  date: string;
  time?: string;
  counterNum?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  items: Array<{
    name: string;
    sku?: string;
    barcode?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  otherCharges?: number;
  grandTotal: number;
  paymentMethod: string;
  amountReceived: number;
  changeReturned: number;
  transactionRef?: string;
}

export const SAMPLE_RECEIPT_DATA: SaleReceiptData = {
  invoiceNumber: "INV-2026-00123",
  date: new Date().toLocaleDateString("en-IN"),
  time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  counterNum: "#1",
  cashierName: "Owner / Admin",
  customerName: "Walk-in Customer",
  customerPhone: "9876543210",
  customerGstin: "23ABCDE1234F1Z5",
  items: [
    { name: "Amul Taaza Milk 1L", sku: "SKU-MILK-1", quantity: 2, unitPrice: 56.0, discount: 2.0, tax: 0, total: 110.0 },
    { name: "Fortune Sunflower Oil 1L", sku: "SKU-OIL-1", quantity: 1, unitPrice: 145.0, discount: 5.0, tax: 7.0, total: 140.0 },
    { name: "Aashirvaad Atta 5kg", sku: "SKU-ATTA-5", quantity: 1, unitPrice: 260.0, discount: 10.0, tax: 0, total: 250.0 },
  ],
  subtotal: 500.0,
  discount: 17.0,
  tax: 7.0,
  otherCharges: 0,
  grandTotal: 500.0,
  paymentMethod: "CASH",
  amountReceived: 500.0,
  changeReturned: 0.0,
  transactionRef: "TXN-998877",
};

export const DEFAULT_PRINTER_SETTING: PrinterSettingConfig = {
  printerName: "RP80 Printer(1)",
  paperWidth: "80mm",
  copies: 1,
  autoPrint: true,
  cutPaper: true,
  openCashDrawer: false,
  printMode: "ESC_POS",

  shopName: "NEW BADKUL SWEETS & SUPERMARKET",
  tagline: "Quality bhi, bachat bhi!",
  address: "Pisanahari Madiya Ke Pass, Jabalpur (M.P.)",
  phone: "+91 98765 43210",
  email: "store@badkulsupermarket.com",
  gstin: "23AAACB1234C1Z9",
  website: "www.badkulsupermarket.com",
  additionalHeader: "FSSAI Lic No: 11820001000123",

  logoUrl: "",
  showLogo: false,
  logoAlign: "center",

  showShopName: true,
  showTagline: true,
  showAddress: true,
  showPhone: true,
  showGstin: true,
  showEmail: false,
  showWebsite: false,
  headerAlign: "center",

  showProductName: true,
  showQuantity: true,
  showRate: true,
  showDiscount: true,
  showTax: true,
  showTotal: true,
  showSku: false,
  showBarcode: false,

  showInvoiceNum: true,
  showDate: true,
  showTime: true,
  showCounterNum: true,
  showCashierName: true,
  showCustomerName: true,
  showCustomerPhone: false,
  showCustomerGstin: false,

  showSubtotal: true,
  showSummaryDiscount: true,
  showGstTax: true,
  showOtherCharges: false,
  showGrandTotal: true,

  showPaymentMethod: true,
  showAmountReceived: true,
  showChangeReturned: true,
  showTransactionRef: false,

  thankYouMessage: "Thank You For Shopping With Us!",
  additionalFooter: "Visit Again for Great Discounts!",
  returnPolicy: "Goods once sold can be exchanged within 7 days with valid bill.",
  customerSupport: "Helpline: 1800-123-4567",
  showThankYou: true,
  showReturnPolicy: true,
  showAdditionalFooter: true,
  footerAlign: "center",

  showQrCode: false,
  qrTargetUrl: "https://badkulsupermarket.com/verify-bill",
  showInvoiceBarcode: true,

  fontSize: "medium",
  shopNameSize: "large",
  shopNameStyle: "bold",
  itemTextStyle: "normal",
  dividerStyle: "dashed",
};

/**
 * ESC/POS Command Builder for Thermal Printers (Rugtek RP-326, RP80, Epson, TVS, etc.)
 */
export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  init(): this {
    this.buffer.push(0x1B, 0x40); // ESC @ Initialize printer
    this.buffer.push(0x1B, 0x74, 0x00); // Select Code Table PC437
    return this;
  }

  alignLeft(): this {
    this.buffer.push(0x1B, 0x61, 0x00);
    return this;
  }

  alignCenter(): this {
    this.buffer.push(0x1B, 0x61, 0x01);
    return this;
  }

  alignRight(): this {
    this.buffer.push(0x1B, 0x61, 0x02);
    return this;
  }

  bold(enable: boolean = true): this {
    this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  underline(enable: boolean = true): this {
    this.buffer.push(0x1B, 0x2D, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Set text size: 0 = Normal, 1 = Double Height, 16 = Double Width, 17 = Quad Size
   */
  setTextSize(size: number = 0): this {
    this.buffer.push(0x1D, 0x21, size);
    return this;
  }

  lineFeed(lines: number = 1): this {
    this.buffer.push(0x1B, 0x64, lines);
    return this;
  }

  cutPaper(partial: boolean = false): this {
    this.buffer.push(0x1B, 0x64, 0x03); // Feed 3 lines
    if (partial) {
      this.buffer.push(0x1D, 0x56, 0x01); // Partial cut
    } else {
      this.buffer.push(0x1D, 0x56, 0x42, 0x00); // Full cut
    }
    return this;
  }

  openCashDrawer(): this {
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0xFA); // ESC p 0 25 250
    return this;
  }

  text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Map currency symbol ₹ (0x20B9) to Rs. or ASCII
      if (code === 0x20B9) {
        this.buffer.push(0x52, 0x73, 0x2E); // "Rs."
      } else if (code > 255) {
        this.buffer.push(0x3F); // ? for unsupported unicode
      } else {
        this.buffer.push(code);
      }
    }
    return this;
  }

  textLine(str: string = ""): this {
    this.text(str);
    this.buffer.push(0x0A); // LF
    return this;
  }

  divider(style: string = "dashed", paperWidth: string = "80mm"): this {
    const width = paperWidth === "58mm" ? 32 : 48;
    let char = "-";
    if (style === "double") char = "=";
    if (style === "solid") char = "_";
    if (style === "none") return this;
    return this.textLine(char.repeat(width));
  }

  /**
   * Print 2-column key-value row cleanly aligned across printable area.
   */
  rowKeyValue(key: string, value: string, paperWidth: string = "80mm"): this {
    const totalWidth = paperWidth === "58mm" ? 32 : 48;
    const spaceCount = totalWidth - key.length - value.length;
    if (spaceCount > 0) {
      this.textLine(key + " ".repeat(spaceCount) + value);
    } else {
      this.textLine(key);
      this.textLine(" ".repeat(totalWidth - value.length) + value);
    }
    return this;
  }

  /**
   * Print table item row: Name (left), Qty (center), Rate (right), Total (right)
   */
  itemRow(
    name: string,
    qty: string,
    rate: string,
    total: string,
    paperWidth: string = "80mm"
  ): this {
    if (paperWidth === "58mm") {
      // 32 chars: Name (32), subline Qty x Rate (right aligned total)
      this.textLine(name.length > 32 ? name.substring(0, 32) : name);
      const subLeft = `${qty} x ${rate}`;
      const spaces = 32 - subLeft.length - total.length;
      this.textLine(subLeft + " ".repeat(Math.max(1, spaces)) + total);
    } else {
      // 80mm: 48 chars total
      // Col lengths: Name (22), Qty (5), Rate (9), Total (10)
      const nameColWidth = 22;
      const qtyColWidth = 6;
      const rateColWidth = 9;
      const totalColWidth = 11;

      // Wrap or truncate name
      const nameLines: string[] = [];
      let tempName = name;
      while (tempName.length > nameColWidth) {
        nameLines.push(tempName.substring(0, nameColWidth));
        tempName = tempName.substring(nameColWidth);
      }
      nameLines.push(tempName);

      const formattedQty = qty.padStart(qtyColWidth);
      const formattedRate = rate.padStart(rateColWidth);
      const formattedTotal = total.padStart(totalColWidth);

      // Print first line with col values
      const firstLineName = nameLines[0].padEnd(nameColWidth);
      this.textLine(firstLineName + formattedQty + formattedRate + formattedTotal);

      // Print wrapped remaining lines of item name if any
      for (let i = 1; i < nameLines.length; i++) {
        this.textLine(nameLines[i]);
      }
    }
    return this;
  }

  /**
   * Generates a 1D CODE128 barcode ESC/POS sequence.
   */
  barcode128(data: string): this {
    this.alignCenter();
    this.buffer.push(0x1D, 0x68, 60); // Barcode height 60 dots
    this.buffer.push(0x1D, 0x77, 2);  // Barcode width (2 = default)
    this.buffer.push(0x1D, 0x48, 2);  // Print HRI characters below barcode
    this.buffer.push(0x1D, 0x6B, 73, data.length + 2, 0x7B, 0x42); // CODE128 Subset B
    for (let i = 0; i < data.length; i++) {
      this.buffer.push(data.charCodeAt(i));
    }
    this.buffer.push(0x0A);
    return this;
  }

  /**
   * Generates native ESC/POS QR Code.
   */
  qrCode(url: string): this {
    this.alignCenter();
    // Model 2
    this.buffer.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Module size 5
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05);
    // Error correction Level M
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x44, 0x31);
    
    // Store data
    const len = url.length + 3;
    const lenL = len % 256;
    const lenH = Math.floor(len / 256);
    this.buffer.push(0x1D, 0x28, 0x6B, lenL, lenH, 0x31, 0x50, 0x30);
    for (let i = 0; i < url.length; i++) {
      this.buffer.push(url.charCodeAt(i));
    }
    // Print QR
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.lineFeed(1);
    return this;
  }

  getUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  getHex(): string {
    return this.buffer.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  getBase64(): string {
    let binary = '';
    const bytes = this.getUint8Array();
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/**
 * Generate native ESC/POS Uint8Array command stream from receipt configuration & data.
 */
export function generateEscPosBytes(
  config: PrinterSettingConfig,
  data: SaleReceiptData,
  isTest = false
): Uint8Array {
  const builder = new EscPosBuilder();
  const width = config.paperWidth === "58mm" ? "58mm" : "80mm";

  // Test Banner
  if (isTest) {
    builder.alignCenter().bold().setTextSize(1)
      .textLine("*** THERMAL PRINTER TEST ***")
      .setTextSize(0).textLine(`Paper: ${config.paperWidth} | QZ ESC/POS Mode`)
      .divider("dashed", width);
  }

  // 1. HEADER
  if (config.headerAlign === "center") builder.alignCenter();
  else if (config.headerAlign === "right") builder.alignRight();
  else builder.alignLeft();

  if (config.showShopName && config.shopName) {
    builder.bold();
    if (config.shopNameSize === "large") builder.setTextSize(17); // Quad or Double
    else if (config.shopNameSize === "medium") builder.setTextSize(16);
    else builder.setTextSize(0);
    builder.textLine(config.shopName.toUpperCase());
    builder.setTextSize(0).bold(false);
  }

  if (config.showTagline && config.tagline) builder.textLine(config.tagline);
  if (config.showAddress && config.address) builder.textLine(config.address);
  if (config.showPhone && config.phone) builder.textLine(`Ph: ${config.phone}`);
  if (config.showGstin && config.gstin) builder.textLine(`GSTIN: ${config.gstin}`);
  if (config.showEmail && config.email) builder.textLine(`Email: ${config.email}`);
  if (config.showWebsite && config.website) builder.textLine(config.website);
  if (config.additionalHeader) builder.textLine(config.additionalHeader);

  builder.divider(config.dividerStyle, width);

  // 2. BILL INFO
  builder.alignLeft();
  if (config.showInvoiceNum) builder.rowKeyValue("Invoice:", data.invoiceNumber, width);
  if (config.showDate) builder.rowKeyValue("Date & Time:", `${data.date} ${data.time || ""}`.trim(), width);
  if (config.showCounterNum && data.counterNum) builder.rowKeyValue("Counter:", data.counterNum, width);
  if (config.showCashierName && data.cashierName) builder.rowKeyValue("Cashier:", data.cashierName, width);
  if (config.showCustomerName && data.customerName) builder.rowKeyValue("Customer:", data.customerName, width);
  if (config.showCustomerPhone && data.customerPhone) builder.rowKeyValue("Cust Phone:", data.customerPhone, width);
  if (config.showCustomerGstin && data.customerGstin) builder.rowKeyValue("Cust GSTIN:", data.customerGstin, width);

  builder.divider(config.dividerStyle, width);

  // 3. ITEMS TABLE HEADER
  builder.bold();
  if (width === "58mm") {
    builder.rowKeyValue("Item", "Amt (Rs.)", width);
  } else {
    // 48 chars: Item (22), Qty (6), Rate (9), Total (11)
    builder.textLine("Item                   Qty    Rate       Total");
  }
  builder.bold(false);
  builder.divider(config.dividerStyle, width);

  // 4. ITEMS LIST
  data.items.forEach(item => {
    builder.itemRow(
      item.name,
      item.quantity.toString(),
      item.unitPrice.toFixed(2),
      item.total.toFixed(2),
      width
    );
    if (config.showSku && item.sku) {
      builder.textLine(`  SKU: ${item.sku}`);
    }
  });

  builder.divider(config.dividerStyle, width);

  // 5. TOTALS
  if (config.showSubtotal) builder.rowKeyValue("Subtotal:", `Rs. ${data.subtotal.toFixed(2)}`, width);
  if (config.showSummaryDiscount && data.discount > 0) builder.rowKeyValue("Discount:", `-Rs. ${data.discount.toFixed(2)}`, width);
  if (config.showGstTax && data.tax > 0) builder.rowKeyValue("GST Tax:", `+Rs. ${data.tax.toFixed(2)}`, width);
  if (config.showOtherCharges && data.otherCharges) builder.rowKeyValue("Other Charges:", `+Rs. ${data.otherCharges.toFixed(2)}`, width);

  if (config.showGrandTotal) {
    builder.divider("double", width);
    builder.bold().setTextSize(1); // Double height
    builder.rowKeyValue("GRAND TOTAL:", `Rs. ${data.grandTotal.toFixed(2)}`, width);
    builder.setTextSize(0).bold(false);
    builder.divider("double", width);
  }

  // 6. PAYMENT INFO
  if (config.showPaymentMethod) builder.rowKeyValue("Payment Method:", data.paymentMethod, width);
  if (config.showAmountReceived && data.amountReceived) builder.rowKeyValue("Amount Received:", `Rs. ${data.amountReceived.toFixed(2)}`, width);
  if (config.showChangeReturned && data.changeReturned > 0) builder.rowKeyValue("Change Returned:", `Rs. ${data.changeReturned.toFixed(2)}`, width);
  if (config.showTransactionRef && data.transactionRef) builder.rowKeyValue("Ref #:", data.transactionRef, width);

  builder.divider(config.dividerStyle, width);

  // 7. FOOTER
  if (config.footerAlign === "center") builder.alignCenter();
  else if (config.footerAlign === "right") builder.alignRight();
  else builder.alignLeft();

  if (config.showThankYou && config.thankYouMessage) builder.bold().textLine(config.thankYouMessage).bold(false);
  if (config.showAdditionalFooter && config.additionalFooter) builder.textLine(config.additionalFooter);
  if (config.showReturnPolicy && config.returnPolicy) builder.textLine(`* ${config.returnPolicy}`);
  if (config.customerSupport) builder.textLine(config.customerSupport);

  // 8. BARCODE / QR CODE
  if (config.showInvoiceBarcode && data.invoiceNumber) {
    builder.lineFeed(1);
    try {
      builder.barcode128(data.invoiceNumber);
    } catch (e) {
      builder.textLine(`* ${data.invoiceNumber} *`);
    }
  }

  if (config.showQrCode && config.qrTargetUrl) {
    builder.lineFeed(1);
    try {
      builder.qrCode(config.qrTargetUrl);
    } catch (e) {
      // ignore
    }
  }

  // 9. CUT & DRAWER KICK
  if (config.openCashDrawer) builder.openCashDrawer();
  if (config.cutPaper) builder.cutPaper(false);
  else builder.lineFeed(4);

  return builder.getUint8Array();
}

/**
 * Service to manage printer connectivity, QZ Tray connection, and ESC/POS thermal printing.
 */
export class PrinterService {
  private static qzConnecting: Promise<void> | null = null;
  private static qzActiveStatus: boolean = false;
  private static lastError: string | null = null;

  /**
   * Establishes / ensures WebSocket connection with local QZ Tray instance.
   */
  static async connectQz(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    if (qz.websocket.isActive()) {
      this.qzActiveStatus = true;
      this.lastError = null;
      return true;
    }

    if (this.qzConnecting) {
      await this.qzConnecting;
      return qz.websocket.isActive();
    }

    this.qzConnecting = (async () => {
      try {
        await qz.websocket.connect({ retries: 2, delay: 1 });
        this.qzActiveStatus = true;
        this.lastError = null;
      } catch (err: any) {
        this.qzActiveStatus = false;
        this.lastError = err?.message || "QZ Tray WebSocket connection failed";
      } finally {
        this.qzConnecting = null;
      }
    })();

    await this.qzConnecting;
    return this.qzActiveStatus;
  }

  /**
   * Get available Windows printers detected by QZ Tray or fallback list.
   */
  static async getPrinters(): Promise<string[]> {
    try {
      const connected = await this.connectQz();
      if (connected) {
        const list = await qz.printers.find();
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      }
    } catch (err) {
      console.warn("Could not query QZ Tray printers:", err);
    }

    // Default fallback list
    return [
      "RP80 Printer(1)",
      "RP80 Printer",
      "Rugtek RP-326",
      "EPSON TM-T82 Thermal Printer",
      "TVS Electronics RP 3160",
      "POS-80 Thermal Printer",
      "Browser Print / PDF"
    ];
  }

  /**
   * Check connection status of QZ Tray and thermal printer.
   */
  static getStatus(configuredPrinter?: string): { connected: boolean; message: string; qzActive: boolean; printerName: string } {
    const isQzActive = qz.websocket.isActive() || this.qzActiveStatus;
    const targetPrinter = configuredPrinter || "RP80 Printer(1)";

    if (isQzActive) {
      return {
        connected: true,
        message: `QZ Tray Connected | Printer: ${targetPrinter}`,
        qzActive: true,
        printerName: targetPrinter,
      };
    } else {
      return {
        connected: false,
        message: this.lastError
          ? `QZ Tray Disconnected (${this.lastError})`
          : "QZ Tray Not Running (Start QZ Tray for ESC/POS printing)",
        qzActive: false,
        printerName: targetPrinter,
      };
    }
  }

  /**
   * Performs a test print using ESC/POS over QZ Tray.
   */
  static async testPrint(config: PrinterSettingConfig): Promise<{ success: boolean; message: string }> {
    try {
      const testData: SaleReceiptData = {
        invoiceNumber: "TEST-000001",
        date: new Date().toLocaleDateString("en-IN"),
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        counterNum: "#1",
        cashierName: "Admin Test",
        customerName: "Printer Diagnostic Test",
        items: [
          { name: "Diagnostic Test Item A", quantity: 1, unitPrice: 100.0, total: 100.0 },
          { name: "Diagnostic Test Item B", quantity: 2, unitPrice: 50.0, total: 100.0 }
        ],
        subtotal: 200.0,
        discount: 0,
        tax: 0,
        grandTotal: 200.0,
        paymentMethod: "TEST",
        amountReceived: 200.0,
        changeReturned: 0.0
      };

      return await this.printReceipt(config, testData, true);
    } catch (err: any) {
      return { success: false, message: err?.message || "Failed to execute thermal test print." };
    }
  }

  /**
   * Primary entry point to print actual sale receipt using ESC/POS thermal commands.
   */
  static async printReceipt(
    config: PrinterSettingConfig,
    data: SaleReceiptData,
    isTest = false
  ): Promise<{ success: boolean; message: string }> {
    // Check if user explicitly selected Browser Print fallback mode
    if (config.printMode === "BROWSER" || config.printerName === "Browser Print / PDF") {
      await this.printReceiptBrowser(config, data, isTest);
      return { success: true, message: "Receipt sent to browser print dialog." };
    }

    // Attempt QZ Tray Connection
    const isQzReady = await this.connectQz();
    if (!isQzReady) {
      throw new Error(
        `QZ Tray is not running on this PC. Please start QZ Tray and click Retry Print. (Configured Printer: ${config.printerName || "RP80 Printer(1)"})`
      );
    }

    const targetPrinter = config.printerName || "RP80 Printer(1)";

    // Verify Printer Existence in QZ
    let matchedPrinterName: string | null = null;
    try {
      const printersList = await qz.printers.find();
      if (Array.isArray(printersList)) {
        matchedPrinterName = printersList.find(
          (p: string) => p.toLowerCase() === targetPrinter.toLowerCase() || p.toLowerCase().includes(targetPrinter.toLowerCase())
        ) || null;
      }
    } catch (e) {
      console.warn("Failed printer query, attempting exact name match:", e);
    }

    const printerToUse = matchedPrinterName || targetPrinter;

    // Generate Raw ESC/POS Binary Stream
    const escPosBytes = generateEscPosBytes(config, data, isTest);
    
    // Convert to Base64 payload for QZ Tray raw printing
    let binaryStr = "";
    for (let i = 0; i < escPosBytes.length; i++) {
      binaryStr += String.fromCharCode(escPosBytes[i]);
    }
    const base64EscPos = btoa(binaryStr);

    const qzConfig = qz.configs.create(printerToUse, {
      altPrinting: true,
      copies: config.copies || 1,
    });

    const printData = [
      {
        type: "raw",
        format: "command",
        flavor: "base64",
        data: base64EscPos,
      },
    ];

    try {
      await qz.print(qzConfig, printData);
      return { success: true, message: `Receipt printed successfully on ${printerToUse}` };
    } catch (printErr: any) {
      console.error("QZ Tray Print Error:", printErr);
      throw new Error(
        `Thermal printer "${printerToUse}" failed to accept print job: ${printErr?.message || printErr}`
      );
    }
  }

  /**
   * Browser HTML iframe fallback print path (explicit fallback only).
   */
  static async printReceiptBrowser(
    config: PrinterSettingConfig,
    data: SaleReceiptData,
    isTest = false
  ): Promise<void> {
    const htmlContent = generateReceiptHtml(config, data, isTest);

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0px";
    printFrame.style.height = "0px";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      throw new Error("Could not initialize browser printing frame");
    }

    frameDoc.open();
    frameDoc.write(htmlContent);
    frameDoc.close();

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
          resolve();
        }, 500);
      }, 300);
    });
  }
}

/**
 * Renders the divider line based on configuration style.
 */
export function getDividerString(style: string, width: "58mm" | "80mm" | string): string {
  const charsCount = width === "58mm" ? 32 : 48;
  switch (style) {
    case "solid":
      return "─".repeat(charsCount);
    case "double":
      return "═".repeat(charsCount);
    case "none":
      return "";
    case "dashed":
    default:
      return "-".repeat(charsCount);
  }
}

/**
 * Generates raw, clean, thermal-optimized printable HTML document for browser fallback.
 */
export function generateReceiptHtml(
  config: PrinterSettingConfig,
  data: SaleReceiptData,
  isTest = false
): string {
  const is58 = config.paperWidth === "58mm";
  const paperWidthPx = is58 ? "58mm" : "80mm";
  const dividerChar = is58 ? "--------------------------------" : "------------------------------------------------";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt ${data.invoiceNumber}</title>
        <style>
          @page {
            size: ${paperWidthPx} auto;
            margin: 0mm;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: ${config.fontSize === "small" ? "10px" : config.fontSize === "large" ? "13px" : "11px"};
            line-height: 1.25;
            width: ${paperWidthPx};
            margin: 0 auto;
            padding: 4mm 2mm;
            color: #000;
            background: #fff;
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .left { text-align: left; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          
          .shop-title {
            font-size: ${config.shopNameSize === "small" ? "12px" : config.shopNameSize === "large" ? "17px" : "14px"};
            font-weight: ${config.shopNameStyle === "bold" ? "bold" : "normal"};
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .tagline { font-style: italic; font-size: 0.9em; margin-bottom: 4px; }
          .meta-line { font-size: 0.88em; margin-bottom: 2px; }
          .divider { margin: 4px 0; font-family: monospace; white-space: pre; overflow: hidden; }
          
          .item-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.95em; }
          .item-name { font-weight: bold; word-break: break-word; }
          .item-sub { display: flex; justify-content: space-between; font-size: 0.88em; padding-left: 8px; color: #333; }
          
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          .grand-total { font-size: 1.2em; font-weight: bold; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 3px 0; margin: 4px 0; }
          
          .footer-text { margin-top: 8px; font-size: 0.88em; }
          .logo-img { max-width: 70%; max-height: 50px; display: block; margin: 0 auto 6px auto; }
          
          .test-badge {
            border: 2px dashed #000;
            padding: 4px;
            text-align: center;
            font-weight: bold;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        ${isTest ? `<div class="test-badge">*** THERMAL PRINTER TEST ***<br>Paper: ${config.paperWidth}</div>` : ""}
        
        <!-- HEADER -->
        <div class="${config.headerAlign}">
          ${config.showLogo && config.logoUrl ? `<img src="${config.logoUrl}" class="logo-img" style="margin-${config.logoAlign === "left" ? "right" : config.logoAlign === "right" ? "left" : "left"}: auto;" />` : ""}
          ${config.showShopName ? `<div class="shop-title">${config.shopName || "SUPERMARKET POS"}</div>` : ""}
          ${config.showTagline && config.tagline ? `<div class="tagline">${config.tagline}</div>` : ""}
          ${config.showAddress && config.address ? `<div class="meta-line">${config.address}</div>` : ""}
          ${config.showPhone && config.phone ? `<div class="meta-line">Ph: ${config.phone}</div>` : ""}
          ${config.showGstin && config.gstin ? `<div class="meta-line">GSTIN: ${config.gstin}</div>` : ""}
          ${config.showEmail && config.email ? `<div class="meta-line">Email: ${config.email}</div>` : ""}
          ${config.showWebsite && config.website ? `<div class="meta-line">${config.website}</div>` : ""}
          ${config.additionalHeader ? `<div class="meta-line">${config.additionalHeader}</div>` : ""}
        </div>

        <div class="divider">${dividerChar}</div>

        <!-- BILL INFO -->
        <div class="left">
          ${config.showInvoiceNum ? `<div>Invoice: <span class="bold">${data.invoiceNumber}</span></div>` : ""}
          ${config.showDate ? `<div>Date: ${data.date} ${config.showTime && data.time ? ` ${data.time}` : ""}</div>` : ""}
          ${config.showCounterNum && data.counterNum ? `<div>Counter: ${data.counterNum}</div>` : ""}
          ${config.showCashierName && data.cashierName ? `<div>Cashier: ${data.cashierName}</div>` : ""}
          ${config.showCustomerName && data.customerName ? `<div>Customer: ${data.customerName}</div>` : ""}
          ${config.showCustomerPhone && data.customerPhone ? `<div>Cust Phone: ${data.customerPhone}</div>` : ""}
          ${config.showCustomerGstin && data.customerGstin ? `<div>Cust GSTIN: ${data.customerGstin}</div>` : ""}
        </div>

        <div class="divider">${dividerChar}</div>

        <!-- ITEMS HEADER -->
        ${is58 ? `
          <div class="item-row bold"><span>Item</span><span>Amt</span></div>
        ` : `
          <div style="display: flex; justify-content: space-between;" class="bold">
            <span style="flex: 2;">Item</span>
            <span style="flex: 1; text-align: center;">Qty x Rate</span>
            <span style="flex: 1; text-align: right;">Total</span>
          </div>
        `}
        <div class="divider">${dividerChar}</div>

        <!-- ITEMS LIST -->
        ${data.items.map(item => {
          if (is58) {
            return `
              <div style="margin-bottom: 4px;">
                <div class="item-name">${item.name}</div>
                <div class="item-sub">
                  <span>${item.quantity} x Rs. ${item.unitPrice.toFixed(2)}</span>
                  <span class="bold">Rs. ${item.total.toFixed(2)}</span>
                </div>
              </div>
            `;
          }
          return `
            <div style="margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="flex: 2;" class="item-name">${item.name}</span>
                <span style="flex: 1; text-align: center;">${item.quantity} x Rs. ${item.unitPrice.toFixed(2)}</span>
                <span style="flex: 1; text-align: right;" class="bold">Rs. ${item.total.toFixed(2)}</span>
              </div>
              ${config.showSku && item.sku ? `<div style="font-size: 0.8em; color: #555;">SKU: ${item.sku}</div>` : ""}
            </div>
          `;
        }).join("")}

        <div class="divider">${dividerChar}</div>

        <!-- TOTALS -->
        ${config.showSubtotal ? `<div class="summary-row"><span>Subtotal:</span><span>Rs. ${data.subtotal.toFixed(2)}</span></div>` : ""}
        ${config.showSummaryDiscount && data.discount > 0 ? `<div class="summary-row"><span>Discount:</span><span>-Rs. ${data.discount.toFixed(2)}</span></div>` : ""}
        ${config.showGstTax && data.tax > 0 ? `<div class="summary-row"><span>GST / Tax:</span><span>+Rs. ${data.tax.toFixed(2)}</span></div>` : ""}
        ${config.showOtherCharges && data.otherCharges ? `<div class="summary-row"><span>Other Charges:</span><span>+Rs. ${data.otherCharges.toFixed(2)}</span></div>` : ""}

        ${config.showGrandTotal ? `
          <div class="summary-row grand-total">
            <span>GRAND TOTAL:</span>
            <span>Rs. ${data.grandTotal.toFixed(2)}</span>
          </div>
        ` : ""}

        <!-- PAYMENT INFO -->
        ${config.showPaymentMethod ? `<div class="summary-row"><span>Payment:</span><span class="bold">${data.paymentMethod}</span></div>` : ""}
        ${config.showAmountReceived && data.amountReceived ? `<div class="summary-row"><span>Received:</span><span>Rs. ${data.amountReceived.toFixed(2)}</span></div>` : ""}
        ${config.showChangeReturned && data.changeReturned > 0 ? `<div class="summary-row"><span>Change:</span><span>Rs. ${data.changeReturned.toFixed(2)}</span></div>` : ""}
        ${config.showTransactionRef && data.transactionRef ? `<div class="summary-row"><span>Ref:</span><span>${data.transactionRef}</span></div>` : ""}

        <div class="divider">${dividerChar}</div>

        <!-- FOOTER -->
        <div class="${config.footerAlign} footer-text">
          ${config.showThankYou && config.thankYouMessage ? `<div class="bold">${config.thankYouMessage}</div>` : ""}
          ${config.showAdditionalFooter && config.additionalFooter ? `<div>${config.additionalFooter}</div>` : ""}
          ${config.showReturnPolicy && config.returnPolicy ? `<div style="font-size: 0.82em; margin-top: 4px;">* ${config.returnPolicy}</div>` : ""}
          ${config.customerSupport ? `<div style="font-size: 0.82em; margin-top: 2px;">${config.customerSupport}</div>` : ""}
        </div>

        ${config.showInvoiceBarcode ? `
          <div class="center" style="margin-top: 8px;">
            <div style="font-family: monospace; letter-spacing: 3px; font-weight: bold; font-size: 1.1em;">|||| | ||||| ||| ||||</div>
            <div style="font-size: 0.8em;">${data.invoiceNumber}</div>
          </div>
        ` : ""}
      </body>
    </html>
  `;
}
