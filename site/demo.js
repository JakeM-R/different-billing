/* Demo data for a seed B2B SaaS company. Generic customers (A to L) with edge cases seeded. The page masks amounts as $xx in demo mode.
 * Dates are generated relative to the run date so the demo reads the same on any day. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DEMO = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var DAY = 86400000;

  // [invoice, customer, email, apEmail, amount, paid, daysOverdue, status, paidDaysAfterDue]
  // daysOverdue: positive = past due at run date; negative = due in future; null = missing due date.
  var ROWS = [
    ["DEMO-001", "Customer A", "billing@customer-a.example", "", 2400, 0, 10, "Open", null],
    ["DEMO-002", "Customer A", "billing@customer-a.example", "", 1950, 1950, 160, "Paid", -2],
    ["DEMO-003", "Customer A", "billing@customer-a.example", "", 2100, 2100, 95, "Paid", 0],

    ["DEMO-004", "Customer B", "billing@customer-b.example", "", 1850, 0, 5, "Open", null],
    ["DEMO-005", "Customer B", "billing@customer-b.example", "", 3200, 0, 40, "Open", null],
    ["DEMO-006", "Customer B", "billing@customer-b.example", "", 2950, 0, 70, "Open", null],
    ["DEMO-007", "Customer B", "billing@customer-b.example", "", 2600, 2600, 190, "Paid", 12],
    ["DEMO-008", "Customer B", "billing@customer-b.example", "", 2750, 2750, 150, "Paid", 20],

    ["DEMO-009", "Customer C", "billing@customer-c.example", "", 5000, 2000, 22, "Partially paid", null],

    ["DEMO-010", "Customer D", "billing@customer-d.example", "", 4100, 0, 35, "Disputed", null],

    ["DEMO-011", "Customer E", "billing@customer-e.example", "", 6200, 0, 120, "Open", null],

    ["DEMO-012", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 2800, 0, 45, "Open", null],
    ["DEMO-013", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 1500, 0, -12, "Open", null],
    ["DEMO-014", "Customer F", "billing@customer-f.example", "payables@customer-f.example", 2300, 2300, 140, "Paid", 9],

    ["DEMO-015", "Customer G", "", "", 1900, 0, 18, "Open", null],

    ["DEMO-016", "Customer H", "billing@customer-h.example", "", 3400, 0, -20, "Open", null],
    ["DEMO-017", "Customer H", "billing@customer-h.example", "", 2600, 0, -25, "Open", null],
    ["DEMO-018", "Customer H", "billing@customer-h.example", "", 2900, 2900, 135, "Paid", -3],

    ["DEMO-019", "Customer I", "billing@customer-i.example", "", 1800, 0, -15, "Open", null],
    ["DEMO-020", "Customer I", "billing@customer-i.example", "", 1200, 0, -5, "Open", null],

    ["DEMO-021", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 10400, 0, 8, "Open", null],
    ["DEMO-022", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 8800, 8800, 200, "Paid", 16],
    ["DEMO-023", "Customer J", "billing@customer-j.example", "payables@customer-j.example", 9100, 9100, 110, "Paid", 7],

    ["DEMO-024", "Customer K", "billing@customer-k.example", "", 1600, 1600, 130, "Paid", 0],
    ["DEMO-025", "Customer K", "billing@customer-k.example", "", -450, 0, 20, "Open", null],
    ["DEMO-026", "Customer K", "billing@customer-k.example", "", 1200, 1200, 25, "Open", null],

    ["DEMO-027", "Customer L", "billing@customer-l.example", "", 1200, 0, 3, "Open", null],
    ["DEMO-027", "Customer L", "billing@customer-l.example", "", 1200, 0, 3, "Open", null],
    ["DEMO-028", "Customer L", "billing@customer-l.example", "", 900, 0, null, "Open", null],
    ["DEMO-029", "Customer L", "billing@customer-l.example", "", 1350, 1350, 120, "Paid", -1]

  ];

  var HEADERS = ["Invoice number", "Company name", "Contact email", "AP email", "Amount", "Amount paid", "Invoice date", "Due date", "Status", "Terms", "Paid date", "Last contacted"];

  // Days before the run date that each customer was last chased. Absent means never.
  var LAST_CONTACT = { "Customer B": 14, "Customer C": 7, "Customer D": 12, "Customer E": 30, "Customer F": 10, "Customer J": 5 };

  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function q(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function csv(runDate) {
    var run = runDate;
    var lines = [HEADERS.join(",")];
    ROWS.forEach(function (r) {
      var due = r[6] == null ? null : run - r[6] * DAY;
      var net = NET45[r[1]] ? 45 : 30;
      var issue = (due == null ? run - 40 * DAY : due - net * DAY);
      var paidDate = r[8] == null ? "" : iso(due + r[8] * DAY);
      lines.push([r[0], r[1], r[2], r[3], r[4].toFixed(2), r[5].toFixed(2), iso(issue), due == null ? "" : iso(due), r[7], "Net " + net, paidDate, LAST_CONTACT[r[1]] != null && r[7] !== "Paid" ? iso(run - LAST_CONTACT[r[1]] * DAY) : ""].map(q).join(","));
    });
    return lines.join("\n");
  }

  // ---------- Contracts for the month-end billing run ----------
  // [contract, customer, apEmail, description, fee, frequency, startMonths, startDay, endMonths, po, poRequired, units, unitPrice, lastBilled]
  // startMonths / endMonths are relative to the billing month. endMonths is the month whose last
  // day the contract ends on; null means no end date. Emails follow the AR demo customers.
  // A seed-stage B2B SaaS book: platform subscriptions (monthly and annual), a seat add-on,
  // usage-billed campaign credits and one-off onboarding fees. Net 30, with two customers on Net 45.
  var CONTRACTS = [
    ["C-101", "Customer A", "", "Platform subscription", 4000, "Monthly", -14, 1, 10, "", "", "", "", 4000],
    ["C-102", "Customer B", "", "Platform subscription", 6000, "Monthly", -20, 1, 4, "", "", "", "", 5500],
    ["C-103", "Customer C", "", "Platform subscription", 3500, "Monthly", 0, 15, 12, "", "", "", "", ""],
    ["C-104", "Customer C", "", "Onboarding fee", 5000, "One-off", 0, 15, null, "", "", "", "", ""],
    ["C-105", "Customer D", "", "Platform subscription, annual", 60000, "Annual", -12, 1, null, "PO-4471", "Yes", "", "", ""],
    ["C-106", "Customer E", "", "Platform subscription, annual", 48000, "Annual", -4, 1, 8, "", "", "", "", ""],
    ["C-107", "Customer F", "payables@customer-f.example", "Platform subscription", 5000, "Monthly", -11, 1, 0, "", "", "", "", 5000],
    ["C-108", "Customer G", "", "Platform subscription", 3000, "Monthly", -8, 1, 4, "", "", "", "", 3000],
    ["C-109", "Customer H", "", "Platform subscription", 4500, "Monthly", -5, 1, 7, "", "Yes", "", "", 4500],
    ["C-110", "Customer I", "", "Platform subscription", 2500, "Monthly", -1, 1, 11, "", "", "", "", 2500],
    ["C-111", "Customer I", "", "Onboarding fee", 7500, "One-off", -1, 1, null, "", "", "", "", 7500],
    ["C-112", "Customer J", "payables@customer-j.example", "Platform subscription", 8000, "Monthly", -15, 1, 9, "PO-88213", "Yes", 1240, 1.5, 9860],
    ["C-113", "Customer J", "payables@customer-j.example", "Additional seats", 1500, "Monthly", -3, 1, 9, "PO-88213", "Yes", "", "", 1500],
    ["C-114", "Customer K", "", "Platform subscription", 1600, "Monthly", -9, 1, -1, "", "", "", "", 1600],
    ["C-115", "Customer L", "", "Platform subscription", 2000, "Monthly", -11, 1, 1, "", "", "", "", 2000]
  ];
  // Customers on Net 45; everyone else is Net 30.
  var NET45 = { "Customer D": true, "Customer J": true };
  var CONTRACT_HEADERS = ["Contract ID", "Company name", "Billing email", "AP email", "Description", "Fee per bill", "Billing frequency", "Start date", "End date", "PO number", "PO required", "Usage units", "Unit price", "Terms", "Last month billed"];

  function contractsCSV(period) {
    var d = new Date(period), y = d.getUTCFullYear(), m = d.getUTCMonth();
    var lines = [CONTRACT_HEADERS.join(",")];
    CONTRACTS.forEach(function (c) {
      var email = c[1] === "Customer G" ? "" : "billing@" + c[1].toLowerCase().replace(/\s+/g, "-") + ".example";
      var start = iso(Date.UTC(y, m + c[6], c[7]));
      var end = c[8] == null ? "" : iso(Date.UTC(y, m + c[8] + 1, 0));
      lines.push([c[0], c[1], email, c[2], c[3], c[4].toFixed(2), c[5], start, end, c[9], c[10], c[11], c[12], NET45[c[1]] ? "Net 45" : "Net 30", c[13] === "" ? "" : c[13].toFixed(2)].map(q).join(","));
    });
    return lines.join("\n");
  }

  return { csv: csv, HEADERS: HEADERS, count: ROWS.length, contractsCSV: contractsCSV, CONTRACT_HEADERS: CONTRACT_HEADERS, contractCount: CONTRACTS.length };
});
