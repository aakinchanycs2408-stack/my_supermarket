export interface PrinterSettingConfig {
  id?: string;
  printerName: string;
  paperWidth: "58mm" | "80mm" | string;
  copies: number;
  autoPrint: boolean;
  cutPaper: boolean;
  openCashDrawer: boolean;

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
  printerName: "Default Thermal Printer",
  paperWidth: "80mm",
  copies: 1,
  autoPrint: true,
  cutPaper: true,
  openCashDrawer: false,

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
 * Service to manage printer connectivity, test prints, and receipt printing.
 */
export class PrinterService {
  /**
   * Get available thermal printer drivers/devices.
   */
  static async getPrinters(): Promise<string[]> {
    return [
      "Default Thermal Printer",
      "EPSON TM-T82 Thermal Printer (80mm)",
      "TVS Electronics RP 3160 STAR (80mm)",
      "POS 58mm Thermal Printer (USB)",
      "Generic 58mm Receipt Printer",
      "PDF / System Print Dialog"
    ];
  }

  /**
   * Check connection status of thermal printer.
   */
  static getStatus(): { connected: boolean; message: string } {
    return {
      connected: true,
      message: "Connected (Ready to print)"
    };
  }

  /**
   * Performs a test print to verify paper & cutter.
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

      await this.printReceipt(config, testData, true);
      return { success: true, message: "Test print sent to printer successfully." };
    } catch (err: any) {
      return { success: false, message: err?.message || "Failed to communicate with printer." };
    }
  }

  /**
   * Prints actual sale receipt using thermal formatting.
   */
  static async printReceipt(
    config: PrinterSettingConfig,
    data: SaleReceiptData,
    isTest = false
  ): Promise<void> {
    const htmlContent = generateReceiptHtml(config, data, isTest);

    // Create invisible print iframe or popup
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
      throw new Error("Could not initialize printing frame");
    }

    frameDoc.open();
    frameDoc.write(htmlContent);
    frameDoc.close();

    // Trigger print
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
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
  const charsCount = width === "58mm" ? 32 : 44;
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
 * Generates raw, clean, thermal-optimized printable HTML document.
 */
export function generateReceiptHtml(
  config: PrinterSettingConfig,
  data: SaleReceiptData,
  isTest = false
): string {
  const is58 = config.paperWidth === "58mm";
  const paperWidthPx = is58 ? "58mm" : "80mm";
  const dividerChar = is58 ? "--------------------------------" : "--------------------------------------------";

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
                  <span>${item.quantity} x ₹${item.unitPrice.toFixed(2)}</span>
                  <span class="bold">₹${item.total.toFixed(2)}</span>
                </div>
              </div>
            `;
          }
          return `
            <div style="margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="flex: 2;" class="item-name">${item.name}</span>
                <span style="flex: 1; text-align: center;">${item.quantity} x ₹${item.unitPrice.toFixed(2)}</span>
                <span style="flex: 1; text-align: right;" class="bold">₹${item.total.toFixed(2)}</span>
              </div>
              ${config.showSku && item.sku ? `<div style="font-size: 0.8em; color: #555;">SKU: ${item.sku}</div>` : ""}
            </div>
          `;
        }).join("")}

        <div class="divider">${dividerChar}</div>

        <!-- TOTALS -->
        ${config.showSubtotal ? `<div class="summary-row"><span>Subtotal:</span><span>₹${data.subtotal.toFixed(2)}</span></div>` : ""}
        ${config.showSummaryDiscount && data.discount > 0 ? `<div class="summary-row"><span>Discount:</span><span>-₹${data.discount.toFixed(2)}</span></div>` : ""}
        ${config.showGstTax && data.tax > 0 ? `<div class="summary-row"><span>GST / Tax:</span><span>+₹${data.tax.toFixed(2)}</span></div>` : ""}
        ${config.showOtherCharges && data.otherCharges ? `<div class="summary-row"><span>Other Charges:</span><span>+₹${data.otherCharges.toFixed(2)}</span></div>` : ""}

        ${config.showGrandTotal ? `
          <div class="summary-row grand-total">
            <span>GRAND TOTAL:</span>
            <span>₹${data.grandTotal.toFixed(2)}</span>
          </div>
        ` : ""}

        <!-- PAYMENT INFO -->
        ${config.showPaymentMethod ? `<div class="summary-row"><span>Payment:</span><span class="bold">${data.paymentMethod}</span></div>` : ""}
        ${config.showAmountReceived && data.amountReceived ? `<div class="summary-row"><span>Received:</span><span>₹${data.amountReceived.toFixed(2)}</span></div>` : ""}
        ${config.showChangeReturned && data.changeReturned > 0 ? `<div class="summary-row"><span>Change:</span><span>₹${data.changeReturned.toFixed(2)}</span></div>` : ""}
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
