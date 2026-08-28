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
  companiesBySlug: {},
  founders: [],
  syncedAt: "",
};

function $(id) {
  return document.getElementById(id);
}

function formatSynced(iso) {
  if (!iso) return "–";
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

function companyForFounder(founder) {
  return state.companiesBySlug[founder.yc_company_slug] || null;
}

function nil() {
  return `<span class="nil" aria-hidden="true">–</span>`;
}

function displayText(value) {
  const text = (value || "").trim();
  if (!text || /^\.+$/.test(text) || text === "—" || text === "–") return "";
  return text;
}

function companyMission(company) {
  return (
    displayText(company?.long_description) ||
    displayText(company?.one_liner)
  );
}

function missionCell(text) {
  const mission = displayText(text);
  if (!mission) return nil();
  return `<div class="mission-text" title="${escapeHtml(mission)}">${escapeHtml(mission)}</div>`;
}

function industryCell(industry) {
  const value = displayText(industry);
  if (!value) return nil();
  return `<span class="industry-tag">${escapeHtml(value)}</span>`;
}

function roleCell(founder) {
  const role = displayText(founder.current_headline) || displayText(founder.yc_founder_bio);
  if (!role) return nil();
  return escapeHtml(role);
}

function companyCell(founder) {
  const name = escapeHtml(founder.yc_company);
  const linked = founder.yc_url
    ? `<a href="${escapeHtml(founder.yc_url)}" target="_blank" rel="noreferrer">${name}</a>`
    : name;
  const batch = displayText(founder.yc_batch);
  if (!batch) return linked;
  return `<div class="company-stack">${linked}<div class="batch-under">${escapeHtml(batch)}</div></div>`;
}

function matchesRow(founder, query, batch, industry, linkedin) {
  if (batch && founder.yc_batch !== batch) return false;
  if (linkedin === "yes" && !founder.linkedin_url) return false;
  if (linkedin === "no" && founder.linkedin_url) return false;
  const company = companyForFounder(founder);
  if (industry && company?.industry !== industry) return false;
  if (!query) return true;
  const haystack = [
    founder.full_name,
    founder.yc_company,
    founder.yc_batch,
    founder.current_headline,
    founder.yc_founder_bio,
    founder.yc_title,
    company?.one_liner,
    company?.long_description,
    company?.industry,
    company?.all_locations,
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

function groupFounders(founders) {
  const groups = new Map();
  for (const founder of founders) {
    const key = founder.yc_company_slug || founder.yc_company || founder.full_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(founder);
  }

  return [...groups.values()].sort((a, b) => {
    const a0 = a[0];
    const b0 = b[0];
    const batchDiff =
      (BATCH_ORDER.indexOf(a0.yc_batch) === -1 ? 999 : BATCH_ORDER.indexOf(a0.yc_batch)) -
      (BATCH_ORDER.indexOf(b0.yc_batch) === -1 ? 999 : BATCH_ORDER.indexOf(b0.yc_batch));
    if (batchDiff !== 0) return batchDiff;
    return (a0.yc_company || "").localeCompare(b0.yc_company || "");
  });
}

function render() {
  const query = $("q").value.trim().toLowerCase();
  const batch = $("batch").value;
  const industry = $("industry").value;
  const linkedin = $("linkedin").value;
  const rows = state.founders.filter((founder) =>
    matchesRow(founder, query, batch, industry, linkedin),
  );
  const groups = groupFounders(rows);

  $("result-meta").textContent = `${rows.length} of ${state.founders.length} founders · ${groups.length} companies`;
  $("empty").hidden = rows.length > 0;

  $("rows").innerHTML = groups
    .map((founders) => {
      const lead = founders[0];
      const company = companyForFounder(lead);
      const span = founders.length;
      return founders
        .map((founder, index) => {
          const shared =
            index === 0
              ? `<td class="company group-start" rowspan="${span}">${companyCell(lead)}</td>`
              : "";
          const mission =
            index === 0
              ? `<td class="mission group-start" rowspan="${span}">${missionCell(companyMission(company))}</td>`
              : "";
          const industryTd =
            index === 0
              ? `<td class="industry group-start" rowspan="${span}">${industryCell(company?.industry)}</td>`
              : "";
          const rowClass = [
            index === 0 ? "company-group-start" : "company-group-cont",
            index === founders.length - 1 ? "company-group-end" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<tr class="${rowClass}">
            ${shared}
            <td class="founder">${founderNameCell(founder)}</td>
            ${mission}
            ${industryTd}
            <td class="role">${roleCell(founder)}</td>
          </tr>`;
        })
        .join("");
    })
    .join("");
}

async function boot() {
  const [companiesRes, foundersRes] = await Promise.all([
    fetch("../data/companies.json"),
    fetch("../data/founders.json"),
  ]);

  if (!companiesRes.ok) {
    $("result-meta").textContent =
      "Could not load data/companies.json. Serve the repo root with python3 -m http.server and open /site/.";
    return;
  }

  const companiesPayload = await companiesRes.json();
  state.companies = companiesPayload.companies || [];
  state.companiesBySlug = Object.fromEntries(
    state.companies.filter((company) => company.slug).map((company) => [company.slug, company]),
  );
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

  fillSelect($("batch"), uniqueSorted(state.founders.map((f) => f.yc_batch), BATCH_ORDER), "All batches");
  fillSelect(
    $("industry"),
    uniqueSorted(state.companies.map((company) => company.industry)),
    "All industries",
  );

  $("q").addEventListener("input", render);
  $("batch").addEventListener("change", render);
  $("industry").addEventListener("change", render);
  $("linkedin").addEventListener("change", render);

  render();
}

boot();
