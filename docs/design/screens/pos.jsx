// Screen 2 — POS Terminal (with Cash, M-Pesa, Receipt modals)

const initialCart = [
  { id: 1, name: "Amoxicillin 500mg", form: "Capsule", qty: 14, unit: "tablet", price: 10 },
  { id: 2, name: "Paracetamol 500mg", form: "Tablet", qty: 10, unit: "tablet", price: 3.5 },
  { id: 3, name: "ORS Sachet", form: "Sachet", qty: 2, unit: "unit", price: 25 },
];

const recentScans = [
  "Amoxicillin 500mg", "ORS Sachet", "Hydrocortisone 1%", "Cetirizine 10mg"
];

const quickAdd = [
  { name: "Paracetamol 500mg", stock: 248, price: 3.5, color: "#16a34a" },
  { name: "Vitamin C 500mg",   stock: 412, price: 5,   color: "#d97706" },
  { name: "Loratadine 10mg",   stock: 86,  price: 12,  color: "#2563eb" },
  { name: "Ibuprofen 400mg",   stock: 174, price: 6,   color: "#7c3aed" },
  { name: "Hydrocortisone 1%", stock: 33,  price: 180, color: "#db2777" },
  { name: "Cough Syrup 100ml", stock: 51,  price: 220, color: "#0891b2" },
];

