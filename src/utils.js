export function required(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
  if (missing.length) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

export function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}
