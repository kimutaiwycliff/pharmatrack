// Screen 9 — Staff Management

const staffList = [
  { name: "Grace Wanjiru", role: "Owner", branch: "All branches", lastActive: "Active now", clockedIn: true, color: "#16a34a", joined: "Mar 2022" },
  { name: "John Mwangi", role: "Pharmacist", branch: "CBD Branch", lastActive: "Active now · in shift", clockedIn: true, color: "#2563eb", joined: "Jul 2023" },
  { name: "Aisha Hassan", role: "Cashier", branch: "CBD Branch", lastActive: "Active now · in shift", clockedIn: true, color: "#d97706", joined: "Jan 2024" },
  { name: "Peter Otieno", role: "Cashier", branch: "Westlands", lastActive: "2 hours ago", clockedIn: false, color: "#7c3aed", joined: "Sep 2024" },
  { name: "Mary Kamau", role: "Pharmacist", branch: "Westlands", lastActive: "Yesterday, 18:04", clockedIn: false, color: "#db2777", joined: "Feb 2023" },
  { name: "David Njoroge", role: "Cashier", branch: "Karen", lastActive: "5 hours ago", clockedIn: false, color: "#0891b2", joined: "May 2024" },
];

const StaffScreen = () => {
  const [tab, setTab] = React.useState("active");
  return (
    <OwnerLayout active="Staff">
      <PageHeader
        title="Staff"
        right={<>
          <button className="pt-btn"><Icon name="download" size={14}/>Export</button>
          <button className="pt-btn pt-btn--primary"><Icon name="plus" size={14}/>Add Employee</button>
        </>}
      />

      {/* Tabs + summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{
          display: "flex", gap: 0, padding: 4,
          background: "white", border: "1px solid var(--pt-border)",
          borderRadius: 8,
        }}>
          {[
            { id: "active", label: "Active Staff", count: 6 },
            { id: "inactive", label: "Inactive", count: 2 },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              height: 32, padding: "0 14px", border: 0, borderRadius: 6,
              background: tab === t.id ? "var(--pt-green-50)" : "transparent",
              color: tab === t.id ? "var(--pt-green-600)" : "var(--pt-text-secondary)",
              fontWeight: 600, fontSize: 13,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {t.label}
              <span style={{
                fontSize: 11, padding: "1px 6px", borderRadius: 999,
                background: tab === t.id ? "var(--pt-green-100)" : "#f3f4f6",
                color: tab === t.id ? "var(--pt-green-600)" : "var(--pt-text-secondary)",
              }}>{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12.5, color: "var(--pt-text-secondary)" }}>
          <span><strong style={{ color: "var(--pt-green-600)" }}>3</strong> currently clocked in</span>
          <span style={{ width: 1, height: 16, background: "var(--pt-border)" }}/>
          <span><strong style={{ color: "var(--pt-text)" }}>3</strong> branches</span>
        </div>
      </div>

      {/* Cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 16,
      }}>
        {staffList.map((s, i) => (
          <div key={i} className="pt-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ position: "relative" }}>
                <Avatar name={s.name} size={48} color={s.color}/>
                <div style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 14, height: 14, borderRadius: "50%",
                  background: s.clockedIn ? "var(--pt-green)" : "#9ca3af",
                  border: "2px solid white",
                }}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{s.name}</div>
                <div style={{ marginTop: 4 }}>
                  <span className={"pt-badge pt-badge--" + (s.role === "Owner" ? "green" : s.role === "Pharmacist" ? "blue" : "gray")}>
                    {s.role}
                  </span>
                </div>
              </div>
              <button style={{
                width: 28, height: 28, border: 0, borderRadius: 6,
                background: "transparent", color: "var(--pt-text-secondary)",
              }}>
                <Icon name="moreH" size={16}/>
              </button>
            </div>

            <div style={{
              display: "flex", flexDirection: "column", gap: 8,
              fontSize: 12.5, color: "var(--pt-text-secondary)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Branch</span>
                <span style={{ color: "var(--pt-text)", fontWeight: 500 }}>{s.branch}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Joined</span>
                <span style={{ color: "var(--pt-text)", fontWeight: 500 }}>{s.joined}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Last active</span>
                <span style={{
                  color: s.clockedIn ? "var(--pt-green-600)" : "var(--pt-text)",
                  fontWeight: 500,
                }}>{s.lastActive}</span>
              </div>
            </div>

            <div style={{
              display: "flex", gap: 8, marginTop: 16,
              paddingTop: 16, borderTop: "1px solid var(--pt-border)",
            }}>
              <button className="pt-btn" style={{ flex: 1, height: 32, fontSize: 12 }}>
                <Icon name="edit" size={13}/>
                Edit
              </button>
              <button className="pt-btn" style={{ flex: 1, height: 32, fontSize: 12, color: "var(--pt-red)" }}>
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </OwnerLayout>
  );
};

window.StaffScreen = StaffScreen;
