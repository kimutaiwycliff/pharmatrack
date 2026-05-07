// Screen 1 — Login

const LoginScreen = () => {
  const [tab, setTab] = React.useState("email"); // email | pin
  const [pin, setPin] = React.useState("");
  const [email, setEmail] = React.useState("john.mwangi@nairobipharmacy.co.ke");
  const [phone, setPhone] = React.useState("0712 345 678");

  const onKey = (k) => {
    if (k === "del") setPin(p => p.slice(0, -1));
    else if (pin.length < 4) setPin(p => p + k);
  };

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "var(--pt-bg)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32, position: "relative",
    }}>
      {/* faint background mark */}
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 320, height: 320, borderRadius: "50%",
        background: "var(--pt-green-50)", filter: "blur(4px)",
      }}/>

      <div style={{ marginBottom: 28, position: "relative" }}>
        <Logo size={28}/>
      </div>

      <div className="pt-card" style={{
        width: 420, padding: 32,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        position: "relative",
      }}>
        <div style={{
          fontSize: 20, fontWeight: 700, marginBottom: 4,
          letterSpacing: "-0.01em",
        }}>Welcome back</div>
        <div style={{
          fontSize: 13, color: "var(--pt-text-secondary)", marginBottom: 24,
        }}>Sign in to start your shift</div>

        {/* Tabs */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          background: "#f3f4f6", borderRadius: 8, padding: 4,
          marginBottom: 20,
        }}>
          {[
            { id: "email", label: "Email Login" },
            { id: "pin", label: "Quick PIN Login" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              height: 36, border: 0, borderRadius: 6,
              background: tab === t.id ? "white" : "transparent",
              color: tab === t.id ? "var(--pt-text)" : "var(--pt-text-secondary)",
              fontWeight: 600, fontSize: 13,
              boxShadow: tab === t.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              transition: "background .12s",
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "email" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Email">
              <input
                className="pt-input pt-input--lg"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" right={
              <a style={{ fontSize: 12, color: "var(--pt-green-600)", fontWeight: 500 }} href="#">Forgot?</a>
            }>
              <input
                className="pt-input pt-input--lg"
                type="password"
                defaultValue="••••••••••"
              />
            </Field>
            <button className="pt-btn pt-btn--primary pt-btn--lg pt-btn--block" style={{ marginTop: 8 }}>
              Sign in
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Phone number">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  height: 48, padding: "0 12px",
                  borderRadius: 8, border: "1px solid var(--pt-border-strong)",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 500, background: "white",
                }}>🇰🇪 +254</div>
                <input
                  className="pt-input pt-input--lg"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </Field>

            <div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Enter 4-digit PIN</span>
                <span style={{ fontSize: 12, color: "var(--pt-text-secondary)" }}>{pin.length}/4</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    flex: 1, height: 48,
                    borderRadius: 8,
                    border: pin.length === i
                      ? "1.5px solid var(--pt-green)"
                      : "1px solid var(--pt-border-strong)",
                    background: pin[i] ? "var(--pt-green-50)" : "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700,
                  }}>{pin[i] ? "•" : ""}</div>
                ))}
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}>
                {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) => {
                  if (k === "") return <div key={i}/>;
                  return (
                    <button key={i} className="pt-pin-key" onClick={() => onKey(k)}>
                      {k === "del" ? <Icon name="x" size={20}/> : k}
                    </button>
                  );
                })}
              </div>

              <button
                className="pt-btn pt-btn--primary pt-btn--lg pt-btn--block"
                style={{ marginTop: 16 }}
                disabled={pin.length !== 4}
              >Sign in with PIN</button>
            </div>
          </div>
        )}
      </div>

      <div style={{
        position: "absolute", bottom: 24,
        fontSize: 11, color: "var(--pt-text-tertiary)",
        letterSpacing: "0.04em",
      }}>
        Powered by <span style={{ fontWeight: 600, color: "var(--pt-text-secondary)" }}>PharmaTrack</span>
      </div>
    </div>
  );
};

const Field = ({ label, right, children }) => (
  <label style={{ display: "block" }}>
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: 6,
    }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      {right}
    </div>
    {children}
  </label>
);

window.LoginScreen = LoginScreen;
