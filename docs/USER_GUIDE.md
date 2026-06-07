# PharmaTrack — User Guide

Welcome to PharmaTrack 👋 This guide walks you through everything you need to run your pharmacy on the platform after signing up. Keep it handy and share it with your team.

> Looking for technical/setup docs instead? See the main [README](../README.md).

## Contents
1. [Getting into your account](#1-getting-into-your-account)
2. [Who can do what (roles)](#2-who-can-do-what-roles)
3. [First-week setup checklist (owners)](#3-first-week-setup-checklist-owners)
4. [Signing in day-to-day](#4-signing-in-day-to-day)
5. [Selling at the till (POS)](#5-selling-at-the-till-pos)
6. [Inventory & receiving stock](#6-inventory--receiving-stock)
7. [Products & catalogue](#7-products--catalogue)
8. [Suppliers](#8-suppliers)
9. [Appointments & reminders](#9-appointments--reminders)
10. [Reports](#10-reports)
11. [Staff & shifts](#11-staff--shifts)
12. [Settings](#12-settings)
13. [Billing & your subscription](#13-billing--your-subscription)
14. [Tips & troubleshooting](#14-tips--troubleshooting)
15. [Getting help](#15-getting-help)

---

## 1. Getting into your account

When your pharmacy is set up, the **owner receives an email invitation**.

1. Open the email and click **the invite link**.
2. You'll be asked to **choose a password**.
3. You're signed in — owners land on the **Dashboard**.

**Forgot your password?** On the sign-in page, click **"Forgot password?"**, enter your email, and follow the link we send to set a new one.

**Adding your team:** owners/managers invite staff from **Staff** (see [section 11](#11-staff--shifts)); each person gets their own invite email to set a password.

---

## 2. Who can do what (roles)

| Capability | Owner | Manager | Pharmacist | Cashier |
|---|:--:|:--:|:--:|:--:|
| Sell at the till (POS) | ✅ | ✅ | ✅ | ✅ |
| Inventory & receive stock | ✅ | ✅ | ✅ | – |
| Products, suppliers, appointments | ✅ | ✅ | ✅ | – |
| Reports & shifts overview | ✅ | ✅ | – | – |
| Staff management | ✅ | ✅ | – | – |
| Settings, services, **billing** | ✅ | partial | – | – |

Cashiers are taken straight to the **POS** when they log in.

---

## 3. First-week setup checklist (owners)

Do these once, in order, to get fully operational:

1. **Organization details** — Settings → Organization (name, contacts, logo).
2. **Branches** — Settings → Branches. Add every physical location.
3. **Staff** — Staff → Invite. Assign each person a role and branch.
4. **Suppliers** — Suppliers. Add who you buy from.
5. **Products** — Products → Add. Build your catalogue (or import as you receive stock). Set selling/cost prices, pack sizes, and a default supplier.
6. **Opening stock** — Stock Receive (or "add stock" when creating a product) with batch numbers and expiry dates.
7. **Appointment services** (if you offer injections/family planning) — Settings → Services.
8. **Billing** — Settings → Billing. Check your plan and trial end date.

---

## 4. Signing in day-to-day

Two ways to sign in (Email tab / Quick PIN tab):

- **Email login** — email + password. Best for owners/managers.
- **Quick PIN login** — phone number + 4‑digit PIN. Fast for cashiers/pharmacists at the till. (Set your PIN in Settings → My Profile.)

If your pharmacy has more than one branch, pick the **active branch** from the top bar — everything you sell and receive applies to that branch.

---

## 5. Selling at the till (POS)

Open **POS Terminal**.

1. **Start your shift** — clock in and enter your opening cash float.
2. **Add items** — search by name, or scan a barcode. Tap a product to add it; adjust quantity in the cart. Apply a discount per line (within the product's allowed limit).
3. **Take payment** — choose:
   - **Cash** — enter amount tendered; the change is calculated.
   - **M‑Pesa** — sends an STK push to the customer's phone to approve.
   - **Card / Split** — record card, or split across methods.
4. **Receipt** — print or save the PDF; optionally capture the customer's name/phone.
5. **End your shift** — clock out and enter closing cash; the system shows any variance.

**Connectivity:** the till needs an internet connection to take payments and record sales. Keep a stable connection at the point of sale. (Full offline selling is on our roadmap.)

---

## 6. Inventory & receiving stock

- **Stock Receive** — record new deliveries: product, **batch number**, **expiry date**, quantity, and cost price. Stock is tracked per branch and per batch.
- **Inventory** — see stock on hand, filter by **low stock**, **expiring soon**, **out of stock**, or **controlled**.
- **Controlled substances** are logged to a register automatically for compliance.

Tip: receiving stock against the correct expiry means the system can warn you before items expire.

---

## 7. Products & catalogue

Under **Products** you can add and edit medicines:

- Generic & brand name, manufacturer, strength, dosage form, GTIN/barcode, image
- **Categories** (two levels) to organize the catalogue
- **Pack sizes** (e.g. strip of 10, box of 100) with their own prices/barcodes
- **Default supplier** and **maximum discount %** per product
- Deactivate items you no longer sell (history is preserved)

---

## 8. Suppliers

Under **Suppliers**, add the businesses you buy from (name, phone, email, address). Assign a **default supplier** to each product so reordering and stock receiving are quicker. Deactivate suppliers you no longer use without losing past records.

---

## 9. Appointments & reminders

For injections, family planning, vaccinations and clinical visits — open **Appointments**.

- **Book** — search an existing customer or add a new one, pick the **service**, date/time, branch and the pharmacist responsible.
- **Track** — Today / Upcoming / Past tabs; mark each as Confirmed, Completed, No-show or Cancelled.
- **Recurring doses** — completing a recurring service (e.g. Depo‑Provera every 13 weeks) offers to **book the next dose** automatically.
- **Reminders** — the day before, customers get an **SMS and/or email**, and the assigned pharmacist gets an SMS. Each customer can **opt out** of messaging (SMS is charged), toggled when booking.
- **Manage your services** — owners/managers edit the bookable services and their repeat intervals in **Settings → Services**.

> Reminders send automatically once your messaging providers are configured by your administrator. Booking and tracking work regardless.

---

## 10. Reports

**Reports** gives you sales, inventory and financial views — revenue, top products, stock value, expiring stock, and shift takings — to understand performance and plan reorders.

---

## 11. Staff & shifts

- **Staff** (owners/managers) — invite team members, set their **role** and **branch**, deactivate people who leave. Each invite is an email to set a password.
- **Shifts** — every till session is a shift with clock-in/out, opening float and closing cash. Use **Shifts** to review takings and cash variance per person.

---

## 12. Settings

| Tab | What you manage |
|---|---|
| **Organization** | Pharmacy name, contacts, logo |
| **Branches** | Your locations |
| **Services** | Bookable appointment services + repeat intervals |
| **Billing** | Subscription status & payments (see below) |
| **My Profile** | Your name, phone, and **4‑digit PIN** |
| **Appearance** | Light / Dark / System theme |

---

## 13. Billing & your subscription

Settings → **Billing** shows your **plan**, **status**, and **paid-until** date.

- If online payment is enabled, click **Pay / Renew** to pay securely (card or M‑Pesa via Paystack). Your subscription activates and extends automatically once payment succeeds.
- If online payment isn't enabled yet, contact PharmaTrack to renew.
- **If a subscription lapses**, the app shows an **"Access paused"** screen until it's renewed — your data is safe and returns the moment you're active again.

---

## 14. Tips & troubleshooting

- **Can't sign in / link expired?** Use **Forgot password?** to get a fresh link. Invite and reset links are single-use and time-limited.
- **Didn't get the invite/reset email?** Check spam; ask your owner/administrator to resend.
- **M‑Pesa prompt didn't arrive?** Confirm the customer's phone number format and that they have network, then retry.
- **Reminders not arriving?** They send the day before and require your messaging providers to be set up; confirm the customer hasn't opted out and has a phone/email on file.
- **Wrong branch?** Switch the active branch in the top bar before selling or receiving stock.
- **Lost connection at the till?** Sales need a connection to record and to take M‑Pesa/card. Restore internet and retry; avoid clearing browser data mid-shift.

---

## 15. Getting help

- Your **pharmacy owner** is the first point of contact for accounts, roles and branches.
- For billing, outages, or anything the owner can't resolve, contact **PharmaTrack support**.

Thank you for running your pharmacy on PharmaTrack 💚
