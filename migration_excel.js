#!/usr/bin/env node
/**
 * Migrate the "Prospect Tracker" sheet of Orders_Hub_Customer_Tracker.xlsx
 * into the Orders Hub CRM (MongoDB "leads" collection).
 *
 * Usage:
 *   node scripts/migrate-from-excel.js <file.xlsx> [options]
 *
 * Options:
 *   --dry-run          Parse and print a report, write nothing (no database needed)
 *   --year=2026        Replace the year in every date (your sheet says 2019)
 *   --no-swap          Do not swap day/month on dates Excel stored as real dates
 *   --reschedule-overdue=N
 *                      Follow-ups dated before today are respread from today,
 *                      N leads per day (oldest first), instead of all being overdue
 *   --sheet="Name"     Sheet to read (default: Prospect Tracker)
 *   --uri=<mongo uri>  Overrides MONGODB_URI from the environment / .env.local
 *
 * Re-running is safe: leads whose name + business already exist are skipped.
 */

const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ */
/* Settings you may want to edit                                       */
/* ------------------------------------------------------------------ */

// Excel "Status" -> CRM stage key (see lib/stages.ts)
const STATUS_TO_STAGE = {
  "new prospect": "prospect",
  "message sent": "greeted",
  "responded": "social_checked", // they replied and were found on social media
  "interested": "problem_found",
  "demo scheduled": "demo_offered",
  "demo completed": "demo_done",
  "store registered": "registered",
  "link shared": "link_shared",
  "first order received": "first_order",
  "active": "loyal",
  "not interested": "dropped",
};

// Same suggestions as lib/stages.ts, used when a row has no Next Action.
const DEFAULT_NEXT = {
  prospect: "Send greeting",
  greeted: "Check if they responded, then ask if they use social media",
  social_checked: "Ask if collecting orders is a problem",
  problem_found: "Introduce Orders Hub and ask if they want a demo",
  demo_offered: "Send demo YouTube link",
  demo_done: "Ask them to register",
  registered: "Encourage them to create their business",
  link_shared: "Wait for first order and help if needed",
  first_order: "Encourage them to keep using Orders Hub",
  loyal: "Ask them to recommend Orders Hub",
};
const CLOSED = new Set(["dropped", "transferred"]);

/* ------------------------------------------------------------------ */
/* CLI + env                                                           */
/* ------------------------------------------------------------------ */

const flags = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) {
    const i = a.indexOf("=");
    if (i === -1) flags[a.slice(2)] = true;
    else flags[a.slice(2, i)] = a.slice(i + 1);
  } else positional.push(a);
}

function loadEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const DRY = !!flags["dry-run"];
const YEAR = flags.year ? parseInt(flags.year, 10) : null;
const SWAP = !flags["no-swap"];
const SHEET = typeof flags.sheet === "string" ? flags.sheet : "Prospect Tracker";
const FILE = positional[0];

if (!FILE) {
  console.error("Usage: node scripts/migrate-from-excel.js <file.xlsx> [--dry-run] [--year=2026] [--no-swap]");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Cell + date helpers                                                 */
/* ------------------------------------------------------------------ */

function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return cellValue(v.result);
    if (v.hyperlink) return v.hyperlink;
    if (v.text !== undefined) return v.text;
    return String(v);
  }
  return v;
}

const text = (v) => {
  const c = cellValue(v);
  if (c === null || c instanceof Date) return "";
  return String(c).trim();
};

const warnings = [];
const warn = (row, msg) => warnings.push(`Row ${row}: ${msg}`);

/**
 * Returns a Date at UTC midnight (how the CRM stores dates) or null.
 *  - "27/2/2019" style text is read as day/month/year. Impossible days such as
 *    29/2 or 30/2 roll into March, which matches how the sheet was filled in.
 *  - Real Excel dates were created when Excel read "1/3/2019" as 3 January, so
 *    day and month are swapped back (only when that gives a valid month).
 */
