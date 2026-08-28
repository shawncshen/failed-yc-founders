const BATCH_ORDER = [
  "Winter 2020",
  "Summer 2020",
  "Winter 2021",
  "Summer 2021",
  "Winter 2022",
  "Summer 2022",
  "Winter 2023",
  "Summer 2023",
  "Winter 2024",
  "Summer 2024",
  "Fall 2024",
  "Winter 2025",
  "Spring 2025",
  "Summer 2025",
  "Fall 2025",
  "Winter 2026",
];

const state = {
  companies: [],
  syncedAt: "",
};

function $(id) {
  return document.getElementById(id);
}

function formatSynced(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function uniqueSorted(values, order) {
  const set = [...new Set(values.filter(Boolean))];
  if (!order) {
    return set.sort((a, b) => a.localeCompare(b));
  }
  return set.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });
}

function fillSelect(select, values, blankLabel) {
  const current = select.value;
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = blankLabel;
  select.appendChild(blank);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function matches(company, query, batch, industry) {
  if (batch && company.batch !== batch) return false;
  if (industry && company.industry !== industry) return false;
  if (!query) return true;
  const haystack = [
    company.name,
    company.one_liner,
    company.all_locations,
    company.slug,
    ...(company.tags || []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const query = $("q").value.trim().toLowerCase();
  const batch = $("batch").value;
  const industry = $("industry").value;
  const rows = state.companies.filter((company) => matches(company, query, batch, industry));

  $("result-meta").textContent = `${rows.length} of ${state.companies.length} companies`;
  $("empty").hidden = rows.length > 0;

  const body = $("rows");
  body.innerHTML = rows
    .map((company) => {
      const yc = company.url
        ? `<a href="${escapeHtml(company.url)}" target="_blank" rel="noreferrer">${escapeHtml(company.name)}</a>`
        : escapeHtml(company.name);
      return `<tr>
        <td class="company">${yc}</td>
        <td class="batch">${escapeHtml(company.batch)}</td>
        <td>${escapeHtml(company.industry)}</td>
        <td class="blurb">${escapeHtml(company.one_liner)}</td>
        <td class="blurb">${escapeHtml(company.all_locations)}</td>
      </tr>`;
    })
    .join("");
}

async function boot() {
  const response = await fetch("../data/companies.json");
  if (!response.ok) {
    $("result-meta").textContent =
      "Could not load data/companies.json. Serve the repo root with python3 -m http.server and open /site/.";
    return;
  }
  const payload = await response.json();
  state.companies = payload.companies || [];
  state.syncedAt = payload.synced_at || "";

  $("stat-count").textContent = String(payload.count ?? state.companies.length);
  $("stat-batches").textContent = String((payload.batches || []).length);
  $("stat-synced").textContent = formatSynced(state.syncedAt);

  fillSelect($("batch"), uniqueSorted(state.companies.map((c) => c.batch), BATCH_ORDER), "All batches");
  fillSelect($("industry"), uniqueSorted(state.companies.map((c) => c.industry)), "All industries");

  $("q").addEventListener("input", render);
  $("batch").addEventListener("change", render);
  $("industry").addEventListener("change", render);
  render();
}

boot();
