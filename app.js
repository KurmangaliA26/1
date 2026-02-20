// ===== Budget App (YNAB-like) - app.js (FULL REPLACE) =====
const $ = (id) => document.getElementById(id);

const STATE_KEY = "budgetApp_v2";

const formatKZT = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString("ru-RU") + " ₸";
};

const todayISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const getMonthKey = (ym) => ym || new Date().toISOString().slice(0, 7);

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

function load() {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return { months: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { months: {} };
    if (!parsed.months) parsed.months = {};
    return parsed;
  } catch {
    return { months: {} };
  }
}

function save(data) {
  localStorage.setItem(STATE_KEY, JSON.stringify(data));
}

function ensureMonth(data, monthKey) {
  if (!data.months[monthKey]) {
    data.months[monthKey] = {
      income: 0,
      categories: [], // {id, name, assigned, activity, goal, goalDate}
      transactions: [], // {id, date, type, amount, categoryId, note}
    };
  }
}

function calcToAssign(month) {
  const assignedSum = month.categories.reduce((s, c) => s + (Number(c.assigned) || 0), 0);
  return (Number(month.income) || 0) - assignedSum;
}

function availableForCategory(cat) {
  // activity is negative for expenses
  return (Number(cat.assigned) || 0) + (Number(cat.activity) || 0);
}

function goalText(cat) {
  const g = Number(cat.goal || 0);
  const d = cat.goalDate ? cat.goalDate : "";
  if (!g && !d) return "-";
  if (g && d) return `${formatKZT(g)} до ${d}`;
  if (g) return `${formatKZT(g)}`;
  return `до ${d}`;
}

// ===== CSV parsing (supports , or ; and quoted fields) =====
function detectDelimiter(line) {
  const commas = (line.match(/,/g) || []).length;
  const semis = (line.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function parseCsvLine(line, delim) {
  // Handles quotes: "a,b" or "a; b"
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // escaped quote
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delim) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase();
}

function sanitizeType(t) {
  const v = String(t || "").trim().toLowerCase();
  if (v === "income" || v === "доход") return "income";
  if (v === "expense" || v === "расход") return "expense";
  return "";
}

function parseAmount(a) {
  // supports "12 000", "12,5" etc.
  const s = String(a || "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

// ===== App State =====
let data = load();
let currentMonthKey = getMonthKey();

// ===== UI Helpers =====
function setMonthInput() {
  $("month").value = currentMonthKey;
}

function syncTxCategoryEnabled() {
  const isIncome = $("txType").value === "income";
  $("txCategory").disabled = isIncome;
}

function rebuildSelects(month) {
  const cats = month.categories;

  const assignSelect = $("assignCatSelect");
  const txCat = $("txCategory");

  assignSelect.innerHTML = "";
  txCat.innerHTML = "";

  if (cats.length === 0) {
    const o1 = document.createElement("option");
    o1.value = "";
    o1.textContent = "Нет категорий";
    assignSelect.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = "";
    o2.textContent = "Нет категорий";
    txCat.appendChild(o2);
  } else {
    for (const c of cats) {
      const o1 = document.createElement("option");
      o1.value = c.id;
      o1.textContent = c.name;
      assignSelect.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = c.id;
      o2.textContent = c.name;
      txCat.appendChild(o2);
    }
  }
}

function render() {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  $("incomeKpi").textContent = formatKZT(month.income);
  $("toAssignKpi").textContent = formatKZT(calcToAssign(month));

  rebuildSelects(month);
  syncTxCategoryEnabled();

  // ===== Categories table (mobile-friendly data-label) =====
  const catsBody = $("categoriesTable").querySelector("tbody");
  catsBody.innerHTML = "";

  for (const cat of month.categories) {
    const tr = document.createElement("tr");
    const avail = availableForCategory(cat);

    // goal hint
    let goalHint = "";
    const g = Number(cat.goal || 0);
    if (g) {
      const diff = g - avail;
      if (diff > 0) goalHint = ` (не хватает ${formatKZT(diff)})`;
      else goalHint = ` (цель выполнена)`;
    }

    tr.innerHTML = `
      <td data-label="Категория">${cat.name}</td>
      <td data-label="Назначено">${formatKZT(cat.assigned)}</td>
      <td data-label="Активность">${formatKZT(cat.activity)}</td>
      <td data-label="Доступно"><span class="pill">${formatKZT(avail)}</span></td>
      <td data-label="Цель">${goalText(cat)}${goalHint}</td>
      <td data-label="Действия">
        <div class="actions">
          <button data-act="delCat" data-id="${cat.id}">Удалить</button>
        </div>
      </td>
    `;
    catsBody.appendChild(tr);
  }

  // ===== Transactions table =====
  const txBody = $("txTable").querySelector("tbody");
  txBody.innerHTML = "";

  const txs = month.transactions
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  for (const tx of txs) {
    const tr = document.createElement("tr");
    const catName = tx.categoryId
      ? month.categories.find((c) => c.id === tx.categoryId)?.name || "-"
      : "-";

    tr.innerHTML = `
      <td data-label="Дата">${tx.date || ""}</td>
      <td data-label="Тип">${tx.type === "income" ? "Доход" : "Расход"}</td>
      <td data-label="Категория">${tx.type === "expense" ? catName : "-"}</td>
      <td data-label="Сумма">${formatKZT(tx.amount)}</td>
      <td data-label="Описание">${tx.note || ""}</td>
      <td data-label="Действия"><button data-act="delTx" data-id="${tx.id}">Удалить</button></td>
    `;
    txBody.appendChild(tr);
  }

  save(data);
}

// ===== Actions =====
function addIncome(amount) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  const val = Number(amount || 0);
  if (val <= 0) return alert("Введите сумму дохода > 0");

  month.income = Number(month.income || 0) + val;
  render();
}

function addCategory({ name, goal, goalDate }) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  const n = String(name || "").trim();
  if (!n) return alert("Введите название категории");

  month.categories.push({
    id: uid(),
    name: n,
    assigned: 0,
    activity: 0,
    goal: Number(goal) > 0 ? Number(goal) : 0,
    goalDate: goalDate || "",
  });

  render();
}

function assignToCategory(catId, amount) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  if (!catId) return alert("Сначала добавь категорию");

  const amt = Number(amount || 0);
  if (!Number.isFinite(amt) || amt === 0) return alert("Введите сумму (можно минус для снятия)");
  if (month.categories.length === 0) return alert("Сначала добавь категорию");

  const cat = month.categories.find((c) => c.id === catId);
  if (!cat) return alert("Категория не найдена");

  // positive: assign (limited by toAssign)
  if (amt > 0) {
    const toAssign = calcToAssign(month);
    if (amt > toAssign) return alert(`Нельзя назначить больше, чем осталось: ${formatKZT(toAssign)}`);
    cat.assigned = Number(cat.assigned || 0) + amt;
    render();
    return;
  }

  // negative: unassign, but do not go below what is already spent
  const newAssigned = Number(cat.assigned || 0) + amt; // amt negative
  if (newAssigned < 0) return alert("Нельзя снять больше, чем назначено");

  const newAvail = newAssigned + Number(cat.activity || 0);
  if (newAvail < 0) return alert("Нельзя снять: в категории уже есть расходы (доступно станет < 0)");

  cat.assigned = newAssigned;
  render();
}

