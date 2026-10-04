import React, { useState, useEffect, ChangeEvent, FormEvent } from "react";
import {
  PrinterSettingConfig,
  DEFAULT_PRINTER_SETTING,
  SAMPLE_RECEIPT_DATA,
  PrinterService,
  generateReceiptHtml,
} from "../services/printerService";

interface PrinterSettingsProps {
  api: (path: string, options?: any) => Promise<any>;
  userRole?: string;
}

export function PrinterSettings({ api, userRole }: PrinterSettingsProps) {
  const [config, setConfig] = useState<PrinterSettingConfig>(DEFAULT_PRINTER_SETTING);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [statusInfo, setStatusInfo] = useState({ connected: true, message: "Connected" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Template State
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Load configuration & available printers on mount
  useEffect(() => {
    let isMounted = true;
    const loadSettingsAndPrinters = async () => {
      try {
        const [sett, tmpl, prnters] = await Promise.all([
          api("/api/printer-settings").catch(() => DEFAULT_PRINTER_SETTING),
          api("/api/receipt-templates").catch(() => []),
          PrinterService.getPrinters(),
        ]);
        if (isMounted) {
          if (sett) setConfig({ ...DEFAULT_PRINTER_SETTING, ...sett });
          if (Array.isArray(tmpl)) setTemplates(tmpl);
          if (Array.isArray(prnters) && prnters.length > 0) setAvailablePrinters(prnters);
          setStatusInfo(PrinterService.getStatus(sett?.printerName));
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };

    loadSettingsAndPrinters();

    // Periodic check for QZ Tray status
    const timer = setInterval(() => {
      if (isMounted) {
        setStatusInfo(PrinterService.getStatus(config.printerName));
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [api]);

  const refreshPrintersList = async () => {
    setLoading(true);
    const prnters = await PrinterService.getPrinters();
    setAvailablePrinters(prnters);
    setStatusInfo(PrinterService.getStatus(config.printerName));
    setLoading(false);
  };

  const updateConfig = (key: keyof PrinterSettingConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (PNG/JPG/WEBP)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Logo image size should be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      updateConfig("logoUrl", base64);
      updateConfig("showLogo", true);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);
    try {
      const updated = await api("/api/printer-settings", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      setConfig({ ...DEFAULT_PRINTER_SETTING, ...updated });
      setSaveMessage("Printer & receipt settings saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to save printer settings");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    if (window.confirm("Reset all receipt & printer settings to factory default?")) {
      setConfig(DEFAULT_PRINTER_SETTING);
      setSaveMessage("Reset to defaults (click Save to persist)");
    }
  };

  const handleTestPrint = async () => {
    setTestResult(null);
    const res = await PrinterService.testPrint(config);
    setTestResult(res);
  };

  const handleSaveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    try {
      const newTmpl = await api("/api/receipt-templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          paperWidth: config.paperWidth,
          configuration: JSON.stringify(config),
          isDefault: false,
        }),
      });
      setTemplates((prev) => [newTmpl, ...prev]);
      setTemplateName("");
      setShowTemplateModal(false);
      setSaveMessage(`Template "${newTmpl.name}" saved!`);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to save template");
    }
  };

  const handleLoadTemplate = (tmpl: any) => {
    try {
      const parsed = typeof tmpl.configuration === "string" ? JSON.parse(tmpl.configuration) : tmpl.configuration;
      setConfig({ ...DEFAULT_PRINTER_SETTING, ...parsed });
      setSaveMessage(`Loaded template "${tmpl.name}"`);
    } catch (e) {
      setErrorMessage("Error loading template payload");
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await api(`/api/receipt-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to delete template");
    }
  };

  if (loading) {
    return <div className="loading">Loading Printer & Receipt Configuration...</div>;
  }

  const isAdmin = userRole !== "CASHIER";

  return (
    <div className="printer-settings-container" style={{ padding: "16px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", color: "var(--text-1)" }}>Printer Settings & Receipt Customizer</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "13px" }}>
            Configure thermal printer options and customize live customer receipt layouts.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {isAdmin && (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={handleResetDefault}
                style={{ height: "36px", fontSize: "13px" }}
              >
                Reset Default
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSaveSettings}
                disabled={saving}
                style={{ height: "36px", fontSize: "13px" }}
              >
                {saving ? "Saving..." : "Save Printer Settings"}
              </button>
            </>
          )}
        </div>
      </div>

      {saveMessage && <div className="success" style={{ marginBottom: "12px", padding: "10px 14px" }}>{saveMessage}</div>}
      {errorMessage && <div className="error" style={{ marginBottom: "12px", padding: "10px 14px" }}>{errorMessage}</div>}

      {/* 2-COLUMN LAYOUT: 40% Settings | 60% Live Preview */}
      <div className="printer-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "start" }}>
        {/* LEFT PANEL - SETTINGS */}
        <div className="printer-settings-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* PRINTER HARDWARE CONFIG */}
          <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>&#x1F5A8;</span> Printer Hardware & Output
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>Select Installed Thermal Printer</label>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={refreshPrintersList}
                  style={{ fontSize: "11px", padding: "2px 8px", height: "auto" }}
                >
                  🔄 Scan Printers
                </button>
              </div>
              <select
                value={config.printerName}
                onChange={(e) => updateConfig("printerName", e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-1)" }}
              >
                {availablePrinters.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Printing Engine</label>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", height: "36px" }}>
                <label style={{ cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="radio"
                    name="printMode"
                    value="ESC_POS"
                    checked={config.printMode !== "BROWSER" && config.printerName !== "Browser Print / PDF"}
                    onChange={() => updateConfig("printMode", "ESC_POS")}
                  />{" "}
                  ⚡ Direct ESC/POS Thermal (QZ Tray)
                </label>
                <label style={{ cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="radio"
                    name="printMode"
                    value="BROWSER"
                    checked={config.printMode === "BROWSER" || config.printerName === "Browser Print / PDF"}
                    onChange={() => updateConfig("printMode", "BROWSER")}
                  />{" "}
                  🌐 Browser Print / PDF (Fallback)
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Paper Width</label>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", height: "36px" }}>
                  <label style={{ cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="paperWidth"
                      value="58mm"
                      checked={config.paperWidth === "58mm"}
                      onChange={(e) => updateConfig("paperWidth", e.target.value)}
                    />{" "}
                    58mm (Compact)
                  </label>
                  <label style={{ cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="paperWidth"
                      value="80mm"
                      checked={config.paperWidth === "80mm"}
                      onChange={(e) => updateConfig("paperWidth", e.target.value)}
                    />{" "}
                    80mm (Standard)
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Copies</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={config.copies}
                  onChange={(e) => updateConfig("copies", parseInt(e.target.value) || 1)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-1)" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={config.autoPrint}
                  onChange={(e) => updateConfig("autoPrint", e.target.checked)}
                />
                Auto Print Thermal Receipt After Successful Sale
              </label>

              <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={config.cutPaper}
                  onChange={(e) => updateConfig("cutPaper", e.target.checked)}
                />
                Send ESC/POS Full Paper Cut Command
              </label>

              <label style={{ fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={config.openCashDrawer}
                  onChange={(e) => updateConfig("openCashDrawer", e.target.checked)}
                />
                Send Cash Drawer Pulse Command (ESC p)
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: statusInfo.connected ? "var(--green, #27ae60)" : "var(--red, #e74c3c)" }}>
                  ● {statusInfo.message}
                </div>
                {!statusInfo.connected && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Ensure QZ Tray service is running on Windows to enable silent ESC/POS thermal printing.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={handleTestPrint}
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                🖨️ Test Thermal Print
              </button>
            </div>

            {testResult && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: testResult.success ? "var(--green)" : "var(--red)" }}>
                {testResult.message}
              </div>
            )}
          </div>

          {/* STORE & RECEIPT HEADER DETAILS */}
          <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Store Receipt Header</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Shop Name</label>
                <input
                  type="text"
                  value={config.shopName}
                  onChange={(e) => updateConfig("shopName", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Tagline</label>
                <input
                  type="text"
                  value={config.tagline}
                  onChange={(e) => updateConfig("tagline", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Address</label>
              <input
                type="text"
                value={config.address}
                onChange={(e) => updateConfig("address", e.target.value)}
                style={{ width: "100%", padding: "6px", fontSize: "13px" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Phone</label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={(e) => updateConfig("phone", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>GSTIN</label>
                <input
                  type="text"
                  value={config.gstin}
                  onChange={(e) => updateConfig("gstin", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Email</label>
                <input
                  type="text"
                  value={config.email}
                  onChange={(e) => updateConfig("email", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Website</label>
                <input
                  type="text"
                  value={config.website}
                  onChange={(e) => updateConfig("website", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "13px" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Additional Header Text</label>
              <input
                type="text"
                value={config.additionalHeader}
                onChange={(e) => updateConfig("additionalHeader", e.target.value)}
                placeholder="e.g., FSSAI Lic No / Branch Code"
                style={{ width: "100%", padding: "6px", fontSize: "13px" }}
              />
            </div>
          </div>

          {/* SHOP LOGO */}
          <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Shop Logo</h3>

            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              {config.logoUrl ? (
                <div style={{ border: "1px dashed var(--border)", padding: "4px", borderRadius: "4px", background: "#fff" }}>
                  <img src={config.logoUrl} alt="Logo Preview" style={{ maxHeight: "40px", maxWidth: "100px", objectFit: "contain" }} />
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>No logo uploaded</div>
              )}

              <div style={{ display: "flex", gap: "8px" }}>
                <label className="btn ghost" style={{ cursor: "pointer", fontSize: "12px", padding: "4px 8px" }}>
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                </label>

                {config.logoUrl && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => updateConfig("logoUrl", "")}
                    style={{ color: "var(--red)", fontSize: "12px", padding: "4px 8px" }}
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
              <label style={{ fontSize: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.showLogo}
                  onChange={(e) => updateConfig("showLogo", e.target.checked)}
                />{" "}
                Show Logo On Receipt
              </label>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px" }}>
                <span>Align:</span>
                {(["left", "center", "right"] as const).map((al) => (
                  <label key={al} style={{ cursor: "pointer", textTransform: "capitalize" }}>
                    <input
                      type="radio"
                      name="logoAlign"
                      value={al}
                      checked={config.logoAlign === al}
                      onChange={(e) => updateConfig("logoAlign", e.target.value)}
                    />{" "}
                    {al}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* VISIBLE FIELDS CONFIGURATION */}
          <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Receipt Sections & Column Toggles</h3>

            {/* Header section checkboxes */}
            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>Header Elements</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "12px" }}>
                <label><input type="checkbox" checked={config.showShopName} onChange={(e) => updateConfig("showShopName", e.target.checked)} /> Shop Name</label>
                <label><input type="checkbox" checked={config.showTagline} onChange={(e) => updateConfig("showTagline", e.target.checked)} /> Tagline</label>
                <label><input type="checkbox" checked={config.showAddress} onChange={(e) => updateConfig("showAddress", e.target.checked)} /> Address</label>
                <label><input type="checkbox" checked={config.showPhone} onChange={(e) => updateConfig("showPhone", e.target.checked)} /> Phone</label>
                <label><input type="checkbox" checked={config.showGstin} onChange={(e) => updateConfig("showGstin", e.target.checked)} /> GSTIN</label>
                <label><input type="checkbox" checked={config.showEmail} onChange={(e) => updateConfig("showEmail", e.target.checked)} /> Email</label>
              </div>
            </div>

            {/* Bill Info Checkboxes */}
            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>Bill & Customer Metadata</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "12px" }}>
                <label><input type="checkbox" checked={config.showInvoiceNum} onChange={(e) => updateConfig("showInvoiceNum", e.target.checked)} /> Invoice #</label>
                <label><input type="checkbox" checked={config.showDate} onChange={(e) => updateConfig("showDate", e.target.checked)} /> Date</label>
                <label><input type="checkbox" checked={config.showTime} onChange={(e) => updateConfig("showTime", e.target.checked)} /> Time</label>
                <label><input type="checkbox" checked={config.showCounterNum} onChange={(e) => updateConfig("showCounterNum", e.target.checked)} /> Counter #</label>
                <label><input type="checkbox" checked={config.showCashierName} onChange={(e) => updateConfig("showCashierName", e.target.checked)} /> Cashier Name</label>
                <label><input type="checkbox" checked={config.showCustomerName} onChange={(e) => updateConfig("showCustomerName", e.target.checked)} /> Customer Name</label>
              </div>
            </div>

            {/* Item Details Columns */}
            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>Item List Columns</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "12px" }}>
                <label><input type="checkbox" checked={config.showProductName} onChange={(e) => updateConfig("showProductName", e.target.checked)} /> Product Name</label>
                <label><input type="checkbox" checked={config.showQuantity} onChange={(e) => updateConfig("showQuantity", e.target.checked)} /> Quantity</label>
                <label><input type="checkbox" checked={config.showRate} onChange={(e) => updateConfig("showRate", e.target.checked)} /> Rate/Unit</label>
                <label><input type="checkbox" checked={config.showTotal} onChange={(e) => updateConfig("showTotal", e.target.checked)} /> Total</label>
                <label><input type="checkbox" checked={config.showSku} onChange={(e) => updateConfig("showSku", e.target.checked)} /> SKU</label>
              </div>
            </div>

            {/* Totals & Payment */}
            <div>
              <strong style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>Totals & Payment Summary</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "12px" }}>
                <label><input type="checkbox" checked={config.showSubtotal} onChange={(e) => updateConfig("showSubtotal", e.target.checked)} /> Subtotal</label>
                <label><input type="checkbox" checked={config.showSummaryDiscount} onChange={(e) => updateConfig("showSummaryDiscount", e.target.checked)} /> Discount</label>
                <label><input type="checkbox" checked={config.showGstTax} onChange={(e) => updateConfig("showGstTax", e.target.checked)} /> GST / Tax</label>
                <label><input type="checkbox" checked={config.showGrandTotal} onChange={(e) => updateConfig("showGrandTotal", e.target.checked)} /> Grand Total</label>
                <label><input type="checkbox" checked={config.showPaymentMethod} onChange={(e) => updateConfig("showPaymentMethod", e.target.checked)} /> Payment Method</label>
                <label><input type="checkbox" checked={config.showChangeReturned} onChange={(e) => updateConfig("showChangeReturned", e.target.checked)} /> Change Returned</label>
              </div>
            </div>
          </div>

          {/* FOOTER & STYLING */}
          <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px" }}>Footer Messages & Divider Style</h3>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Thank You Message</label>
              <input
                type="text"
                value={config.thankYouMessage}
                onChange={(e) => updateConfig("thankYouMessage", e.target.value)}
                style={{ width: "100%", padding: "6px", fontSize: "13px" }}
              />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "2px" }}>Return Policy Text</label>
              <input
                type="text"
                value={config.returnPolicy}
                onChange={(e) => updateConfig("returnPolicy", e.target.value)}
                style={{ width: "100%", padding: "6px", fontSize: "13px" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Font Size</label>
                <select
                  value={config.fontSize}
                  onChange={(e) => updateConfig("fontSize", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "12px" }}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Divider Line Style</label>
                <select
                  value={config.dividerStyle}
                  onChange={(e) => updateConfig("dividerStyle", e.target.value)}
                  style={{ width: "100%", padding: "6px", fontSize: "12px" }}
                >
                  <option value="dashed">Dashed (----------------)</option>
                  <option value="solid">Solid (────────────────)</option>
                  <option value="double">Double (════════════════)</option>
                </select>
              </div>
            </div>
          </div>

          {/* TEMPLATES */}
          {isAdmin && (
            <div className="panel" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "15px" }}>Saved Receipt Templates</h3>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowTemplateModal(true)}
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                >
                  + Save Current as Template
                </button>
              </div>

              {templates.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No saved templates yet. Click "+ Save Current as Template" to create templates for 58mm or 80mm layouts.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        background: "var(--bg-1)",
                        borderRadius: "4px",
                        border: "1px solid var(--border)",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <strong>{t.name}</strong>{" "}
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({t.paperWidth})</span>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleLoadTemplate(t)}
                          style={{ fontSize: "11px", padding: "2px 6px" }}
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleDeleteTemplate(t.id, t.name)}
                          style={{ fontSize: "11px", padding: "2px 6px", color: "var(--red)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL - LIVE RECEIPT PREVIEW */}
        <div
          className="printer-preview-panel"
          style={{
            position: "sticky",
            top: "16px",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>Live Receipt Preview</h3>
            <span style={{ fontSize: "12px", fontWeight: 700, padding: "2px 8px", background: "var(--accent-glow)", borderRadius: "4px", color: "var(--accent)" }}>
              {config.paperWidth} Thermal Width
            </span>
          </div>

          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              background: "#e5e7eb",
              padding: "24px 16px",
              borderRadius: "8px",
              overflowX: "auto",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            {/* PHYSICAL PAPER CONTAINER */}
            <div
              className="thermal-paper-preview"
              style={{
                width: config.paperWidth === "58mm" ? "240px" : "340px",
                background: "#ffffff",
                color: "#000000",
                boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                borderRadius: "2px",
                padding: "16px 12px",
                fontFamily: "'Courier New', Courier, monospace",
                transition: "all 0.2s ease-in-out",
              }}
            >
              <iframe
                title="Live Thermal Receipt Preview"
                srcDoc={generateReceiptHtml(config, SAMPLE_RECEIPT_DATA)}
                style={{
                  width: "100%",
                  height: "560px",
                  border: "none",
                  background: "#fff",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SAVE TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="pay-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTemplateModal(false); }}>
          <div className="modal">
            <h2>Save Receipt Template</h2>
            <form onSubmit={handleSaveTemplate} style={{ marginTop: "12px" }}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Template Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Supermarket 80mm"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  style={{ width: "100%", padding: "8px" }}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowTemplateModal(false)}>Cancel</button>
                <button type="submit" className="btn primary">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