function parseDate(v, row, label) {
  const c = cellValue(v);
  if (c === null || c === "") return null;
  let y, m, d;
  if (c instanceof Date) {
    y = c.getUTCFullYear();
    m = c.getUTCMonth() + 1;
    d = c.getUTCDate();
    if (SWAP && d <= 12 && d !== m) [m, d] = [d, m];
    else if (SWAP && d > 12) warn(row, `${label} ${c.toISOString().slice(0, 10)} kept as-is (day > 12, cannot be a swapped date)`);
  } else {
    const mt = String(c).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!mt) {
      warn(row, `${label} "${c}" is not a recognised date, left empty`);
      return null;
    }
    d = +mt[1]; m = +mt[2]; y = +mt[3];
    if (m < 1 || m > 12) {
      warn(row, `${label} "${c}" has month ${m}, left empty`);
      return null;
    }
  }
  if (YEAR) y = YEAR;
  return new Date(Date.UTC(y, m - 1, d));
}

const iso = (d) => (d ? d.toISOString().slice(0, 10) : "—");

// Found / first message / last contact dates cannot be in the future.
function checkNotFuture(d, row, label) {
  if (d && d.getTime() > Date.now() + 86400000) {
    warn(row, `${label} ${iso(d)} is in the future (try --year=<correct year>)`);
  }
}

// Local calendar day as a UTC-midnight Date, matching how the CRM stores dates.
function todayUtc() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

function cleanPhone(v) {
  const c = cellValue(v);
  if (c === null) return "";
  let s = String(c).trim();
  // Excel drops the leading zero of numbers: 931275877 -> 0931275877
  if (typeof c === "number" && /^[79]\d{8}$/.test(s)) s = "0" + s;
  return s;
}

