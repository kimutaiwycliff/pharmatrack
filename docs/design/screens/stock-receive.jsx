// Screen 8 — Stock Receive

const sessionItems = [
  { name: "Paracetamol 500mg",    qty: "50 boxes × 100", batch: "BN240815", exp: "Dec 2026", cost: 8500 },
  { name: "Amoxicillin 500mg",    qty: "30 boxes × 50",  batch: "BN240612", exp: "Jun 2027", cost: 14200 },
  { name: "Cetirizine 10mg",      qty: "20 boxes × 30",  batch: "BN240701", exp: "Jul 2027", cost: 4800 },
  { name: "Hydrocortisone 1%",    qty: "12 tubes",       batch: "BN240910", exp: "Sep 2027", cost: 1640 },
];

const StockReceiveScreen = () => (
  <OwnerLayout active="Stock Receive">
    <PageHeader
      title="Stock Receive"
      eyebrow="Goods inward"
      right={<>
        <button className="pt-btn">
          <Icon name="x" size={14}/> Cancel session
        </button>
      </>}
    />

    <div style={{
      display: "grid", gridTemplateColumns: "1.05fr 1fr",
      gap: 20,
    }}>
      {/* LEFT — scan */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="pt-card" style={{ padding: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
            color: "var(--pt-text-secondary)", textTransform: "uppercase",
            marginBottom: 12,
          }}>Scan delivery</div>
          <div style={{ position: "relative" }}>
            <input
              className="pt-input pt-input--lg"
              style={{ height: 60, paddingLeft: 56, paddingRight: 60, fontSize: 15 }}
              placeholder="Scan delivery barcode..."
            />
            <Icon name="scan" size={22} style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              color: "var(--pt-green)",
            }}/>
            <div style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999,
              background: "var(--pt-green-50)", color: "var(--pt-green-600)",
              fontSize: 11, fontWeight: 600,
            }}>
              <span className="pt-pulse" style={{ width: 6, height: 6 }}/>
              Ready
            </div>
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 12,
            fontSize: 12, color: "var(--pt-text-secondary)",
          }}>
            <span>Receiving session: <strong style={{ color: "var(--pt-text)" }}>{sessionItems.length} items added</strong></span>
            <span>Supplier: <strong style={{ color: "var(--pt-text)" }}>Surgipharm Ltd</strong> · DO #28471</span>
          </div>
        </div>

        {/* Latest scan card */}
        <div className="pt-card" style={{
          padding: 0, overflow: "hidden",
          border: "1.5px solid var(--pt-green)",
        }}>
          <div style={{
            padding: "8px 16px",
            background: "var(--pt-green-50)",
            display: "flex", alignItems: "center", gap: 8,
            color: "var(--pt-green-600)", fontSize: 12, fontWeight: 600,
          }}>
            <Icon name="check" size={14}/>
            Just scanned · Auto-detected from GS1 barcode
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: "#f3f4f6", color: "var(--pt-text-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon name="pill" size={26}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
                  Paracetamol 500mg
                </div>
                <div style={{
                  fontSize: 12, color: "var(--pt-text-secondary)",
                  fontFamily: "var(--pt-font-mono)", marginTop: 4,
                }}>
                  EAN: 6934711400027 · Lab: Cosmos Pharma
                </div>
              </div>
              <span className="pt-badge pt-badge--green">Verified</span>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 12, marginTop: 16,
            }}>
              <Stat label="Batch" value="BN240815"/>
              <Stat label="Expires" value="Dec 2026" sub="20 months"/>
              <Stat label="Quantity" value="50 boxes × 100" sub="= 5,000 tablets"/>
              <Stat label="Unit cost" value="KSh 1.70" sub="total KSh 8,500"/>
            </div>
          </div>
        </div>

        {/* Tip card */}
        <div style={{
          background: "var(--pt-blue-50)",
          border: "1px solid var(--pt-blue-100)",
          borderRadius: 12, padding: 14,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <Icon name="info" size={16} style={{ color: "var(--pt-blue)", marginTop: 2, flexShrink: 0 }}/>
          <div style={{ fontSize: 12.5, color: "#1e40af", lineHeight: 1.5 }}>
            <strong>Tip</strong> — Hold the trigger over the GS1-DataMatrix square (small square barcode) to auto-fill batch & expiry. Linear barcodes capture EAN only.
          </div>
        </div>
      </div>

      {/* RIGHT — list */}
      <div className="pt-card" style={{
        padding: 0, display: "flex", flexDirection: "column",
        overflow: "hidden", height: "fit-content", maxHeight: "calc(100vh - 180px)",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--pt-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Receiving list</div>
            <div style={{ fontSize: 12, color: "var(--pt-text-secondary)" }}>4 items · KSh 29,140 total</div>
          </div>
          <button className="pt-btn pt-btn--ghost" style={{ height: 32, fontSize: 12 }}>
            <Icon name="edit" size={13}/>
            Adjust
          </button>
        </div>

        <div style={{ overflowY: "auto" }}>
          {sessionItems.map((it, i) => (
            <div key={i} style={{
              padding: "14px 20px",
              borderBottom: i < sessionItems.length - 1 ? "1px solid var(--pt-border)" : "none",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div>
                <div style={{
                  fontSize: 11.5, color: "var(--pt-text-secondary)", marginTop: 4,
                  display: "flex", flexWrap: "wrap", gap: 12,
                }}>
                  <span><strong style={{ color: "var(--pt-text)", fontWeight: 600 }}>{it.qty}</strong></span>
                  <span>Batch <span style={{ fontFamily: "var(--pt-font-mono)" }}>{it.batch}</span></span>
                  <span>Exp {it.exp}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {ksh(it.cost, { decimals: 0 })}
                </div>
                <button style={{
                  marginTop: 4, width: 24, height: 24, border: 0, borderRadius: 5,
                  background: "transparent", color: "var(--pt-text-tertiary)",
                }}>
                  <Icon name="trash" size={13}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: 16, borderTop: "1px solid var(--pt-border)",
          background: "#fafbfc",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 13, color: "var(--pt-text-secondary)", marginBottom: 4,
          }}>
            <span>Sub-total</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>KSh 29,140</span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 13, color: "var(--pt-text-secondary)", marginBottom: 8,
          }}>
            <span>VAT</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>Exempt</span>
          </div>
          <button className="pt-btn pt-btn--primary pt-btn--lg pt-btn--block">
            <Icon name="check" size={16}/>
            Post Receiving
            <span style={{
              marginLeft: 4, padding: "2px 7px", borderRadius: 999,
              background: "rgba(255,255,255,0.25)", fontSize: 11,
            }}>{sessionItems.length}</span>
          </button>
        </div>
      </div>
    </div>
  </OwnerLayout>
);

const Stat = ({ label, value, sub }) => (
  <div>
    <div style={{ fontSize: 11, color: "var(--pt-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "var(--pt-text-tertiary)", marginTop: 1 }}>{sub}</div>}
  </div>
);

window.StockReceiveScreen = StockReceiveScreen;
