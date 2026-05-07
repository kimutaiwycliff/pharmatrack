// Shared brand and chrome components for PharmaTrack

const Logo = ({ size = 22, mono = false, withWord = true }) => {
  const c = mono ? "#111827" : "#16a34a";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: size + 6, height: size + 6,
        background: c, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "white", flexShrink: 0,
      }}>
        <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </div>
      {withWord && (
        <span style={{
          fontSize: size * 0.85, fontWeight: 700,
          letterSpacing: "-0.02em", color: "#111827",
        }}>
          Pharma<span style={{ color: c }}>Track</span>
        </span>
      )}
    </div>
  );
};

// Generic top bar used on POS screen
const TopBar = ({ branch = "CBD Branch", shift = "3h 24m", cashier = "John Mwangi" }) => (
  <div style={{
    height: 56, padding: "0 20px",
    display: "flex", alignItems: "center", gap: 20,
    borderBottom: "1px solid var(--pt-border)",
    background: "white", flexShrink: 0,
  }}>
    <Logo size={20}/>
    <div style={{
      width: 1, height: 24, background: "var(--pt-border)",
    }}/>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, fontSize: 13 }}>
      <Icon name="home" size={14} style={{ color: "#9ca3af" }}/>
      <span style={{ color: "var(--pt-text-secondary)" }}>Nairobi Pharmacy</span>
      <Icon name="chevronR" size={12} style={{ color: "#9ca3af" }}/>
      <span>{branch}</span>
    </div>

    <div style={{ flex: 1 }}/>

    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      background: "var(--pt-green-50)",
      color: "var(--pt-green-600)", fontSize: 12, fontWeight: 600,
    }}>
      <span className="pt-pulse" style={{ width: 8, height: 8 }}/>
      Shift active · {shift}
    </div>

    <button title="Printer connected" style={{
      width: 36, height: 36, borderRadius: 8, border: "1px solid var(--pt-border)",
      background: "white", color: "var(--pt-green-600)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <Icon name="printer" size={16}/>
      <span style={{
        position: "absolute", top: 4, right: 4,
        width: 6, height: 6, borderRadius: 3, background: "var(--pt-green)",
      }}/>
    </button>

    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar name={cashier} size={32}/>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{cashier}</div>
        <div style={{ fontSize: 11, color: "var(--pt-text-secondary)" }}>Cashier</div>
      </div>
    </div>
  </div>
);

const Avatar = ({ name = "", size = 32, color = "#16a34a" }) => {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  // hash color
  const colors = ["#16a34a", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
  const c = color || colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c + "22",
      color: c,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.4,
      flexShrink: 0,
      letterSpacing: "0.02em",
    }}>
      {initials}
    </div>
  );
};

// Owner sidebar
const Sidebar = ({ active = "Dashboard", onNavigate }) => {
  const items = [
    { name: "Dashboard", icon: "home" },
    { name: "POS Terminal", icon: "cart" },
    { name: "Inventory", icon: "box" },
    { name: "Stock Receive", icon: "truck" },
    { name: "Staff", icon: "users" },
    { name: "Shifts", icon: "clock" },
    { name: "Reports", icon: "chart" },
    { name: "Settings", icon: "settings" },
  ];
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      borderRight: "1px solid var(--pt-border)",
      background: "white",
      display: "flex", flexDirection: "column",
      padding: "20px 12px",
    }}>
      <div style={{ padding: "0 8px 20px" }}>
        <Logo size={20}/>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(it => (
          <div
            key={it.name}
            className={"pt-nav-item" + (it.name === active ? " pt-nav-item--active" : "")}
            onClick={() => onNavigate && onNavigate(it.name)}
          >
            <Icon name={it.icon} size={18} style={{ flexShrink: 0 }}/>
            <span style={{ fontSize: 13.5 }}>{it.name}</span>
          </div>
        ))}
      </nav>
      <div style={{ flex: 1 }}/>
      <div style={{
        padding: 12, borderTop: "1px solid var(--pt-border)",
        margin: "12px -12px -20px", paddingLeft: 20, paddingRight: 20,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Avatar name="Grace Wanjiru" size={32}/>
        <div style={{ lineHeight: 1.2, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Grace W.</div>
          <div style={{ fontSize: 11, color: "var(--pt-text-secondary)" }}>Owner</div>
        </div>
        <button style={{
          width: 28, height: 28, borderRadius: 6, border: 0, background: "transparent",
          color: "var(--pt-text-secondary)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }} title="Log out">
          <Icon name="logout" size={16}/>
        </button>
      </div>
    </aside>
  );
};

// Owner page header (title + side controls)
const PageHeader = ({ title, eyebrow, right }) => (
  <div style={{
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    marginBottom: 24,
  }}>
    <div>
      {eyebrow && (
        <div style={{
          fontSize: 12, fontWeight: 500,
          color: "var(--pt-text-secondary)",
          marginBottom: 4,
        }}>{eyebrow}</div>
      )}
      <h1 style={{
        margin: 0, fontSize: 26, fontWeight: 700,
        letterSpacing: "-0.02em",
      }}>{title}</h1>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {right}
    </div>
  </div>
);

// Format KSh
const ksh = (n, opts = {}) => {
  const num = Math.abs(n);
  const formatted = num.toLocaleString("en-KE", {
    minimumFractionDigits: opts.decimals === 0 ? 0 : 2,
    maximumFractionDigits: opts.decimals === 0 ? 0 : 2,
  });
  return (n < 0 ? "- " : "") + (opts.bare ? "" : "KSh ") + formatted;
};

Object.assign(window, { Logo, TopBar, Sidebar, Avatar, PageHeader, ksh });
