// Screen 6 — Owner Dashboard

const DashboardScreen = () => {
  const kpis = [
    { label: "Today's Revenue", value: "KSh 48,230", delta: "+12%", desc: "vs yesterday", up: true, icon: "cash" },
    { label: "Transactions", value: "87", delta: "+8%", desc: "vs yesterday", up: true, icon: "receipt" },
    { label: "Average Basket", value: "KSh 554", delta: "+3%", desc: "vs yesterday", up: true, icon: "cart" },
    { label: "M-Pesa Rate", value: "73%", delta: "−2%", desc: "vs last week", up: false, icon: "phone" },
  ];

  const sales = [
    { time: "14:33", cashier: "John Mwangi", total: 225, method: "M-Pesa", id: "0042" },
    { time: "14:18", cashier: "Aisha Hassan", total: 1280, method: "Cash", id: "0041" },
    { time: "14:05", cashier: "John Mwangi", total: 450, method: "M-Pesa", id: "0040" },
    { time: "13:49", cashier: "Peter Otieno", total: 90, method: "Cash", id: "0039" },
    { time: "13:34", cashier: "Aisha Hassan", total: 2150, method: "Split", id: "0038" },
  ];

  const alerts = [
    { dot: "red", title: "Metronidazole 200mg", desc: "Out of stock · 3 customers turned away today", action: "Reorder" },
    { dot: "amber", title: "Paracetamol 500mg", desc: "48 tablets · reorder threshold 100", action: "Reorder" },
    { dot: "yellow", title: "Amoxicillin 500mg · BN240312", desc: "Expires in 23 days · 220 tablets", action: "Discount" },
    { dot: "yellow", title: "Fluconazole 150mg · BN240501", desc: "Expires in 41 days · 60 capsules", action: "Discount" },
  ];

  // Bar chart 30 days
  const barData = [22,28,18,32,26,40,35,30,25,38,42,33,28,36,45,38,30,24,32,46,52,40,33,28,35,44,50,42,38,48];

  return (
    <OwnerLayout active="Dashboard">
      <PageHeader
        eyebrow="Wednesday, 12 May 2026"
        title="Dashboard"
        right={<>
          <button className="pt-btn">
            All Branches
            <Icon name="chevron" size={14}/>
          </button>
          <button className="pt-btn">
            <Icon name="calendar" size={14}/>
            Today
          </button>
          <button className="pt-btn pt-btn--primary">
            <Icon name="download" size={14}/>
            Export
          </button>
        </>}
      />

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} className="pt-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "var(--pt-text-secondary)", fontWeight: 500 }}>{k.label}</span>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "var(--pt-green-50)", color: "var(--pt-green-600)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name={k.icon} size={15}/>
              </div>
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}>{k.value}</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 8,
              fontSize: 12,
            }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 2,
                padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                background: k.up ? "var(--pt-green-50)" : "var(--pt-red-50)",
                color: k.up ? "var(--pt-green-600)" : "var(--pt-red)",
              }}>
                <Icon name={k.up ? "arrowUp" : "arrowDown"} size={12}/>
                {k.delta}
              </span>
              <span style={{ color: "var(--pt-text-secondary)" }}>{k.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="pt-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Revenue · last 30 days</div>
            <div style={{ fontSize: 13, color: "var(--pt-text-secondary)", marginTop: 2 }}>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--pt-text)" }}>KSh 1,124,800</span> total · avg KSh 37,490/day
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, padding: 4, background: "#f3f4f6", borderRadius: 8 }}>
            {["7d", "30d", "90d"].map((p, i) => (
              <button key={p} style={{
                height: 28, padding: "0 12px", borderRadius: 6, border: 0,
                background: i === 1 ? "white" : "transparent",
                fontSize: 12, fontWeight: 600,
                color: i === 1 ? "var(--pt-text)" : "var(--pt-text-secondary)",
                boxShadow: i === 1 ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}>{p}</button>
            ))}
          </div>
        </div>
        <div style={{
          height: 180, display: "flex", alignItems: "flex-end", gap: 4,
          paddingBottom: 20, position: "relative",
        }}>
          {barData.map((v, i) => (
            <div key={i} style={{
              flex: 1, height: `${v * 1.8}%`,
              background: i === barData.length - 1 ? "var(--pt-green)" : "var(--pt-green-100)",
              borderRadius: "4px 4px 0 0",
              position: "relative",
              transition: "background .15s",
            }}/>
          ))}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "var(--pt-text-tertiary)",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>Apr 13</span>
            <span>Apr 22</span>
            <span>May 1</span>
            <span>May 12</span>
          </div>
        </div>
      </div>

      {/* Two panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        <div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pt-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Today's Sales</div>
            <a style={{ fontSize: 12, color: "var(--pt-green-600)", fontWeight: 600 }} href="#">View all 87 →</a>
          </div>
          <table className="pt-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Cashier</th>
                <th>Method</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id}>
                  <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--pt-text-secondary)" }}>{s.time}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={s.cashier} size={24}/>
                      <span style={{ fontSize: 13 }}>{s.cashier}</span>
                    </div>
                  </td>
                  <td>
                    <span className={
                      "pt-badge pt-badge--" + (s.method === "M-Pesa" ? "green" : s.method === "Cash" ? "gray" : "blue")
                    } style={{ textTransform: "none", letterSpacing: 0 }}>
                      {s.method}
                    </span>
                  </td>
                  <td style={{
                    textAlign: "right", fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}>{ksh(s.total, { decimals: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--pt-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Stock Alerts</div>
            <span className="pt-badge pt-badge--red" style={{ height: 20 }}>4 urgent</span>
          </div>
          <div>
            {alerts.map((a, i) => (
              <div key={i} style={{
                padding: "14px 20px",
                borderBottom: i < alerts.length - 1 ? "1px solid var(--pt-border)" : "none",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: a.dot === "red" ? "var(--pt-red)" : a.dot === "amber" ? "var(--pt-amber)" : "var(--pt-yellow)",
                  marginTop: 6,
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--pt-text-secondary)", marginTop: 2 }}>{a.desc}</div>
                </div>
                <button className="pt-btn" style={{ height: 28, fontSize: 12, padding: "0 10px" }}>{a.action}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
};

// Wraps owner screens with sidebar
const OwnerLayout = ({ active, children }) => (
  <div className="pt" style={{
    width: "100%", height: "100%",
    display: "flex",
    background: "var(--pt-bg)",
    overflow: "hidden",
  }}>
    <Sidebar active={active}/>
    <main className="pt-scroll" style={{
      flex: 1, padding: "28px 36px",
      overflow: "auto", minHeight: 0,
    }}>
      {children}
    </main>
  </div>
);

Object.assign(window, { DashboardScreen, OwnerLayout });