const POSScreen = ({ openModal: parentOpenModal }) => {
  const [cart, setCart] = React.useState(initialCart);
  const [modal, setModal] = React.useState(null); // null | cash | mpesa | receipt
  const [discount, setDiscount] = React.useState(0);
  const [search, setSearch] = React.useState("");

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.max(0, subtotal - discount);

  const updateQty = (id, delta) => setCart(c => c
    .map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  const removeItem = (id) => setCart(c => c.filter(i => i.id !== id));

  const openModal = parentOpenModal || setModal;

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "var(--pt-bg)",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      <TopBar/>

      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "1.5fr 1fr",
        minHeight: 0,
      }}>
        {/* LEFT — Cart */}
        <div style={{
          padding: 24,
          display: "flex", flexDirection: "column",
          minHeight: 0,
          borderRight: "1px solid var(--pt-border)",
        }}>
          {/* Sale header */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", marginBottom: 20,
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                color: "var(--pt-green-600)", textTransform: "uppercase",
                marginBottom: 6,
              }}>
                Sale #NAI-20260512-0042
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
                New Sale
              </h1>
              <div style={{ fontSize: 13, color: "var(--pt-text-secondary)", marginTop: 2 }}>
                Wed, 12 May 2026 · 14:33 · Cashier: John Mwangi
              </div>
            </div>
            <button className="pt-btn pt-btn--ghost" style={{ color: "var(--pt-text-secondary)" }}>
              <Icon name="x" size={16}/>
              Hold sale
            </button>
          </div>

          {/* Cart list */}
          <div className="pt-card" style={{
            flex: 1,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 110px 32px",
              padding: "12px 20px",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
              color: "var(--pt-text-secondary)", textTransform: "uppercase",
              borderBottom: "1px solid var(--pt-border)",
              background: "#fafbfc",
            }}>
              <div>Item</div>
              <div style={{ textAlign: "center" }}>Qty</div>
              <div style={{ textAlign: "right" }}>Subtotal</div>
              <div/>
            </div>

            <div className="pt-scroll" style={{ flex: 1, overflowY: "auto" }}>
              {cart.length === 0 && (
                <div style={{
                  padding: 60, textAlign: "center", color: "var(--pt-text-tertiary)",
                  fontSize: 13,
                }}>Cart is empty — scan a product to add</div>
              )}
              {cart.map(item => (
                <div key={item.id} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 110px 32px",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--pt-border)",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--pt-text-secondary)", marginTop: 2 }}>
                      {ksh(item.price)}/{item.unit} · {item.form}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div className="pt-stepper">
                      <button onClick={() => updateQty(item.id, -1)}><Icon name="minus" size={14}/></button>
                      <span className="pt-stepper-val">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)}><Icon name="plus" size={14}/></button>
                    </div>
                  </div>
                  <div style={{
                    textAlign: "right", fontWeight: 600, fontSize: 14,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {ksh(item.qty * item.price)}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      width: 28, height: 28, border: 0, borderRadius: 6,
                      background: "transparent", color: "var(--pt-text-tertiary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginLeft: "auto",
                    }}
                    title="Remove"
                  >
                    <Icon name="trash" size={15}/>
                  </button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{
              padding: "16px 20px",
              background: "#fafbfc",
              borderTop: "1px solid var(--pt-border)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "var(--pt-text-secondary)" }}>
                <span>Subtotal</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{ksh(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 12, color: "var(--pt-text-secondary)" }}>
                <span>Discount</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>- {ksh(discount, { bare: true })}</span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                paddingTop: 12, borderTop: "1px dashed var(--pt-border-strong)",
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--pt-text-secondary)" }}>TOTAL</span>
                <span style={{
                  fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}>{ksh(total)}</span>
              </div>
            </div>
          </div>

          {/* Payment buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 10, marginTop: 16 }}>
            <button className="pt-btn pt-btn--xl" onClick={() => openModal("cash")}>
              <Icon name="cash" size={20}/>
              CASH
            </button>
            <button className="pt-btn pt-btn--primary pt-btn--xl" onClick={() => openModal("mpesa")}>
              <Icon name="phone" size={20}/>
              M-PESA
            </button>
            <button className="pt-btn pt-btn--xl" onClick={() => openModal("split")}>
              <Icon name="grid" size={18}/>
              SPLIT
            </button>
          </div>
        </div>

        {/* RIGHT — Search */}
        <div style={{
          padding: 24, display: "flex", flexDirection: "column", gap: 18,
          minHeight: 0,
        }}>
          {/* Search input */}
          <div style={{ position: "relative" }}>
            <input
              className="pt-input pt-input--lg"
              style={{ height: 56, paddingLeft: 48, fontSize: 15, paddingRight: 56 }}
              placeholder="Scan barcode or search product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Icon name="search" size={18} style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              color: "var(--pt-text-tertiary)",
            }}/>
            <Icon name="barcode" size={20} style={{
              position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)",
              color: "var(--pt-text-secondary)",
            }}/>
          </div>

          <div style={{
            display: "inline-flex", alignSelf: "flex-start",
            alignItems: "center", gap: 8,
            padding: "6px 12px", background: "var(--pt-green-50)",
            borderRadius: 999, fontSize: 12, fontWeight: 600,
            color: "var(--pt-green-600)",
          }}>
            <span className="pt-pulse" style={{ width: 8, height: 8 }}/>
            Scanner ready · USB
          </div>

          {/* Recently scanned */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
              color: "var(--pt-text-secondary)", textTransform: "uppercase",
              marginBottom: 10,
            }}>Recently scanned</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {recentScans.map(p => (
                <button key={p} style={{
                  height: 30, padding: "0 12px",
                  borderRadius: 999, border: "1px solid var(--pt-border)",
                  background: "white", fontSize: 12, fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  <Icon name="plus" size={12} style={{ color: "var(--pt-green)" }}/>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Quick add */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
              color: "var(--pt-text-secondary)", textTransform: "uppercase",
              marginBottom: 10,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>Quick add</span>
              <a style={{ color: "var(--pt-green-600)", fontSize: 11 }} href="#">Customize</a>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10, flex: 1, minHeight: 0,
            }} className="pt-scroll">
              {quickAdd.map((p, i) => (
                <button key={i} className="pt-card" style={{
                  border: "1px solid var(--pt-border)",
                  padding: 12, textAlign: "left",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  background: "white", cursor: "pointer",
                  minHeight: 110,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: p.color + "15", color: p.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 8,
                  }}>
                    <Icon name="pill" size={14}/>
                  </div>
                  <div style={{
                    fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, marginBottom: 4,
                  }}>{p.name}</div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", fontSize: 11,
                  }}>
                    <span style={{ color: "var(--pt-text-secondary)" }}>{p.stock} in stock</span>
                    <span style={{ fontWeight: 600, color: "var(--pt-text)" }}>{ksh(p.price)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === "cash" && <CashModal total={total} onClose={() => setModal(null)} onConfirm={() => setModal("receipt")}/>}
      {modal === "mpesa" && <MpesaModal total={total} onClose={() => setModal(null)} onConfirm={() => setModal("receipt")}/>}
      {modal === "split" && <SplitModal total={total} onClose={() => setModal(null)} onConfirm={() => setModal("receipt")}/>}
      {modal === "receipt" && <ReceiptModal onClose={() => setModal(null)}/>}
    </div>
  );
};

// ---- Cash Modal (Screen 3) ----
const CashModal = ({ total = 225, onClose, onConfirm }) => {
  const [tendered, setTendered] = React.useState(500);
  const change = Math.max(0, tendered - total);
  return (
    <div className="pt-overlay">
      <div className="pt-modal" style={{ width: 480 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pt-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "var(--pt-green-50)", color: "var(--pt-green-600)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="cash" size={18}/>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Cash Payment</div>
          </div>
          <button className="pt-btn pt-btn--ghost" style={{ width: 36, padding: 0 }} onClick={onClose}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{
            background: "#fafbfc", border: "1px solid var(--pt-border)",
            borderRadius: 12, padding: 16, marginBottom: 20,
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <span style={{ fontSize: 13, color: "var(--pt-text-secondary)", fontWeight: 500 }}>Order total</span>
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ksh(total)}</span>
          </div>

          <Field label="Amount tendered">
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                fontSize: 16, fontWeight: 600, color: "var(--pt-text-secondary)",
              }}>KSh</span>
              <input
                className="pt-input"
                style={{ height: 56, paddingLeft: 56, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                value={tendered}
                onChange={e => setTendered(Number(e.target.value) || 0)}
                type="number"
              />
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {[
              { label: "Exact", val: total },
              { label: "500", val: 500 },
              { label: "1,000", val: 1000 },
              { label: "2,000", val: 2000 },
            ].map(b => (
              <button key={b.label}
                onClick={() => setTendered(b.val)}
                style={{
                  height: 44, borderRadius: 8,
                  border: tendered === b.val ? "1.5px solid var(--pt-green)" : "1px solid var(--pt-border)",
                  background: tendered === b.val ? "var(--pt-green-50)" : "white",
                  fontWeight: 600, fontSize: 13,
                  color: tendered === b.val ? "var(--pt-green-600)" : "var(--pt-text)",
                }}>
                {b.label === "Exact" ? "Exact " + ksh(b.val, { bare: true, decimals: 0 }) : "KSh " + b.label}
              </button>
            ))}
          </div>

          <div style={{
            marginTop: 24, padding: 16,
            borderRadius: 12,
            background: change > 0 ? "var(--pt-green-50)" : "#f3f4f6",
            border: "1px solid " + (change > 0 ? "var(--pt-green-100)" : "var(--pt-border)"),
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: change > 0 ? "var(--pt-green-600)" : "var(--pt-text-secondary)",
            }}>Change due</span>
            <span style={{
              fontSize: 28, fontWeight: 700,
              color: change > 0 ? "var(--pt-green-600)" : "var(--pt-text)",
              fontVariantNumeric: "tabular-nums",
            }}>{ksh(change)}</span>
          </div>

          <button className="pt-btn pt-btn--primary pt-btn--xl pt-btn--block" style={{ marginTop: 20 }} onClick={onConfirm}>
            <Icon name="check" size={18}/>
            Confirm sale
          </button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a onClick={onClose} style={{ fontSize: 13, color: "var(--pt-text-secondary)", cursor: "pointer" }}>Cancel</a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- M-Pesa Modal (Screen 4) ----
// Two paths:
//   • prompt — send STK push to customer's phone, wait for PIN
//   • manual — customer paid on their own (Pay Bill / Send Money), cashier
//     types in the M-Pesa transaction code and confirms manually
const MpesaModal = ({ total = 225, onClose, onConfirm, initialMode }) => {
  const [mode, setMode] = React.useState(initialMode || "prompt"); // prompt | manual
  const [phase, setPhase] = React.useState("input"); // input | waiting | verified
  const [phone, setPhone] = React.useState("0712 345 678");
  const [code, setCode] = React.useState("");
  const [t, setT] = React.useState(47);

  React.useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => setT(x => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Reset transient state when switching mode
  const switchMode = (m) => { setMode(m); setPhase("input"); setCode(""); setT(47); };

  const codeValid = /^[A-Z0-9]{10}$/i.test(code.trim());

  return (
    <div className="pt-overlay">
      <div className="pt-modal" style={{ width: 500 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pt-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "var(--pt-green-50)", color: "var(--pt-green-600)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 13, letterSpacing: "0.02em",
            }}>M·P</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>M-Pesa Payment</div>
          </div>
          <button className="pt-btn pt-btn--ghost" style={{ width: 36, padding: 0 }} onClick={onClose}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{
            background: "#fafbfc", border: "1px solid var(--pt-border)",
            borderRadius: 12, padding: 16, marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <span style={{ fontSize: 13, color: "var(--pt-text-secondary)", fontWeight: 500 }}>Amount</span>
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ksh(total)}</span>
          </div>

          {/* Mode toggle — Prompt vs Manual */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            marginBottom: 18,
          }}>
            {[
              { id: "prompt", title: "Send STK Push", desc: "Auto-prompt customer phone", icon: "phone" },
              { id: "manual", title: "Manual Confirm", desc: "Customer already paid", icon: "check" },
            ].map(opt => (
              <button key={opt.id} onClick={() => switchMode(opt.id)} style={{
                textAlign: "left", padding: 12,
                borderRadius: 10,
                border: mode === opt.id ? "1.5px solid var(--pt-green)" : "1px solid var(--pt-border)",
                background: mode === opt.id ? "var(--pt-green-50)" : "white",
                cursor: "pointer", transition: "background .12s, border-color .12s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: mode === opt.id ? "var(--pt-green)" : "#f3f4f6",
                    color: mode === opt.id ? "white" : "var(--pt-text-secondary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name={opt.icon} size={12}/>
                  </div>
                  <span style={{
                    fontWeight: 600, fontSize: 13,
                    color: mode === opt.id ? "var(--pt-green-600)" : "var(--pt-text)",
                  }}>{opt.title}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--pt-text-secondary)" }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* PROMPT mode */}
          {mode === "prompt" && phase === "input" && (
            <>
              <Field label="Customer phone number">
                <div style={{ display: "flex", gap: 8 }}>
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
                    placeholder="7__ ___ ___"
                  />
                </div>
              </Field>
              <button
                className="pt-btn pt-btn--primary pt-btn--xl pt-btn--block"
                style={{ marginTop: 16 }}
                onClick={() => { setPhase("waiting"); setT(47); }}
              >
                <Icon name="phone" size={18}/>
                Send STK Push
              </button>
            </>
          )}

          {mode === "prompt" && phase === "waiting" && (
            <div style={{
              padding: "20px 16px",
              borderRadius: 12,
              background: "var(--pt-green-50)",
              border: "1px solid var(--pt-green-100)",
              textAlign: "center",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: "var(--pt-green)", color: "white",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800, margin: "0 auto 12px",
              }}>M·P</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                Request sent to {phone}
              </div>
              <div style={{ fontSize: 13, color: "var(--pt-text-secondary)", marginBottom: 16 }}>
                Ask customer to enter their M-Pesa PIN
              </div>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "8px 14px", background: "white",
                borderRadius: 999, fontSize: 13, fontWeight: 600,
                color: "var(--pt-text)",
                fontVariantNumeric: "tabular-nums",
              }}>
                <span className="pt-spin"/>
                Waiting · 0:{String(t).padStart(2, "0")} remaining
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="pt-btn" style={{ height: 36 }} onClick={() => setPhase("input")}>Resend</button>
                <button className="pt-btn" style={{ height: 36 }} onClick={() => switchMode("manual")}>
                  <Icon name="edit" size={13}/>
                  Enter code manually
                </button>
                <button className="pt-btn pt-btn--primary" style={{ height: 36 }} onClick={onConfirm}>Confirmation received</button>
              </div>
            </div>
          )}

          {/* MANUAL mode */}
          {mode === "manual" && (
            <>
              <div style={{
                padding: 12, marginBottom: 14,
                background: "var(--pt-blue-50)",
                border: "1px solid var(--pt-blue-100)",
                borderRadius: 10,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <Icon name="info" size={15} style={{ color: "var(--pt-blue)", marginTop: 2, flexShrink: 0 }}/>
                <div style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.5 }}>
                  Use this when the customer paid via <strong>Pay Bill</strong> or <strong>Send Money</strong> on their own.
                  Read the M-Pesa SMS code aloud — verify it matches the amount before confirming.
                </div>
              </div>

              <Field label="M-Pesa transaction code">
                <input
                  className="pt-input pt-input--lg"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="e.g. RGQ45HTYS8"
                  style={{
                    fontFamily: "var(--pt-font-mono)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                />
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  marginTop: 6, fontSize: 11, color: "var(--pt-text-secondary)",
                }}>
                  <span>10 characters · letters & numbers</span>
                  <span style={{
                    fontVariantNumeric: "tabular-nums",
                    color: codeValid ? "var(--pt-green-600)" : "var(--pt-text-secondary)",
                    fontWeight: codeValid ? 600 : 400,
                  }}>
                    {codeValid ? "✓ Valid format" : `${code.length}/10`}
                  </span>
                </div>
              </Field>

              <div style={{
                marginTop: 14, padding: "10px 14px",
                background: "#fafbfc",
                border: "1px solid var(--pt-border)",
                borderRadius: 10,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <input type="checkbox" defaultChecked style={{ accentColor: "var(--pt-green)" }}/>
                <div style={{ fontSize: 12, color: "var(--pt-text-secondary)" }}>
                  I have <strong style={{ color: "var(--pt-text)" }}>verified the M-Pesa SMS</strong> on the till phone showing {ksh(total)}
                </div>
              </div>

              <button
                className="pt-btn pt-btn--primary pt-btn--xl pt-btn--block"
                style={{ marginTop: 16 }}
                onClick={onConfirm}
                disabled={!codeValid}
              >
                <Icon name="check" size={18}/>
                Confirm payment manually
              </button>

              <div style={{ marginTop: 10, textAlign: "center" }}>
                <a onClick={() => switchMode("prompt")} style={{
                  fontSize: 12, color: "var(--pt-green-600)",
                  fontWeight: 500, cursor: "pointer",
                }}>
                  ← Back to STK push instead
                </a>
              </div>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <a onClick={onClose} style={{ fontSize: 13, color: "var(--pt-text-secondary)", cursor: "pointer" }}>Cancel</a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Receipt Modal (Screen 5) ----
const ReceiptModal = ({ onClose }) => (
  <div className="pt-overlay">
    <div className="pt-modal" style={{ width: 460 }}>
      <div style={{ padding: "24px 24px 16px", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--pt-green-50)", color: "var(--pt-green)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12,
        }}>
          <Icon name="check" size={28}/>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pt-green-600)" }}>Sale Complete</div>
        <div style={{ fontSize: 13, color: "var(--pt-text-secondary)", marginTop: 4 }}>
          Receipt has been printed & emailed
        </div>
      </div>

      {/* Thermal receipt preview */}
      <div style={{ padding: "0 28px 8px" }}>
        <div className="pt-receipt" style={{
          padding: "20px 18px",
          borderRadius: 8,
          border: "1px dashed var(--pt-border-strong)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.05em" }}>NAIROBI PHARMACY</div>
            <div style={{ fontSize: 11 }}>CBD BRANCH · KIMATHI ST</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>VAT: P051234567K</div>
          </div>
          <div style={{ borderTop: "1px dashed #9ca3af", paddingTop: 8 }}>
            <Row k="Receipt" v="NAI-20260512-0042"/>
            <Row k="Date" v="12 May 2026, 14:33"/>
            <Row k="Cashier" v="John Mwangi"/>
          </div>
          <div style={{ borderTop: "1px dashed #9ca3af", margin: "8px 0", paddingTop: 8 }}>
            <ReceiptLine name="Amoxicillin 500mg" qty="14 tabs" amt="140.00"/>
            <ReceiptLine name="Paracetamol 500mg" qty="10 tabs" amt="35.00"/>
            <ReceiptLine name="ORS Sachet" qty="2 unit" amt="50.00"/>
          </div>
          <div style={{
            borderTop: "1px dashed #9ca3af", paddingTop: 8,
            display: "flex", justifyContent: "space-between",
            fontWeight: 700, fontSize: 13,
          }}>
            <span>TOTAL</span><span>KSh 225.00</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <Row k="Paid" v="M-Pesa"/>
            <Row k="Ref" v="RGQ45HTYS8"/>
          </div>
          <div style={{
            borderTop: "1px dashed #9ca3af", marginTop: 8, paddingTop: 8,
            textAlign: "center", fontSize: 11,
          }}>
            Thank you for your business
          </div>
        </div>
      </div>

      <div style={{
        padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8,
      }}>
        <button className="pt-btn">
          <Icon name="printer" size={16}/>
          Print
        </button>
        <button className="pt-btn">
          <Icon name="download" size={16}/>
          PDF
        </button>
        <button className="pt-btn pt-btn--primary" onClick={onClose}>
          New sale
          <Icon name="arrow" size={16}/>
        </button>
      </div>
    </div>
  </div>
);

const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
    <span style={{ color: "#6b7280" }}>{k}</span>
    <span>{v}</span>
  </div>
);
const ReceiptLine = ({ name, qty, amt }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 2 }}>
    <span>{name} × {qty}</span>
    <span>KSh {amt}</span>
  </div>
);

// ---- Split Modal (Screen 4b) ----
const SplitModal = ({ total = 225, onClose, onConfirm }) => {
  // Sensible default: most goes to M-Pesa, rest cash.
  const [cash, setCash]   = React.useState(Math.round(total * 0.4));
  const [phone, setPhone] = React.useState("0712 345 678");
  const [mpesaMode, setMpesaMode] = React.useState("prompt"); // prompt | manual
  const [code, setCode] = React.useState("");
  const mpesa = Math.max(0, total - cash);
  const remaining = total - cash - mpesa;
  const cashPct  = total > 0 ? Math.min(100, (cash  / total) * 100) : 0;
  const mpesaPct = total > 0 ? Math.min(100, (mpesa / total) * 100) : 0;
  const codeValid = /^[A-Z0-9]{10}$/i.test(code.trim());
  const canConfirm = cash > 0 && mpesa > 0 && (mpesaMode === "prompt" || codeValid);
  const setCashSafe = (v) => setCash(Math.min(total, Math.max(0, Number(v) || 0)));

  return (
    <div className="pt-overlay">
      <div className="pt-modal" style={{ width: 520 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pt-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "var(--pt-green-50)", color: "var(--pt-green-600)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="grid" size={16}/>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Split Payment</div>
              <div style={{ fontSize: 12, color: "var(--pt-text-secondary)" }}>Combine Cash + M-Pesa for one sale</div>
            </div>
          </div>
          <button className="pt-btn pt-btn--ghost" style={{ width: 36, padding: 0 }} onClick={onClose}>
            <Icon name="x" size={18}/>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Total + allocation bar */}
          <div style={{
            background: "#fafbfc", border: "1px solid var(--pt-border)",
            borderRadius: 12, padding: 16, marginBottom: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "var(--pt-text-secondary)", fontWeight: 500 }}>Order total</span>
              <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ksh(total)}</span>
            </div>
            <div style={{
              marginTop: 12, height: 8, borderRadius: 999,
              background: "#e5e7eb", overflow: "hidden",
              display: "flex",
            }}>
              <div style={{ width: `${cashPct}%`, background: "#9ca3af", transition: "width .15s" }}/>
              <div style={{ width: `${mpesaPct}%`, background: "var(--pt-green)", transition: "width .15s" }}/>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", marginTop: 8,
              fontSize: 11, color: "var(--pt-text-secondary)",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#9ca3af" }}/>
                Cash · {cashPct.toFixed(0)}%
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--pt-green)" }}/>
                M-Pesa · {mpesaPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Cash side */}
          <div style={{
            border: "1px solid var(--pt-border)", borderRadius: 12,
            padding: 14, marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: "#f3f4f6", color: "var(--pt-text-secondary)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="cash" size={14}/>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Cash portion</div>
            </div>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                fontSize: 13, fontWeight: 600, color: "var(--pt-text-secondary)",
              }}>KSh</span>
              <input
                className="pt-input"
                style={{ paddingLeft: 50, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                value={cash}
                onChange={e => setCashSafe(e.target.value)}
                type="number"
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[0, 25, 50, 75, 100].map(p => (
                <button key={p}
                  onClick={() => setCash(Math.round((total * p) / 100))}
                  style={{
                    flex: 1, height: 28, borderRadius: 6,
                    border: "1px solid var(--pt-border)", background: "white",
                    fontSize: 11, fontWeight: 600, color: "var(--pt-text-secondary)",
                  }}
                >{p}%</button>
              ))}
            </div>
          </div>

          {/* M-Pesa side */}
          <div style={{
            border: "1px solid var(--pt-green-100)", borderRadius: 12,
            padding: 14, background: "var(--pt-green-50)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: "var(--pt-green)", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 10, letterSpacing: "0.02em",
                }}>M·P</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>M-Pesa portion</div>
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700, color: "var(--pt-green-600)",
                fontVariantNumeric: "tabular-nums",
              }}>{ksh(mpesa)}</div>
            </div>

            {/* Prompt vs Manual toggle */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
              padding: 4, background: "white",
              borderRadius: 8, marginBottom: 10,
            }}>
              {[
                { id: "prompt", label: "STK Push", icon: "phone" },
                { id: "manual", label: "Manual Confirm", icon: "check" },
              ].map(o => (
                <button key={o.id} onClick={() => setMpesaMode(o.id)} style={{
                  height: 30, border: 0, borderRadius: 6,
                  background: mpesaMode === o.id ? "var(--pt-green)" : "transparent",
                  color: mpesaMode === o.id ? "white" : "var(--pt-text-secondary)",
                  fontWeight: 600, fontSize: 12,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  cursor: "pointer",
                }}>
                  <Icon name={o.icon} size={12}/>
                  {o.label}
                </button>
              ))}
            </div>

            {mpesaMode === "prompt" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{
                  height: 40, padding: "0 12px",
                  borderRadius: 8, border: "1px solid var(--pt-border-strong)",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 13, fontWeight: 500, background: "white",
                }}>🇰🇪 +254</div>
                <input
                  className="pt-input"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="7__ ___ ___"
                />
              </div>
            ) : (
              <div>
                <input
                  className="pt-input"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="M-Pesa code (e.g. RGQ45HTYS8)"
                  style={{
                    fontFamily: "var(--pt-font-mono)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                />
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  marginTop: 6, fontSize: 11, color: "var(--pt-text-secondary)",
                }}>
                  <span>Customer paid {ksh(mpesa)} via Pay Bill / Send Money</span>
                  <span style={{
                    fontVariantNumeric: "tabular-nums",
                    color: codeValid ? "var(--pt-green-600)" : "var(--pt-text-secondary)",
                    fontWeight: codeValid ? 600 : 400,
                  }}>
                    {codeValid ? "✓ Valid" : `${code.length}/10`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 18, padding: "12px 14px",
            borderRadius: 10, background: "#f9fafb",
          }}>
            <span style={{ fontSize: 12, color: "var(--pt-text-secondary)", fontWeight: 600 }}>
              {remaining === 0 ? "Allocation balanced ✓" : `Remaining: ${ksh(remaining)}`}
            </span>
            <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--pt-text-secondary)" }}>
              Cash {ksh(cash)} + M-Pesa {ksh(mpesa)}
            </span>
          </div>

          <button
            className="pt-btn pt-btn--primary pt-btn--xl pt-btn--block"
            style={{ marginTop: 16 }}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            <Icon name="check" size={18}/>
            {mpesaMode === "prompt"
              ? "Take cash & send STK push"
              : "Take cash & confirm M-Pesa code"}
          </button>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a onClick={onClose} style={{ fontSize: 13, color: "var(--pt-text-secondary)", cursor: "pointer" }}>Cancel</a>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { POSScreen, CashModal, MpesaModal, SplitModal, ReceiptModal });