function addTransaction({ type, amount, categoryId, note, date }) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  const t = String(type || "").trim();
  const amt = Number(amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) return alert("Сумма должна быть > 0");

  const d = date || todayISO();
  if (!isISODate(d)) return alert("Неверная дата. Формат: YYYY-MM-DD");

  if (t === "income") {
    month.income = Number(month.income || 0) + amt;
    month.transactions.push({
      id: uid(),
      date: d,
      type: "income",
      amount: amt,
      categoryId: "",
      note: String(note || "").trim(),
    });
    render();
    return;
  }

  // expense
  if (month.categories.length === 0) return alert("Сначала добавь категорию");
  if (!categoryId) return alert("Выберите категорию");

  const cat = month.categories.find((c) => c.id === categoryId);
  if (!cat) return alert("Категория не найдена");

  const avail = availableForCategory(cat);
  if (amt > avail) return alert(`Недостаточно в категории. Доступно: ${formatKZT(avail)}`);

  cat.activity = Number(cat.activity || 0) - amt;

  month.transactions.push({
    id: uid(),
    date: d,
    type: "expense",
    amount: amt,
    categoryId,
    note: String(note || "").trim(),
  });

  render();
}

function deleteTransaction(txId) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  const tx = month.transactions.find((t) => t.id === txId);
  if (!tx) return;

  // rollback effects
  if (tx.type === "expense") {
    const cat = month.categories.find((c) => c.id === tx.categoryId);
    if (cat) {
      cat.activity = Number(cat.activity || 0) + Number(tx.amount || 0);
    }
  } else if (tx.type === "income") {
    month.income = Number(month.income || 0) - Number(tx.amount || 0);
    // if income removal makes toAssign negative, warn user but still allow (user can fix by unassign)
  }

  month.transactions = month.transactions.filter((t) => t.id !== txId);
  render();
}

function deleteCategory(catId) {
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  const cat = month.categories.find((c) => c.id === catId);
  if (!cat) return;

  const hasTx = month.transactions.some((t) => t.categoryId === catId);
  if (hasTx) return alert("Нельзя удалить категорию: есть транзакции. Сначала удалите транзакции.");

  if (Number(cat.assigned || 0) !== 0 || Number(cat.activity || 0) !== 0) {
    return alert("Нельзя удалить категорию с назначенными/активностью. Сначала обнулите назначения/расходы.");
  }

  month.categories = month.categories.filter((c) => c.id !== catId);
  render();
}

