/* Month-end close pack for the external accountants, and the three-line founder summary.
 * Pure: takes a billing run (billing.js) and an aging result (ar.js), so the same code runs in
 * the browser and in Node tests. No GL coding or revenue recognition: that's the accountants' call. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./ar.js"));
  else root.PACK = factory(root.AR);
})(typeof globalThis !== "undefined" ? globalThis : this, function (AR) {
  "use strict";
  var DAY = 86400000;
  function r2(n) { return Math.round(n * 100) / 100; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }

  /* Status of each invoice in this month's register, as of the aging run date. */
  function statusOf(inv, runDate) {
    if (inv.needsYou) return { key: "held", label: "Held: check before sending" };
    if (runDate < inv.issueDate) return { key: "scheduled", label: "To issue " + AR.fmtShortDate(inv.issueDate) };
    var d = Math.round((runDate - inv.dueDate) / DAY);
    if (d > 0) return { key: "overdue", label: "Overdue " + plural(d, "day") };
    return { key: "open", label: "Open, not yet due" };
  }

  // Bridge reasons sorted into what the accountants want to know: added, ended, changed.
  function groupOf(reason) {
    if (/^New contract|^One-off fee$/.test(reason)) return "added";
    if (/ended|Final month|billed last month/i.test(reason)) return "ended";
    return "changed";
  }

  function build(run, aging, runDate) {
    var P = run.period;
    var register = run.invoices.map(function (inv) {
      var s = statusOf(inv, runDate);
      return { number: inv.number, customer: inv.customer, issueDate: inv.issueDate, dueDate: inv.dueDate, amount: inv.total, terms: inv.terms, status: s.label, statusKey: s.key };
    }).sort(function (a, b) { return a.number < b.number ? -1 : 1; });

    var buckets = AR.BUCKETS.map(function (b) { return { key: b.key, label: b.label, amount: 0, count: 0 }; });
    var byKey = {}; buckets.forEach(function (b) { byKey[b.key] = b; });
    var customers = [];
    (aging ? aging.customers : []).forEach(function (c) {
      c.invoices.forEach(function (i) { byKey[i.bucket].amount += i.balance; byKey[i.bucket].count++; });
      customers.push({ name: c.name, buckets: c.buckets, balance: c.balance });
    });
    buckets.forEach(function (b) { b.amount = r2(b.amount); });
    var arTotal = r2(buckets.reduce(function (s, b) { return s + b.amount; }, 0));

    var recon = { added: [], ended: [], changed: [], held: [] };
    if (run.bridge) run.bridge.items.forEach(function (it) { recon[groupOf(it.reason)].push(it); });
    // Final invoices that bill in full don't move the total, but the accountants still need to know.
    run.invoices.forEach(function (inv) {
      inv.contracts.forEach(function (c) {
        if (c.isFinal && !recon.ended.some(function (e) { return e.contract === (c.id || c.description); }))
          recon.ended.push({ customer: c.customer, contract: c.id || c.description, reason: "Final invoice, contract ends " + AR.fmtShortDate(c.end), delta: 0 });
      });
    });
    run.skipped.filter(function (s) { return s.needsYou; }).forEach(function (s) {
      recon.held.push({ customer: s.customer, contract: s.id || s.description, reason: s.reason, delta: 0 });
    });
    run.invoices.filter(function (i) { return i.needsYou; }).forEach(function (i) {
      recon.held.push({ customer: i.customer, contract: i.number, reason: i.flags[0], delta: 0 });
    });

    return {
      period: P, runDate: runDate, register: register, total: run.total,
      buckets: buckets, arTotal: arTotal, customers: customers,
      bridge: run.bridge ? { last: run.bridge.last, now: run.bridge.now, change: run.bridge.change } : null,
      recon: recon
    };
  }

  function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  /* One CSV with three blocks the accountants can split: register, aging, reconciliation.
   * opts.mask writes amounts as "xx" for demo files. */
  function csv(pack, opts) {
    var m = opts && opts.mask, amt = function (n) { return m ? "xx" : r2(n).toFixed(2); };
    var out = [];
    out.push(q("Close pack · " + pack.period.label + " · aging as of " + AR.isoDate(pack.runDate) + (m ? " · DEMO DATA, amounts hidden" : "")));
    out.push("");
    out.push("INVOICE REGISTER");
    out.push("Invoice number,Customer,Issue date,Due date,Terms,Amount,Status");
    pack.register.forEach(function (r) {
      out.push([r.number, r.customer, AR.isoDate(r.issueDate), AR.isoDate(r.dueDate), r.terms, amt(r.amount), r.status].map(q).join(","));
    });
    out.push(["Total", "", "", "", "", amt(pack.total), ""].map(q).join(","));
    out.push("");
    out.push("AR AGING AT RUN DATE");
    out.push("Customer," + pack.buckets.map(function (b) { return q(b.label); }).join(",") + ",Total");
    pack.customers.forEach(function (c) {
      out.push([c.name].concat(pack.buckets.map(function (b) { return amt(c.buckets[b.key]); })).concat([amt(c.balance)]).map(q).join(","));
    });
    out.push(["Total"].concat(pack.buckets.map(function (b) { return amt(b.amount); })).concat([amt(pack.arTotal)]).map(q).join(","));
    out.push("");
    out.push("RECONCILIATION VS LAST MONTH");
    out.push("Change,Customer,Contract,Reason,Amount");
    if (pack.bridge) out.push(["Last month billed", "", "", "", amt(pack.bridge.last)].map(q).join(","));
    [["added", "Added"], ["ended", "Ended"], ["changed", "Changed"], ["held", "Held for a fix"]].forEach(function (g) {
      pack.recon[g[0]].forEach(function (it) { out.push([g[1], it.customer, it.contract, it.reason, it.delta ? amt(it.delta) : ""].map(q).join(",")); });
    });
    if (pack.bridge) out.push(["This month billed", "", "", "", amt(pack.bridge.now)].map(q).join(","));
    out.push("");
    out.push(q("Not included: GL coding and revenue recognition, which are for the accountants."));
    return out.join("\n") + "\n";
  }

  /* One-page PDF summary. Takes the jsPDF constructor. */
  var INK = [17, 17, 17], INK2 = [74, 74, 74], INK3 = [122, 122, 119], LINE = [228, 228, 228], GREY = [242, 242, 241], RUST = [217, 102, 63];
  function pdf(jsPDF, pack, demo) {
    var money = function (n) { return demo ? "$xx" : AR.fmtMoney(n); };
    var doc = new jsPDF({ unit: "pt", format: "letter" });
    var W = 612, M = 48, y = M;
    var col = function (c) { doc.setTextColor(c[0], c[1], c[2]); };
    var rule = function () { doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); };
    var label = function (t, x, yy, align) { doc.setFont("courier", "normal"); doc.setFontSize(7.5); col(INK3); doc.text(t.toUpperCase(), x, yy, align ? { align: align } : undefined); };

    if (demo) {
      doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.roundedRect(M, y, W - 2 * M, 22, 11, 11, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); col(INK);
      doc.text("Demo data: fictional customers, amounts hidden. Not a real close pack.", M + 12, y + 14.5);
      y += 36;
    }
    label("Close pack · for the accountants", M, y + 6);
    doc.setFont("times", "normal"); doc.setFontSize(26); col(INK);
    doc.text(pack.period.label, M, y + 32);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); col(INK3);
    doc.text("Aging as of " + AR.fmtDate(pack.runDate), W - M, y + 32, { align: "right" });
    y += 50;

    // Key figures
    var figs = [["Billed", money(pack.total)], ["Invoices", String(pack.register.length)], ["Open AR", money(pack.arTotal)],
      ["Over 60 days", money(pack.buckets.filter(function (b) { return b.key === "b61" || b.key === "b90"; }).reduce(function (s, b) { return s + b.amount; }, 0))]];
    var fw = (W - 2 * M) / figs.length;
    figs.forEach(function (f, i) {
      label(f[0], M + i * fw, y);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); col(INK); doc.text(f[1], M + i * fw, y + 17);
    });
    y += 34; rule(); y += 20;

    // Register
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); col(INK); doc.text("Invoice register", M, y); y += 16;
    var cx = [M, M + 92, M + 210, M + 270, M + 330, W - M - 150, W - M];
    ["Invoice", "Customer", "Issued", "Due", "Terms"].forEach(function (h, i) { label(h, cx[i], y); });
    label("Status", cx[5], y); label("Amount", cx[6], y, "right");
    y += 6; rule();
    var maxRows = 14, shown = pack.register.slice(0, maxRows);
    shown.forEach(function (r) {
      y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); col(INK);
      doc.text(r.number, cx[0], y);
      doc.text(doc.splitTextToSize(r.customer, 112)[0], cx[1], y);
      col(INK2);
      doc.text(AR.fmtShortDate(r.issueDate), cx[2], y);
      doc.text(AR.fmtShortDate(r.dueDate), cx[3], y);
      doc.text(r.terms, cx[4], y);
      if (r.statusKey === "held" || r.statusKey === "overdue") col(RUST);
      doc.text(doc.splitTextToSize(r.statusKey === "held" ? "Held for a fix" : r.status, 100)[0], cx[5], y);
      col(INK); doc.text(money(r.amount), cx[6], y, { align: "right" });
    });
    if (pack.register.length > maxRows) { y += 14; doc.setFontSize(8); col(INK3); doc.text("+ " + (pack.register.length - maxRows) + " more in the CSV", cx[0], y); }
    y += 8; rule(); y += 14;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); col(INK); doc.text("Total billed", cx[0], y); doc.text(money(pack.total), cx[6], y, { align: "right" });
    y += 28;

    // Aging buckets
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text("AR aging at run date", M, y); y += 16;
    var bw = (W - 2 * M) / (pack.buckets.length + 1);
    pack.buckets.concat([{ label: "Total", amount: pack.arTotal, count: pack.buckets.reduce(function (s, b) { return s + b.count; }, 0) }]).forEach(function (b, i) {
      var x = M + i * bw;
      label(b.label + (b.label === "Current" || b.label === "Total" ? "" : " days"), x, y);
      doc.setFont("helvetica", i === pack.buckets.length ? "bold" : "normal"); doc.setFontSize(10); col(INK); doc.text(money(b.amount), x, y + 15);
      doc.setFontSize(7.5); col(INK3); doc.text(plural(b.count, "invoice"), x, y + 26);
    });
    y += 44; rule(); y += 20;

    // Reconciliation
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); col(INK); doc.text("Reconciliation note: contracts vs last month", M, y); y += 14;
    if (pack.bridge) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); col(INK2);
      doc.text("Last month " + money(pack.bridge.last) + ", this month " + money(pack.bridge.now) + " (" + (demo ? "$xx" : (pack.bridge.change < 0 ? "-" : "+") + AR.fmtMoney(Math.abs(pack.bridge.change)).replace("-", "")) + ")", M, y);
      y += 16;
    }
    var gw = (W - 2 * M) / 3, top = y, bottom = y;
    [["added", "Added"], ["ended", "Ended"], ["changed", "Changed"]].forEach(function (g, i) {
      var x = M + i * gw, yy = top;
      label(g[1], x, yy); yy += 13;
      var items = pack.recon[g[0]];
      if (!items.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); col(INK3); doc.text("None", x, yy); yy += 12; }
      items.slice(0, 6).forEach(function (it) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); col(INK);
        doc.text(doc.splitTextToSize(it.customer + (it.delta ? "  " + (demo ? (it.delta < 0 ? "-$xx" : "+$xx") : (it.delta < 0 ? "-" : "+") + AR.fmtMoney(Math.abs(it.delta))) : ""), gw - 12)[0], x, yy);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); col(INK3);
        doc.text(doc.splitTextToSize(it.contract + " · " + it.reason, gw - 12)[0], x, yy + 10);
        yy += 24;
      });
      bottom = Math.max(bottom, yy);
    });
    y = bottom;
    if (pack.recon.held.length) {
      y += 4; label("Held for a fix before sending", M, y); y += 12;
      pack.recon.held.slice(0, 4).forEach(function (it) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); col(INK2);
        doc.text(doc.splitTextToSize(it.customer + " (" + it.contract + "): " + it.reason, W - 2 * M)[0], M, y); y += 11;
      });
    }

    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); col(INK3);
    doc.text("Prepared from the contracts file and AR data. Not included: GL coding and revenue recognition, which are for the accountants.", M, 792 - 36);
    doc.setProperties({ title: "Close pack " + pack.period.label, creator: "Billing & collections prototype" });
    return doc;
  }

  /* Three lines for the founders: billed vs last month, what's overdue, what needs a founder. */
  function founderLines(run, aging, opts) {
    var k = (opts && opts.money) || AR.fmtK;
    var P = run.period, lines = [];
    var prev = AR.fmtDate(Date.UTC(P.year, P.month - 1, 1)).split(" ")[0];
    var l1 = "Billed " + k(run.total) + " for " + P.label + " across " + plural(run.invoices.length, "invoice");
    if (run.bridge) {
      var ch = run.bridge.change, top = run.bridge.items[0];
      l1 += ch ? ", " + (ch > 0 ? "up " : "down ") + k(Math.abs(ch)) + " on " + prev : ", flat on " + prev;
      if (top && ch) l1 += " (largest move: " + top.customer + ", " + top.reason.toLowerCase() + ")";
    }
    var held = run.invoices.filter(function (i) { return i.needsYou; }).length;
    lines.push(l1 + "." + (held ? " " + plural(held, "invoice") + " held for a fix." : ""));

    if (aging) {
      var over = 0, n = 0, custs = 0, over60 = 0;
      aging.customers.forEach(function (c) {
        var late = c.invoices.filter(function (i) { return i.daysOverdue > 0; });
        if (late.length) custs++;
        late.forEach(function (i) { over += i.balance; n++; if (i.daysOverdue > 60) over60 += i.balance; });
      });
      lines.push(n ? "Overdue: " + k(r2(over)) + " across " + plural(n, "invoice") + " from " + plural(custs, "customer") + (over60 ? ", " + k(r2(over60)) + " of it over 60 days." : ".") : "Nothing overdue at " + AR.fmtShortDate(aging.runDate) + ".");
      var sign = aging.customers.filter(function (c) { return c.tier === 4 && c.action === "chase" && c.email; });
      var call = aging.customers.filter(function (c) { return c.tier === 5; });
      var l3 = sign.length ? "For a founder to sign: " + sign.map(function (c) { return c.name + " (Tier 4, " + c.oldestDays + " days)"; }).join(", ") + "." : "No drafts need a founder's signature this run.";
      if (call.length) l3 += " For a founder call: " + call.map(function (c) { return c.name + " (" + c.oldestDays + " days, a call rather than another email)"; }).join(", ") + ".";
      lines.push(l3);
    }
    return lines;
  }

  return { build: build, csv: csv, pdf: pdf, founderLines: founderLines, statusOf: statusOf, groupOf: groupOf };
});
