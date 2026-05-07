// Screen 11 — Settings (Owner Console)
// Two-column layout: form on the left, live receipt preview on the right.
// User can edit chain name + receipt header/footer fields and toggle which
// rows show on the printed thermal receipt.

const SettingsScreen = () => {
  const [chain, setChain] = React.useState({
    name: "Nairobi Pharmacy",
    tagline: "Trusted family pharmacy since 2014",
    branchLabel: "CBD Branch",
    address: "Kimathi St, Nairobi",
    phone: "+254 712 345 678",
    vat: "P051234567K",
    pin: "A001234567Z",
  });

  const [receipt, setReceipt] = React.useState({
    headerText: "Asante kwa kununua nasi",  // Swahili thanks
    footerText: "Returns within 7 days with receipt.\nQueries: support@nairobipharm.co.ke",
    showLogo: true,
    showTagline: true,
    showAddress: true,
    showCashier: true,
    showVat: true,
    showItemForm: false,        // e.g. "Tablet" / "Capsule"
    showSavings: true,
    showQrCode: true,
    showFooter: true,
    paperWidth: 80,             // 58 | 80
  });

  const setField = (k, v) => setChain(c => ({ ...c, [k]: v }));
  const setRcp = (k, v) => setReceipt(r => ({ ...r, [k]: v }));

  return (
    <OwnerLayout active="Settings">
      <PageHeader
        eyebrow="Owner console"
        title="Settings"
        right={<>
          <button className="pt-btn">Discard</button>
          <button className="pt-btn pt-btn--primary">
            <Icon name="check" size={14}/>
            Save changes
          </button>
        </>}
      />

      {/* Settings nav (sub-tabs) */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 24,
        borderBottom: "1px solid var(--pt-border)",
      }}>
        {[
          { id: "business", label: "Business", active: true },
          { id: "receipt", label: "Receipt" },
          { id: "tax", label: "Tax & Pricing" },
          { id: "devices", label: "Devices" },
          { id: "integrations", label: "Integrations" },
          { id: "audit", label: "Audit log" },
        ].map(s => (
          <button key={s.id} style={{
            height: 36, padding: "0 14px", border: 0, background: "transparent",
            borderBottom: s.active ? "2px solid var(--pt-green)" : "2px solid transparent",
            marginBottom: -1,
            color: s.active ? "var(--pt-text)" : "var(--pt-text-secondary)",
            fontWeight: s.active ? 600 : 500, fontSize: 13,
            cursor: "pointer",
          }}>{s.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* LEFT — form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Chain identity */}
          <SettingsCard
            title="Pharmacy chain"
            subtitle="Used across the app, on receipts, and in reports."
          >
            <Row2>
              <FormField label="Chain name" required>
                <input className="pt-input" value={chain.name}
                  onChange={e => setField("name", e.target.value)}
                  placeholder="e.g. Nairobi Pharmacy"/>
              </FormField>
              <FormField label="Default branch label">
                <input className="pt-input" value={chain.branchLabel}
                  onChange={e => setField("branchLabel", e.target.value)}/>
              </FormField>
            </Row2>

            <FormField label="Tagline" hint="Optional — appears under the name on receipts and login.">
              <input className="pt-input" value={chain.tagline}
                onChange={e => setField("tagline", e.target.value)}
                maxLength={64}/>
              <CountChar value={chain.tagline} max={64}/>
            </FormField>

            <FormField label="Logo">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: "var(--pt-green)", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.6"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>logo-mark.svg</div>
                  <div style={{ fontSize: 11, color: "var(--pt-text-secondary)" }}>SVG · uploaded 12 Mar 2024 · 2.1 KB</div>
                </div>
                <button className="pt-btn" style={{ height: 32, fontSize: 12 }}>Replace</button>
                <button className="pt-btn" style={{ height: 32, fontSize: 12, color: "var(--pt-red)" }}>Remove</button>
              </div>
            </FormField>
          </SettingsCard>

          {/* Contact + tax */}
          <SettingsCard
            title="Contact & tax"
            subtitle="Pulled into receipts, returns, and invoices."
          >
            <FormField label="Address">
              <input className="pt-input" value={chain.address}
                onChange={e => setField("address", e.target.value)}/>
            </FormField>
            <Row2>
              <FormField label="Phone">
                <input className="pt-input" value={chain.phone}
                  onChange={e => setField("phone", e.target.value)}/>
              </FormField>
              <FormField label="VAT no.">
                <input className="pt-input" value={chain.vat}
                  onChange={e => setField("vat", e.target.value)}
                  style={{ fontFamily: "var(--pt-font-mono)", letterSpacing: "0.05em" }}/>
              </FormField>
            </Row2>
            <FormField label="KRA PIN">
              <input className="pt-input" value={chain.pin}
                onChange={e => setField("pin", e.target.value)}
                style={{ fontFamily: "var(--pt-font-mono)", letterSpacing: "0.05em" }}/>
            </FormField>
          </SettingsCard>

          {/* Receipt customization */}
          <SettingsCard
            title="Receipt customization"
            subtitle="Live preview updates as you change settings."
          >
            {/* Paper width */}
            <FormField label="Thermal paper width">
              <div style={{ display: "flex", gap: 8 }}>
                {[58, 80].map(w => (
                  <button key={w}
                    onClick={() => setRcp("paperWidth", w)}
                    style={{
                      flex: 1, height: 60, borderRadius: 10,
                      border: receipt.paperWidth === w ? "1.5px solid var(--pt-green)" : "1px solid var(--pt-border)",
                      background: receipt.paperWidth === w ? "var(--pt-green-50)" : "white",
                      cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                    }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14,
                      color: receipt.paperWidth === w ? "var(--pt-green-600)" : "var(--pt-text)",
                    }}>{w}mm</div>
                    <div style={{ fontSize: 11, color: "var(--pt-text-secondary)" }}>
                      {w === 58 ? "Compact" : "Standard"}
                    </div>
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Header message" hint="Appears at the top under your name.">
              <input className="pt-input" value={receipt.headerText}
                onChange={e => setRcp("headerText", e.target.value)}
                placeholder="Asante kwa kununua nasi"
                maxLength={48}/>
              <CountChar value={receipt.headerText} max={48}/>
            </FormField>

            <FormField label="Footer message" hint="Returns policy, support email, etc. Two lines max.">
              <textarea className="pt-input"
                style={{ height: 64, padding: "10px 12px", resize: "none", lineHeight: 1.4 }}
                value={receipt.footerText}
                onChange={e => setRcp("footerText", e.target.value)}
                maxLength={120}/>
              <CountChar value={receipt.footerText} max={120}/>
            </FormField>

            {/* Toggle list */}
            <div style={{
              border: "1px solid var(--pt-border)",
              borderRadius: 10, overflow: "hidden",
              marginTop: 4,
            }}>
              <ToggleRow label="Show logo mark"        sub="Black-and-white version printed at top."        on={receipt.showLogo}      onChange={v => setRcp("showLogo", v)}/>
              <ToggleRow label="Show tagline"           sub="Below the chain name."                          on={receipt.showTagline}   onChange={v => setRcp("showTagline", v)}/>
              <ToggleRow label="Show address"           sub="Branch street + branch label."                  on={receipt.showAddress}   onChange={v => setRcp("showAddress", v)}/>
              <ToggleRow label="Show cashier name"      sub="Useful for accountability; required by KRA."    on={receipt.showCashier}   onChange={v => setRcp("showCashier", v)}/>
              <ToggleRow label="Show VAT / KRA PIN"     sub="Required for tax invoice receipts."             on={receipt.showVat}       onChange={v => setRcp("showVat", v)}/>
              <ToggleRow label="Show drug form"         sub="e.g. 'Tablet' next to the line item."           on={receipt.showItemForm}  onChange={v => setRcp("showItemForm", v)}/>
              <ToggleRow label="Show savings line"      sub="Highlights customer's discount in green."       on={receipt.showSavings}   onChange={v => setRcp("showSavings", v)}/>
              <ToggleRow label="Show QR receipt code"   sub="Customer scans to view e-receipt online."       on={receipt.showQrCode}    onChange={v => setRcp("showQrCode", v)}/>
              <ToggleRow label="Show footer message"    sub="The text you typed above."                      on={receipt.showFooter}    onChange={v => setRcp("showFooter", v)}  last/>
            </div>
          </SettingsCard>
        </div>

        {/* RIGHT — sticky receipt preview */}
        <div style={{ position: "sticky", top: 0 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Live receipt preview</div>
            <span className="pt-badge pt-badge--green">Updates as you type</span>
          </div>
          <div style={{
            background: "#f3f1ec",
            border: "1px solid var(--pt-border)",
            borderRadius: 12,
            padding: "28px 20px",
            display: "flex", justifyContent: "center",
          }}>
            <ReceiptPreview chain={chain} receipt={receipt}/>
          </div>
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: "var(--pt-blue-50)",
            border: "1px solid var(--pt-blue-100)",
            borderRadius: 10,
            fontSize: 12, color: "#1e40af",
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <Icon name="info" size={14} style={{ marginTop: 2, flexShrink: 0, color: "var(--pt-blue)" }}/>
            <span>Changes affect new sales only — receipts already printed cannot be retro-edited.</span>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
};

/* ---------- Form sub-components ---------- */

const SettingsCard = ({ title, subtitle, children }) => (
  <div className="pt-card" style={{ padding: 0 }}>
    <div style={{
      padding: "16px 20px",
      borderBottom: "1px solid var(--pt-border)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "var(--pt-text-secondary)", marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
    <div style={{
      padding: 20,
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      {children}
    </div>
  </div>
);

const Row2 = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
    {children}
  </div>
);

const FormField = ({ label, hint, required, children }) => (
  <label style={{ display: "block" }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: "var(--pt-red)", marginLeft: 4 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: "var(--pt-text-tertiary)" }}>{hint}</span>}
    </div>
    {children}
  </label>
);

const CountChar = ({ value, max }) => (
  <div style={{
    fontSize: 11, color: "var(--pt-text-tertiary)",
    marginTop: 4, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  }}>{(value || "").length}/{max}</div>
);

const ToggleRow = ({ label, sub, on, onChange, last }) => (
  <div
    onClick={() => onChange(!on)}
    style={{
      padding: "12px 14px",
      borderBottom: last ? "none" : "1px solid var(--pt-border)",
      display: "flex", alignItems: "center", gap: 12,
      cursor: "pointer",
      background: on ? "white" : "#fafbfc",
      transition: "background .12s",
    }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--pt-text-secondary)", marginTop: 2 }}>{sub}</div>
    </div>
    <Switch on={on}/>
  </div>
);

const Switch = ({ on }) => (
  <div style={{
    width: 36, height: 20, borderRadius: 999,
    background: on ? "var(--pt-green)" : "#d1d5db",
    position: "relative", flexShrink: 0,
    transition: "background .15s",
  }}>
    <div style={{
      position: "absolute", top: 2, left: 2,
      width: 16, height: 16, borderRadius: "50%",
      background: "white",
      transform: on ? "translateX(16px)" : "translateX(0)",
      transition: "transform .15s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    }}/>
  </div>
);

/* ---------- Live thermal receipt preview ---------- */

const ReceiptPreview = ({ chain, receipt }) => {
  const items = [
    { name: "Amoxicillin 500mg", form: "Capsule", qty: "14", amt: 140 },
    { name: "Paracetamol 500mg", form: "Tablet", qty: "10", amt: 35 },
    { name: "ORS Sachet", form: "Sachet", qty: "2", amt: 50 },
  ];
  const subtotal = items.reduce((s, i) => s + i.amt, 0);
  const discount = 25;
  const total = subtotal - discount;
  const widthPx = receipt.paperWidth === 58 ? 240 : 320;

  const Dashed = () => (
    <div style={{ borderTop: "1px dashed #9ca3af", margin: "8px 0" }}/>
  );

  return (
    <div className="pt-receipt" style={{
      width: widthPx,
      padding: "18px 16px",
      borderRadius: 4,
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      background: "#fffef9",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        {receipt.showLogo && (
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: "#111", color: "white",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginBottom: 6,
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
        )}
        <div style={{
          fontWeight: 700, fontSize: 13, letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          {chain.name || "—"}
        </div>
        {receipt.showTagline && chain.tagline && (
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2, fontStyle: "italic" }}>
            {chain.tagline}
          </div>
        )}
        {receipt.showAddress && (
          <div style={{ fontSize: 10.5, marginTop: 4 }}>
            {chain.branchLabel} · {chain.address}<br/>
            {chain.phone}
          </div>
        )}
        {receipt.showVat && (
          <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 2 }}>
            VAT {chain.vat} · PIN {chain.pin}
          </div>
        )}
        {receipt.headerText && (
          <div style={{ fontSize: 11, marginTop: 8, fontWeight: 500 }}>
            {receipt.headerText}
          </div>
        )}
      </div>

      <Dashed/>

      <Row k="Receipt" v="NAI-20260512-0042"/>
      <Row k="Date" v="12 May 2026, 14:33"/>
      {receipt.showCashier && <Row k="Cashier" v="John Mwangi"/>}

      <Dashed/>

      {items.map(it => (
        <div key={it.name} style={{ marginBottom: 4 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11.5, fontWeight: 500,
          }}>
            <span style={{
              maxWidth: "70%", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{it.name}{receipt.showItemForm && ` · ${it.form}`}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>KSh {it.amt.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", paddingLeft: 4 }}>
            {it.qty} × {it.name === "ORS Sachet" ? "unit" : "tab"}
          </div>
        </div>
      ))}

      <Dashed/>

      <Row k="Subtotal" v={`KSh ${subtotal.toFixed(2)}`}/>
      {receipt.showSavings && (
        <Row k="Discount" v={`- KSh ${discount.toFixed(2)}`}
          highlight="green"/>
      )}
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontWeight: 700, fontSize: 13, marginTop: 4,
      }}>
        <span>TOTAL</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>KSh {total.toFixed(2)}</span>
      </div>

      <Dashed/>

      <Row k="Paid" v="M-Pesa"/>
      <Row k="Ref" v="RGQ45HTYS8"/>

      {receipt.showQrCode && (
        <>
          <Dashed/>
          <div style={{ textAlign: "center" }}>
            <QrPlaceholder/>
            <div style={{ fontSize: 9.5, color: "#4b5563", marginTop: 4 }}>
              Scan for e-receipt
            </div>
          </div>
        </>
      )}

      {receipt.showFooter && receipt.footerText && (
        <>
          <Dashed/>
          <div style={{
            textAlign: "center", fontSize: 10.5,
            whiteSpace: "pre-line", lineHeight: 1.5,
          }}>
            {receipt.footerText}
          </div>
        </>
      )}

      <div style={{
        marginTop: 14, textAlign: "center", fontSize: 9.5,
        color: "#9ca3af",
      }}>
        — END OF RECEIPT —
      </div>
    </div>
  );
};

const Row = ({ k, v, highlight }) => (
  <div style={{
    display: "flex", justifyContent: "space-between",
    fontSize: 11,
    color: highlight === "green" ? "#15803d" : "inherit",
    fontWeight: highlight ? 600 : 400,
  }}>
    <span style={{ color: highlight ? "inherit" : "#6b7280" }}>{k}</span>
    <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
  </div>
);

// Fake QR using a noise grid — recognizable as a QR without recreating real codes
const QrPlaceholder = () => {
  const cells = 13;
  const seed = (i, j) => ((i * 7 + j * 13) ^ (i * j)) % 5 < 2;
  return (
    <div style={{
      width: 64, height: 64, padding: 4, background: "white",
      display: "inline-block", border: "1px solid #d1d5db",
      borderRadius: 4,
    }}>
      <div style={{
        width: "100%", height: "100%",
        display: "grid",
        gridTemplateColumns: `repeat(${cells}, 1fr)`,
        gridTemplateRows: `repeat(${cells}, 1fr)`,
        gap: 0,
      }}>
        {Array.from({ length: cells * cells }).map((_, k) => {
          const i = Math.floor(k / cells), j = k % cells;
          const corner = (i < 3 && j < 3) || (i < 3 && j >= cells - 3) || (i >= cells - 3 && j < 3);
          const filled = corner
            ? !((i === 1 || i === cells - 2) && (j === 1 || j === cells - 2))
              && !(i === 0 && j === 0) && !(i === 0 && j === cells - 1) && !(i === cells - 1 && j === 0)
              ? (i === 1 && j === 1) || (i === 1 && j === cells - 2) || (i === cells - 2 && j === 1)
                ? false
                : (i >= 1 && i <= cells - 2 && j >= 1 && j <= cells - 2 && (i === 1 || i === cells - 2 || j === 1 || j === cells - 2))
                  ? false
                  : true
              : true
            : seed(i, j);
          return <div key={k} style={{ background: filled ? "#111" : "transparent" }}/>;
        })}
      </div>
    </div>
  );
};

window.SettingsScreen = SettingsScreen;
