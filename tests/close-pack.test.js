// Close pack for the accountants and the three-line founder summary.
const test = require("node:test");
const assert = require("node:assert");
const AR = require("../site/ar.js");
const BILL = require("../site/billing.js");
const PACK = require("../site/close-pack.js");
const DEMO = require("../site/demo.js");

const RUN = Date.UTC(2026, 10, 6); // November 6, 2026
function demo() {
  const P = BILL.periodOf("2026-10").start;
  const c = AR.parseCSV(DEMO.contractsCSV(P));
  const run = BILL.billingRun(c.rows, BILL.autoMap(c.headers), P);
  const a = AR.parseCSV(DEMO.csv(RUN));
  const aging = AR.analyze(a.rows, AR.autoMap(a.headers), RUN);
  return { run, aging, pack: PACK.build(run, aging, RUN) };
}

test("register: one row per invoice with issue, due, amount and status", () => {
  const { run, pack } = demo();
  assert.strictEqual(pack.register.length, run.invoices.length);
  assert.strictEqual(Math.round(pack.register.reduce((s, r) => s + r.amount, 0) * 100), Math.round(run.total * 100));
  assert.ok(pack.register.every((r) => r.number && r.customer && r.issueDate && r.dueDate && r.status));
  assert.strictEqual(pack.register.filter((r) => r.statusKey === "held").length, 2);
  assert.ok(pack.register.filter((r) => r.statusKey !== "held").every((r) => r.statusKey === "open"));
});

test("status follows the run date: scheduled before issue, overdue after due", () => {
  const inv = { needsYou: false, issueDate: Date.UTC(2026, 9, 31), dueDate: Date.UTC(2026, 10, 30) };
  assert.strictEqual(PACK.statusOf(inv, Date.UTC(2026, 9, 20)).key, "scheduled");
  assert.strictEqual(PACK.statusOf(inv, Date.UTC(2026, 10, 30)).key, "open");
  assert.strictEqual(PACK.statusOf(inv, Date.UTC(2026, 11, 5)).label, "Overdue 5 days");
});

test("aging buckets add up to open AR, invoice by invoice", () => {
  const { aging, pack } = demo();
  assert.strictEqual(pack.arTotal, Math.round(aging.totalAR * 100) / 100);
  assert.deepStrictEqual(pack.buckets.map((b) => b.key), ["current", "b1", "b31", "b61", "b90"]);
  const n = aging.customers.reduce((s, c) => s + c.invoices.length, 0);
  assert.strictEqual(pack.buckets.reduce((s, b) => s + b.count, 0), n);
});

test("reconciliation sorts every bridge change into added, ended or changed", () => {
  const { run, pack } = demo();
  const fromBridge = ["added", "ended", "changed"].reduce((s, g) => s + pack.recon[g].filter((i) => i.delta).length, 0);
  assert.strictEqual(fromBridge, run.bridge.items.length);
  assert.ok(pack.recon.added.some((i) => i.reason === "One-off fee"));
  assert.ok(pack.recon.ended.some((i) => i.reason === "Contract ended"));
  assert.ok(pack.recon.ended.some((i) => /Final invoice/.test(i.reason))); // billed in full, so not in the bridge
  assert.ok(pack.recon.changed.some((i) => i.reason === "Annual bill"));
  assert.strictEqual(pack.recon.held.length, 2);
});

test("CSV has all three blocks, masks demo amounts, and says what it leaves out", () => {
  const { pack } = demo();
  const csv = PACK.csv(pack);
  for (const h of ["INVOICE REGISTER", "AR AGING AT RUN DATE", "RECONCILIATION VS LAST MONTH", "GL coding and revenue recognition"]) assert.ok(csv.includes(h), h);
  const masked = PACK.csv(pack, { mask: true });
  assert.ok(!/\d+\.\d\d/.test(masked));
  assert.match(masked, /DEMO DATA/);
});

test("PDF summary is one page and masks demo amounts", () => {
  const { jsPDF } = require("../site/vendor/jspdf-2.5.1.umd.min.js");
  const { pack } = demo();
  const real = PACK.pdf(jsPDF, pack, false);
  assert.strictEqual(real.getNumberOfPages(), 1);
  assert.match(real.output(), /Invoice register/);
  const masked = PACK.pdf(jsPDF, pack, true).output();
  assert.ok(!/\$\d/.test(masked));
  assert.match(masked, /Demo data/);
});

test("founder summary: three lines, billed vs last month, overdue, who needs a founder", () => {
  const { run, aging } = demo();
  const l = PACK.founderLines(run, aging);
  assert.strictEqual(l.length, 3);
  assert.match(l[0], /^Billed \$[\d.]+k for October 2026 across 10 invoices, up \$[\d.]+k on September/);
  assert.match(l[1], /^Overdue: \$[\d.]+k across \d+ invoices from \d+ customers/);
  assert.match(l[2], /For a founder to sign: Customer B \(Tier 4/);
  assert.match(l[2], /Customer E/);
});
