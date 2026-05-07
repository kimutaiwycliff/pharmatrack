// Screen 10 — Shift Report

const shiftRows = [
  { name: "John Mwangi",   date: "12 May", in: "06:30", out: "—",     dur: "—",     sales: 18420, cash: 4980, mpesa: 13440, variance: 0,    inProgress: true },
  { name: "Aisha Hassan",  date: "12 May", in: "06:32", out: "—",     dur: "—",     sales: 9210,  cash: 2450, mpesa: 6760,  variance: -25,  inProgress: true },
  { name: "Peter Otieno",  date: "11 May", in: "07:01", out: "15:08", dur: "8h 07m", sales: 22810, cash: 8120, mpesa: 14690, variance: 32 },
  { name: "Mary Kamau",    date: "11 May", in: "14:45", out: "21:30", dur: "6h 45m", sales: 16940, cash: 5210, mpesa: 11730, variance: -180 },
  { name: "John Mwangi",   date: "11 May", in: "06:28", out: "14:32", dur: "8h 04m", sales: 19640, cash: 5440, mpesa: 14200, variance: 12 },
  { name: "David Njoroge", date: "10 May", in: "07:14", out: "15:22", dur: "8h 08m", sales: 14210, cash: 4080, mpesa: 10130, variance: -315 },
  { name: "Aisha Hassan",  date: "10 May", in: "14:50", out: "21:35", dur: "6h 45m", sales: 12830, cash: 3940, mpesa: 8890,  variance: 48 },
  { name: "Peter Otieno",  date: "10 May", in: "06:55", out: "14:48", dur: "7h 53m", sales: 17480, cash: 6210, mpesa: 11270, variance: -8 },
];

const ShiftReportScreen = () => {
  const varianceStyle = (v) => {
    const abs = Math.abs(v);
    if (abs <= 50)  return { bg: "var(--pt-green-50)",  fg: "var(--pt-green-600)" };
    if (abs <= 200) return { bg: "var(--pt-amber)",     fg: "white", isAmber: true };
    return { bg: "var(--pt-red-50)", fg: "var(--pt-red)" };
  };

  return (
    <OwnerLayout active="Shifts">
      <PageHeader
        eyebrow="Reports"
        title="Shift Report"
        right={<>
          <button className="pt-btn">
            <Icon name="home" size={14}/> All Branches
            <Icon name="chevron" size={12}/>
          </button>
          <button className="pt-btn">
            <Icon name="calendar" size={14}/> 10 May – 12 May
            <Icon name="chevron" size={12}/>
          </button>
          <button className="pt-btn pt-btn--primary">
            <Icon name="download" size={14}/>Export PDF
          </button>
        </>}
      />

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Total Shifts" value="8" sub="across 3 branches" icon="clock"/>
        <SummaryCard label="Hours Worked" value="53h 48m" sub="avg 7h 41m / shift" icon="clock"/>
        <SummaryCard label="Cash Collected" value="KSh 40,430" sub="32% of revenue" icon="cash"/>
        <SummaryCard label="M-Pesa Collected" value="KSh 91,110" sub="68% of revenue" icon="phone"/>
      </div>

      {/* Variance legend */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 12,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Shift breakdown</div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--pt-text-secondary)", alignItems: "center" }}>
          <span><strong style={{ color: "var(--pt-text)" }}>Variance</strong> color guide:</span>
          <Legend c="var(--pt-green-50)" fg="var(--pt-green-600)" txt="±50"/>
          <Legend c="var(--pt-amber)" fg="white" txt="±200"/>
          <Legend c="var(--pt-red-50)" fg="var(--pt-red)" txt=">200"/>
        </div>
      </div>

      <div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="pt-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
              <th style={{ textAlign: "right" }}>Sales</th>
              <th style={{ textAlign: "right" }}>Cash</th>
              <th style={{ textAlign: "right" }}>M-Pesa</th>
              <th style={{ textAlign: "right" }}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {shiftRows.map((r, i) => {
              const vs = varianceStyle(r.variance);
              return (
                <tr key={i}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={r.name} size={28}/>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--pt-text-secondary)" }}>{r.date}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.in}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.inProgress ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        color: "var(--pt-green-600)", fontWeight: 600,
                      }}>
                        <span className="pt-pulse" style={{ width: 6, height: 6 }}/>
                        Live
                      </span>
                    ) : r.out}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--pt-text-secondary)" }}>{r.dur}</td>
                  <td style={{
                    textAlign: "right", fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}>{ksh(r.sales, { decimals: 0 })}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--pt-text-secondary)" }}>
                    {ksh(r.cash, { decimals: 0 })}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--pt-text-secondary)" }}>
                    {ksh(r.mpesa, { decimals: 0 })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.inProgress && r.variance === 0 ? (
                      <span style={{ color: "var(--pt-text-tertiary)", fontSize: 12 }}>—</span>
                    ) : (
                      <span style={{
                        display: "inline-block", padding: "3px 10px",
                        borderRadius: 999, fontSize: 12, fontWeight: 600,
                        background: vs.bg, color: vs.fg,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {r.variance > 0 ? "+" : ""}{ksh(r.variance, { decimals: 0, bare: true })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </OwnerLayout>
  );
};

const SummaryCard = ({ label, value, sub, icon }) => (
  <div className="pt-card" style={{ padding: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: "var(--pt-text-secondary)", fontWeight: 500 }}>{label}</span>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: "#f3f4f6", color: "var(--pt-text-secondary)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={icon} size={13}/>
      </div>
    </div>
    <div style={{
      fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
      fontVariantNumeric: "tabular-nums",
    }}>{value}</div>
    <div style={{ fontSize: 11.5, color: "var(--pt-text-secondary)", marginTop: 4 }}>{sub}</div>
  </div>
);

const Legend = ({ c, fg, txt }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px",
    borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: c, color: fg,
  }}>{txt}</span>
);

window.ShiftReportScreen = ShiftReportScreen;