function cleanAction(s) {
  if (!s) return "";
  const fixed = s.replace(/\bfo?l+o?w?\s*up\b/gi, "follow up").trim();
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

function orderProblem(s) {
  if (!s) return null;
  if (/\bno ordering issue/i.test(s)) return false;
  if (/\b(has|have)\b.*\bissues?\b|ordering issues/i.test(s)) return true;
  return null;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) {
    console.error(`Sheet "${SHEET}" not found. Sheets: ${wb.worksheets.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  // header name -> column index
  const cols = {};
  ws.getRow(1).eachCell((cell, n) => { cols[text(cell.value).toLowerCase()] = n; });
  const get = (row, name) => row.getCell(cols[name.toLowerCase()] || 9999).value;
  for (const need of ["business name", "contact person", "status"]) {
    if (!cols[need]) {
      console.error(`Missing column "${need}" in sheet "${SHEET}".`);
      process.exit(1);
    }
  }

  const now = new Date();
  const leads = [];
  const stageCounts = {};

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const business = text(get(row, "Business Name"));
    const contact = text(get(row, "Contact Person"));
    if (!business && !contact) return;

    const statusRaw = text(get(row, "Status"));
    let stage = STATUS_TO_STAGE[statusRaw.toLowerCase()];
    if (!stage) {
      warn(rowNumber, `unknown status "${statusRaw}", imported as "prospect"`);
      stage = "prospect";
    }
    const closed = CLOSED.has(stage);

    const dateFound = parseDate(get(row, "Date Found"), rowNumber, "Date Found");
    const firstMsg = parseDate(get(row, "First Message Date"), rowNumber, "First Message Date");
    let lastContact = parseDate(get(row, "Last Contact Date"), rowNumber, "Last Contact Date");
    if (!lastContact && firstMsg) lastContact = firstMsg;
    const followUp = closed ? null : parseDate(get(row, "Next Follow-up Date"), rowNumber, "Next Follow-up Date");
    checkNotFuture(dateFound, rowNumber, "Date Found");
    checkNotFuture(firstMsg, rowNumber, "First Message Date");
    checkNotFuture(lastContact, rowNumber, "Last Contact Date");

    const platform = text(get(row, "Platform"));
    const problemText = text(get(row, "Problem / Current Ordering Method"));
    const interest = text(get(row, "Interest Level"));
    const bizType = text(get(row, "Business Type"));
    const oldNotes = text(get(row, "Notes"));

    const noteLines = [];
    if (oldNotes) noteLines.push(oldNotes);
    const meta = [];
    if (platform) meta.push(`Platform: ${platform}`);
    if (bizType) meta.push(`Business type: ${bizType}`);
    if (interest && interest.toLowerCase() !== "unknown") meta.push(`Interest level: ${interest}`);
    if (problemText) meta.push(`Ordering problem: ${problemText}`);
    if (meta.length) noteLines.push(meta.join("\n"));

    const rawAction = cleanAction(text(get(row, "Next Action")));
    const nextAction = closed ? "" : rawAction || DEFAULT_NEXT[stage] || "";

    const activity = [{ date: now, note: "Imported from Excel tracker", stage }];
    if (firstMsg) activity.push({ date: firstMsg, note: `First message sent${platform ? " on " + platform : ""}`, stage: "greeted" });
    if (dateFound) activity.push({ date: dateFound, note: `Prospect found${platform ? " on " + platform : ""}`, stage: "prospect" });
    activity.sort((a, b) => b.date - a.date);

    leads.push({
      name: contact || business,
      business,
      phone: cleanPhone(get(row, "Phone/Telegram Username")),
      email: "",
      social: text(get(row, "Facebook/Telegram Link")),
      stage,
      hasSocialMedia: true, // every prospect was found on Facebook or Telegram
      hasOrderProblem: orderProblem(problemText),
      wantsSocialManager: false,
      lastContactDate: lastContact,
      nextAction,
      followUpDate: followUp,
      notes: noteLines.join("\n\n"),
      activity,
      createdAt: dateFound || now,
      updatedAt: now,
      _row: rowNumber,
    });
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  /* ---------- optional: spread overdue follow-ups from today ---------- */
  const perDay = parseInt(flags["reschedule-overdue"], 10);
  if (perDay > 0) {
    const today = todayUtc();
    const overdue = leads
      .filter((l) => l.followUpDate && l.followUpDate < today)
      .sort((a, b) => a.followUpDate - b.followUpDate);
    overdue.forEach((l, i) => {
      l.followUpDate = new Date(today.getTime() + Math.floor(i / perDay) * 86400000);
    });
    console.log(`Rescheduled ${overdue.length} overdue follow-up(s), ${perDay} per day starting today.\n`);
  }

  /* ---------- report ---------- */
  console.log(`Read ${leads.length} prospects from "${SHEET}"`);
  console.log("By stage:", stageCounts);
  const dates = leads.map((l) => l.lastContactDate).filter(Boolean).sort((a, b) => a - b);
  if (dates.length) console.log(`Last contact dates range: ${iso(dates[0])} to ${iso(dates[dates.length - 1])}`);
  console.log("\nFirst 5 parsed rows:");
  for (const l of leads.slice(0, 5)) {
    console.log(
      ` #${l._row} ${l.name} (${l.business}) | ${l.stage} | phone ${l.phone || "-"} | last ${iso(l.lastContactDate)} | follow-up ${iso(l.followUpDate)} | "${l.nextAction}"`
    );
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.slice(0, 25).forEach((w) => console.log(" - " + w));
    if (warnings.length > 25) console.log(` ...and ${warnings.length - 25} more`);
  }

  if (DRY) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  /* ---------- write ---------- */
  const uri = flags.uri || process.env.MONGODB_URI;
  if (!uri) {
    console.error("\nMONGODB_URI is not set (put it in .env.local or pass --uri=...).");
    process.exit(1);
  }
  const mongoose = require("mongoose");
  await mongoose.connect(uri);
  try {
    const col = mongoose.connection.collection("leads");
    const key = (n, b) => `${n}`.trim().toLowerCase() + "|" + `${b}`.trim().toLowerCase();
    const existing = new Set(
      (await col.find({}, { projection: { name: 1, business: 1 } }).toArray()).map((d) => key(d.name, d.business))
    );

    const docs = [];
    let skipped = 0;
    for (const l of leads) {
      const k = key(l.name, l.business);
      if (existing.has(k)) { skipped++; continue; }
      existing.add(k);
      const { _row, ...doc } = l;
      doc.activity = doc.activity.map((a) => ({ _id: new mongoose.Types.ObjectId(), ...a }));
      doc.__v = 0;
      docs.push(doc);
    }
    if (docs.length) await col.insertMany(docs, { ordered: false });
    console.log(`\nImported ${docs.length} lead(s). Skipped ${skipped} that already exist.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});