async function importCSV(file) {
  if (!file) return alert("Выберите CSV файл");

  const text = await file.text();
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length < 2) return alert("CSV пустой");

  const delim = detectDelimiter(rawLines[0]);

  const headerCols = parseCsvLine(rawLines[0], delim).map(normalizeHeader);
  const idx = {
    date: headerCols.indexOf("date"),
    type: headerCols.indexOf("type"),
    amount: headerCols.indexOf("amount"),
    category: headerCols.indexOf("category"),
    note: headerCols.indexOf("note"),
  };

  if (Object.values(idx).some((v) => v === -1)) {
    return alert("Нужны колонки: date,type,amount,category,note");
  }

  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < rawLines.length; i++) {
    const cols = parseCsvLine(rawLines[i], delim);
    const date = (cols[idx.date] || "").trim();
    const type = sanitizeType(cols[idx.type]);
    const amount = parseAmount(cols[idx.amount]);
    const categoryName = (cols[idx.category] || "").trim();
    const note = (cols[idx.note] || "").trim();

    if (!type || amount <= 0 || !isISODate(date)) {
      skipped++;
      continue;
    }

    if (type === "income") {
      month.income = Number(month.income || 0) + amount;
      month.transactions.push({
        id: uid(),
        date,
        type: "income",
        amount,
        categoryId: "",
        note,
      });
      imported++;
      continue;
    }

    // expense: find or create category
    let cat = month.categories.find(
      (c) => c.name.trim().toLowerCase() === (categoryName || "Без категории").trim().toLowerCase()
    );
    if (!cat) {
      cat = {
        id: uid(),
        name: categoryName || "Без категории",
        assigned: 0,
        activity: 0,
        goal: 0,
        goalDate: "",
      };
      month.categories.push(cat);
    }

    // If not enough available, auto-assign from toAssign if possible
    let avail = availableForCategory(cat);
    if (amount > avail) {
      const need = amount - avail;
      const toAssign = calcToAssign(month);
      if (need <= toAssign) {
        cat.assigned = Number(cat.assigned || 0) + need;
        avail = availableForCategory(cat);
      }
    }

    if (amount > avail) {
      // still not enough
      skipped++;
      continue;
    }

    cat.activity = Number(cat.activity || 0) - amount;
    month.transactions.push({
      id: uid(),
      date,
      type: "expense",
      amount,
      categoryId: cat.id,
      note,
    });
    imported++;
  }

  render();
  alert(`Импортировано: ${imported}\nПропущено: ${skipped}`);
}

// ===== Wiring =====
function wire() {
  // Month
  $("month").addEventListener("change", (e) => {
    currentMonthKey = getMonthKey(e.target.value);
    ensureMonth(data, currentMonthKey);
    render();
  });

  // Income quick add
  $("addIncomeBtn").addEventListener("click", () => {
    const v = Number($("incomeAmount").value || 0);
    addIncome(v);
    $("incomeAmount").value = "";
  });

  // Add category
  $("addCategoryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    addCategory({
      name: $("catName").value,
      goal: $("catGoal").value,
      goalDate: $("catGoalDate").value,
    });
    $("catName").value = "";
    $("catGoal").value = "";
    $("catGoalDate").value = "";
  });

  // Assign
  $("assignBtn").addEventListener("click", () => {
    const catId = $("assignCatSelect").value;
    const amt = Number($("assignAmount").value || 0);
    assignToCategory(catId, amt);
    $("assignAmount").value = "";
  });

  // Tx type select
  $("txType").addEventListener("change", syncTxCategoryEnabled);

  // Add transaction
  $("txDate").value = todayISO();
  $("txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    addTransaction({
      type: $("txType").value,
      categoryId: $("txCategory").value,
      amount: Number($("txAmount").value || 0),
      note: $("txNote").value,
      date: $("txDate").value,
    });
    $("txAmount").value = "";
    $("txNote").value = "";
  });

  // Delete category
  $("categoriesTable").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === "delCat") deleteCategory(id);
  });

  // Delete tx
  $("txTable").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === "delTx") deleteTransaction(id);
  });

  // CSV import
  $("importBtn").addEventListener("click", async () => {
    const file = $("csvFile").files?.[0];
    await importCSV(file);
    $("csvFile").value = "";
  });

  // Reset
  $("resetBtn").addEventListener("click", () => {
    const ok = confirm("Точно удалить все данные?");
    if (!ok) return;
    localStorage.removeItem(STATE_KEY);
    data = load();
    ensureMonth(data, currentMonthKey);
    render();
  });
}

// ===== Init =====
(function init() {
  currentMonthKey = getMonthKey();
  setMonthInput();

  ensureMonth(data, currentMonthKey);
  wire();
  render();
})();