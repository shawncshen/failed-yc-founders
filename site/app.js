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
  founders: [],
  syncedAt: "",
  view: "founders",
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function matchesCompany(company, query, batch, industry) {
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

function matchesFounder(founder, query, batch, linkedin) {
  if (batch && founder.yc_batch !== batch) return false;
  if (linkedin === "yes" && !founder.linkedin_url) return false;
  if (linkedin === "no" && founder.linkedin_url) return false;
  if (!query) return true;
  const haystack = [
    founder.full_name,
    founder.yc_company,
    founder.current_headline,
    founder.yc_founder_bio,
    founder.yc_title,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function founderNameCell(founder) {
  const name = escapeHtml(founder.full_name);
  if (founder.linkedin_url) {
    return `<a href="${escapeHtml(founder.linkedin_url)}" target="_blank" rel="noreferrer">${name}</a>`;
  }
  return `<span class="plain-name" title="No LinkedIn URL found">${name}</span>`;
}

function renderCompanies() {
  const query = $("q").value.trim().toLowerCase();
  const batch = $("batch").value;
  const industry = $("industry").value;
  const rows = state.companies.filter((company) => matchesCompany(company, query, batch, industry));

  $("result-meta").textContent = `${rows.length} of ${state.companies.length} companies`;
  $("empty").hidden = rows.length > 0;

  $("rows").innerHTML = rows
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

function renderFounders() {
  const query = $("fq").value.trim().toLowerCase();
  const batch = $("fbatch").value;
  const linkedin = $("flinkedin").value;
  const rows = state.founders.filter((founder) => matchesFounder(founder, query, batch, linkedin));

  $("fresult-meta").textContent = `${rows.length} of ${state.founders.length} founders`;
  $("fempty").hidden = rows.length > 0;

  $("frows").innerHTML = rows
    .map((founder) => {
      const company = founder.yc_url
        ? `<a href="${escapeHtml(founder.yc_url)}" target="_blank" rel="noreferrer">${escapeHtml(founder.yc_company)}</a>`
        : escapeHtml(founder.yc_company);
      const role = founder.current_headline || founder.yc_founder_bio || "—";
      return `<tr>
        <td class="founder">${founderNameCell(founder)}</td>
        <td class="company">${company}</td>
        <td class="batch">${escapeHtml(founder.yc_batch)}</td>
        <td class="blurb">${escapeHtml(role)}</td>
        <td class="match">${escapeHtml(founder.match_status || "")}</td>
      </tr>`;
    })
    .join("");
}

function setView(view) {
  state.view = view;
  $("panel-founders").hidden = view !== "founders";
  $("panel-companies").hidden = view !== "companies";
  $("tab-founders").classList.toggle("active", view === "founders");
  $("tab-companies").classList.toggle("active", view === "companies");
}

async function boot() {
  const [companiesRes, foundersRes] = await Promise.all([
    fetch("../data/companies.json"),
    fetch("../data/founders.json"),
  ]);

  if (!companiesRes.ok) {
    $("fresult-meta").textContent =
      "Could not load data/companies.json. Serve the repo root with python3 -m http.server and open /site/.";
    return;
  }

  const companiesPayload = await companiesRes.json();
  state.companies = companiesPayload.companies || [];
  state.syncedAt = companiesPayload.synced_at || "";

  if (foundersRes.ok) {
    const foundersPayload = await foundersRes.json();
    state.founders = foundersPayload.founders || [];
  }

  const withLinkedin = state.founders.filter((founder) => founder.linkedin_url).length;
  $("stat-count").textContent = String(companiesPayload.count ?? state.companies.length);
  $("stat-founders").textContent = String(state.founders.length);
  $("stat-linkedin").textContent = String(withLinkedin);
  $("stat-synced").textContent = formatSynced(state.syncedAt);

  fillSelect($("batch"), uniqueSorted(state.companies.map((c) => c.batch), BATCH_ORDER), "All batches");
  fillSelect($("industry"), uniqueSorted(state.companies.map((c) => c.industry)), "All industries");
  fillSelect($("fbatch"), uniqueSorted(state.founders.map((f) => f.yc_batch), BATCH_ORDER), "All batches");

  $("q").addEventListener("input", renderCompanies);
  $("batch").addEventListener("change", renderCompanies);
  $("industry").addEventListener("change", renderCompanies);
  $("fq").addEventListener("input", renderFounders);
  $("fbatch").addEventListener("change", renderFounders);
  $("flinkedin").addEventListener("change", renderFounders);
  $("tab-founders").addEventListener("click", () => setView("founders"));
  $("tab-companies").addEventListener("click", () => setView("companies"));

  renderCompanies();
  renderFounders();
  setView("founders");
}

boot();
