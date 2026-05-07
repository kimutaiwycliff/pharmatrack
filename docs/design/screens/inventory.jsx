// Screen 7 — Inventory list

const inventoryRows = [
  { name: "Amoxicillin 500mg", strength: "500mg", form: "Capsule", stock: 220, unit: "tabs", batches: 2, expiry: "12 Jun 2026", status: ["Expiring"], controlled: false, exp: 23 },
  { name: "Paracetamol 500mg", strength: "500mg", form: "Tablet", stock: 48, unit: "tabs", batches: 1, expiry: "30 Sep 2027", status: ["Low stock"], controlled: false },
  { name: "Metronidazole 200mg", strength: "200mg", form: "Tablet", stock: 0, unit: "tabs", batches: 0, expiry: "—", status: ["Out of stock"], controlled: false },
  { name: "Diazepam 5mg", strength: "5mg", form: "Tablet", stock: 38, unit: "tabs", batches: 1, expiry: "15 Mar 2027", status: ["OK", "Controlled"], controlled: true },
  { name: "ORS Sachet", strength: "20.5g", form: "Sachet", stock: 142, unit: "sachets", batches: 3, expiry: "08 Aug 2027", status: ["OK"], controlled: false },
  { name: "Fluconazole 150mg", strength: "150mg", form: "Capsule", stock: 60, unit: "caps", batches: 1, expiry: "22 Jun 2026", status: ["Expiring"], controlled: false, exp: 41 },
];

const InventoryScreen = () => {
  return (
    <OwnerLayout active="Inventory">
      <PageHeader
        title="Inventory"
        right={<>
          <button className="pt-btn"><Icon name="download" size={14}/>Export</button>
          <button className="pt-btn pt-btn--primary"><Icon name="truck" size={14}/>Receive Stock</button>
        </>}
      />

      {/* Search + filters */}
      <div className="pt-card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Icon name="search" size={16} style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: "var(--pt-text-tertiary)",
          }}/>
          <input
            className="pt-input"
            style={{ paddingLeft: 40 }}
            placeholder="Search by name, brand, or barcode..."
            defaultValue=""
          />
        </div>
        <button className="pt-btn"><Icon name="filter" size={14}/>Category<Icon name="chevron" size={12}/></button>
        <button className="pt-btn"><Icon name="filter" size={14}/>Status<Icon name="chevron" size={12}/></button>
        <button className="pt-btn"><Icon name="sort" size={14}/>Sort: Name<Icon name="chevron" size={12}/></button>
      </div>

      {/* Status chips */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Chip color="red"    icon={<Dot c="var(--pt-red)"/>}    text="2 Out of Stock"/>
        <Chip color="amber"  icon={<Dot c="var(--pt-amber)"/>}  text="4 Low Stock"/>
        <Chip color="yellow" icon={<Dot c="var(--pt-yellow)"/>} text="6 Expiring Soon"/>
        <Chip color="blue"   icon={<Dot c="var(--pt-blue)"/>}   text="3 Controlled Substances"/>
        <div style={{ flex: 1 }}/>
        <div style={{ fontSize: 12, color: "var(--pt-text-secondary)", alignSelf: "center" }}>
          Showing <strong style={{ color: "var(--pt-text)" }}>6</strong> of 412 items
        </div>
      </div>

      {/* Table */}
      <div className="pt-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="pt-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Strength</th>
              <th>Form</th>
              <th style={{ textAlign: "right" }}>Stock</th>
              <th style={{ textAlign: "center" }}>Batches</th>
              <th>Earliest Expiry</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventoryRows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 6,
                      background: "#f3f4f6", color: "var(--pt-text-secondary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name="pill" size={14}/>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "var(--pt-text-tertiary)", fontFamily: "var(--pt-font-mono)" }}>SKU-{1000 + i * 7}</div>
                    </div>
                  </div>
                </td>
                <td style={{ color: "var(--pt-text-secondary)" }}>{r.strength}</td>
                <td style={{ color: "var(--pt-text-secondary)" }}>{r.form}</td>
                <td style={{
                  textAlign: "right", fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: r.stock === 0 ? "var(--pt-red)" : r.stock < 50 ? "var(--pt-amber)" : "var(--pt-text)",
                }}>
                  {r.stock} <span style={{ fontSize: 11, color: "var(--pt-text-tertiary)", fontWeight: 400 }}>{r.unit}</span>
                </td>
                <td style={{ textAlign: "center", color: "var(--pt-text-secondary)" }}>{r.batches}</td>
                <td style={{ fontSize: 12 }}>
                  {r.exp ? (
                    <div>
                      <div>{r.expiry}</div>
                      <div style={{
                        fontSize: 11,
                        color: r.exp < 30 ? "var(--pt-amber)" : "var(--pt-yellow)",
                      }}>in {r.exp} days</div>
                    </div>
                  ) : <span style={{ color: "var(--pt-text-secondary)" }}>{r.expiry}</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {r.status.map(s => {
                      const map = {
                        "Out of stock": "red",
                        "Low stock": "amber",
                        "Expiring": "yellow",
                        "OK": "green",
                        "Controlled": "blue",
                      };
                      return (
                        <span key={s} className={"pt-badge pt-badge--" + map[s]}>
                          {s === "Controlled" && <Icon name="info" size={10}/>}
                          {s}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button style={{
                    width: 28, height: 28, border: 0, borderRadius: 6,
                    background: "transparent", color: "var(--pt-text-secondary)",
                  }}><Icon name="moreH" size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 16, fontSize: 12, color: "var(--pt-text-secondary)",
      }}>
        <span>Showing 1–6 of 412 items</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="pt-btn" style={{ height: 32, padding: "0 12px" }} disabled>← Prev</button>
          <button className="pt-btn" style={{ height: 32, padding: "0 12px" }}>Next →</button>
        </div>
      </div>
    </OwnerLayout>
  );
};

const Chip = ({ color, icon, text }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "8px 12px",
    background: `var(--pt-${color}-50)`,
    border: `1px solid var(--pt-${color}-100)`,
    borderRadius: 8,
    fontSize: 12.5, fontWeight: 600,
  }}>
    {icon}{text}
  </span>
);
const Dot = ({ c }) => <span style={{
  width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0,
}}/>;

window.InventoryScreen = InventoryScreen;
