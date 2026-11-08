// Loads Telnyx's outbound rate deck into the call_rates table, which
// lib/billing.ts uses to price every call. Re-run it whenever Telnyx sends a
// new deck: rows are upserted, then any prefix missing from the new deck is
// removed.
//
//   node scripts/import-rate-deck.mjs [path/to/rate-deck.csv]
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY from the
// environment or .env.local. Imports only rows that apply to our calls:
// origination blank (any caller ID) or "local" (caller ID in the same
// country as the destination). Rows priced for specific origination prefixes
// are skipped, so those destinations bill at the general rate.

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const csvPath = process.argv[2] || path.join("docs", "global_conver_e46ddd3bf7.csv");
const BATCH_SIZE = 1000;

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const { data, errors } = Papa.parse(fs.readFileSync(csvPath, "utf8"), { header: true, skipEmptyLines: true });
if (errors.length) {
  console.error(`CSV parse errors (first 3):`, errors.slice(0, 3));
  process.exit(1);
}

const importedAt = new Date().toISOString();
const rows = new Map();
let skipped = 0;

for (const r of data) {
  const originationRaw = (r["Origination Prefixes"] || "").trim().toLowerCase();
  const origination = originationRaw === "" ? "" : originationRaw === "local" ? "local" : null;
  const prefix = (r["Destination Prefixes"] || "").trim();
  const rate = Number(r.Rate);
  const perCall = (r["Price Per Call"] || "").trim() === "" ? 0 : Number(r["Price Per Call"]);
  const intervals = `${r["Interval 1"]}/${r["Interval N"]}`;

  if (origination === null || !/^\d{1,15}$/.test(prefix) || !Number.isFinite(rate) || !Number.isFinite(perCall)) {
    skipped++;
    continue;
  }
  if (intervals !== "60/60") {
    // lib/billing.ts bills per started minute; stop rather than misprice.
    console.error(`Unexpected billing interval ${intervals} for prefix ${prefix}; the billing code needs updating.`);
    process.exit(1);
  }

  rows.set(`${prefix}|${origination}`, {
    destination_prefix: prefix,
    origination,
    country_code: (r.ISO || "").trim().toUpperCase(),
    description: (r.Description || "").trim() || null,
    rate_per_min: rate,
    price_per_call: perCall,
    imported_at: importedAt,
  });
}

const all = [...rows.values()];
console.log(`Importing ${all.length} rates (${skipped} rows skipped) from ${csvPath}`);

for (let i = 0; i < all.length; i += BATCH_SIZE) {
  const batch = all.slice(i, i + BATCH_SIZE);
  const res = await fetch(`${supabaseUrl}/rest/v1/call_rates?on_conflict=destination_prefix,origination`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    console.error(`Batch starting at row ${i} failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
    console.error("Nothing was removed; fix the problem and run the import again.");
    process.exit(1);
  }
  if ((i / BATCH_SIZE) % 20 === 0) console.log(`  ${Math.min(i + BATCH_SIZE, all.length)} / ${all.length}`);
}

// Every row in the new deck now carries this run's timestamp; anything older
// is a prefix Telnyx dropped.
const del = await fetch(`${supabaseUrl}/rest/v1/call_rates?imported_at=lt.${encodeURIComponent(importedAt)}`, {
  method: "DELETE",
  headers: { ...headers, Prefer: "return=minimal,count=exact" },
});
if (!del.ok) {
  console.error(`Removing old rates failed (${del.status}): ${(await del.text()).slice(0, 300)}`);
  process.exit(1);
}
const removed = (del.headers.get("content-range") || "").split("/")[1] || "0";
console.log(`Done: ${all.length} rates loaded, ${removed} outdated rates removed.`);
