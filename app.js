const $ = (id) => document.getElementById(id);

const stateKey = "budgetApp_v1";

function formatKZT(n){
  const num = Number(n || 0);
  return num.toLocaleString("ru-RU") + " ₸";
}

function todayISO(){
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function getMonthKey(ym){
  // ym: "2026-02"
  return ym || new Date().toISOString().slice(0,7);
}

function load(){
  const raw = localStorage.getItem(stateKey);
  if(!raw) return { months: {} };
  try { return JSON.parse(raw); }
  catch { return { months: {} }; }
}

function save(data){
  localStorage.setItem(stateKey, JSON.stringify(data));
}

function ensureMonth(data, monthKey){
  if(!data.months[monthKey]){
    data.months[monthKey] = {
      income: 0,
      categories: [], // {id, name, assigned, activity, goal, goalDate}
      transactions: [] // {id, date, type, amount, categoryId, note}
    };
  }
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function calcToAssign(month){
  const assignedSum = month.categories.reduce((s,c)=>s + (Number(c.assigned)||0), 0);
  return (Number(month.income)||0) - assignedSum;
}

function availableForCategory(cat){
  return (Number(cat.assigned)||0) + (Number(cat.activity)||0); // activity отрицательное для расходов
}

function goalText(cat){
  const g = Number(cat.goal || 0);
  const d = cat.goalDate ? cat.goalDate : "";
  if(!g && !d) return "-";
  if(g && d) return `${formatKZT(g)} до ${d}`;
  if(g) return `${formatKZT(g)}`;
  return `до ${d}`;
}

let data = load();
let currentMonthKey = getMonthKey();

function render(){
  ensureMonth(data, currentMonthKey);
  const month = data.months[currentMonthKey];

  $("incomeKpi").textContent = formatKZT(month.income);
  $("toAssignKpi").textContent = formatKZT(calcToAssign(month));

  // selects
  const cats = month.categories;
  const assignSelect = $("assignCatSelect");
  const txCat = $("txCategory");
  assignSelect.innerHTML = "";
  txCat.innerHTML = "";

  if(cats.length === 0){
    const opt1 = document.createElement("option");
    opt1.value = "";
    opt1.textContent = "Нет категорий";
    assignSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = "";
    opt2.textContent = "Нет категорий";
    txCat.appendChild(opt2);
  } else {
    cats.forEach(c=>{
      const o1 = document.createElement("option");
      o1.value = c.id;
      o1.textContent = c.name;
      assignSelect.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = c.id;
      o2.textContent = c.name;
      txCat.appendChild(o2);
    });
  }

  // categories table
  const tbody = $("categoriesTable").querySelector("tbody");
  tbody.innerHTML = "";
  cats.forEach(cat=>{
    const tr = document.createElement("tr");
    const avail = availableForCategory(cat);

    // simple goal hint
    let goalHint = "";
    const g = Number(cat.goal || 0);
    if(g){
      const diff = g - avail;
      if(diff > 0) goalHint = ` (не хватает ${formatKZT(diff)})`;
      else goalHint = ` (цель выполнена)`;
    }

    tr.innerHTML = `
      <td>${cat.name}</td>
      <td>${formatKZT(cat.assigned)}</td>
      <td>${formatKZT(cat.activity)}</td>
      <td><span class="pill">${formatKZT(avail)}</span></td>
      <td>${goalText(cat)}${goalHint}</td>
      <td>
        <div class="actions">
          <button data-act="delCat" data-id="${cat.id}">Удалить</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // tx table
  const txBody = $("txTable").querySelector("tbody");
  txBody.innerHTML = "";
  const txs = month.transactions.slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));

  txs.forEach(tx=>{
    const tr = document.createElement("tr");
    const catName = tx.categoryId ? (cats.find(c=>c.id===tx.categoryId)?.name || "-") : "-";
    tr.innerHTML = `
      <td>${tx.date || ""}</td>
      <td>${tx.type === "income" ? "Доход" : "Расход"}</td>
      <td>${tx.type === "expense" ? catName : "-"}</td>
      <td>${formatKZT(tx.amount)}</td>
      <td>${tx.note || ""}</td>
      <td><button data-act="delTx" data-id="${tx.id}">Удалить</button></td>
    `;
    txBody.appendChild(tr);
  });

  save(data);
}

function setMonthInput(){
  $("month").value = currentMonthKey;
}

function wire(){
  // month change
  $("month").addEventListener("change", (e)=>{
    currentMonthKey = getMonthKey(e.target.value);
    ensureMonth(data, currentMonthKey);
    render();
  });

  // add income
  $("addIncomeBtn").addEventListener("click", ()=>{
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey];
    const val = Number($("incomeAmount").value || 0);
    if(val <= 0) return alert("Введите сумму дохода > 0");
    month.income = Number(month.income||0) + val;
    $("incomeAmount").value = "";
    render();
  });

  // add category
  $("addCategoryForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey];

    const name = $("catName").value.trim();
    const goal = Number($("catGoal").value || 0);
    const goalDate = $("catGoalDate").value || "";

    if(!name) return alert("Введите название категории");

    month.categories.push({
      id: uid(),
      name,
      assigned: 0,
      activity: 0,
      goal: goal > 0 ? goal : 0,
      goalDate: goalDate || ""
    });

    $("catName").value = "";
    $("catGoal").value = "";
    $("catGoalDate").value = "";
    render();
  });

  // assign to category
  $("assignBtn").addEventListener("click", ()=>{
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey);

    const catId = $("assignCatSelect").value;
    const amt = Number($("assignAmount").value || 0);
    if(!catId) return alert("Сначала добавь категорию");
    if(amt <= 0) return alert("Введите сумму > 0");

    const toAssign = calcToAssign(month);
    if(amt > toAssign) return alert(`Нельзя назначить больше, чем осталось: ${formatKZT(toAssign)}`);

    const cat = month.categories.find(c=>c.id===catId);
    cat.assigned = Number(cat.assigned||0) + amt;

    $("assignAmount").value = "";
    render();
  });

  // add transaction
  $("txDate").value = todayISO();
  $("txForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey);

    const type = $("txType").value;
    const amount = Number($("txAmount").value || 0);
    const note = $("txNote").value.trim();
    const date = $("txDate").value;
    const categoryId = $("txCategory").value;

    if(amount <= 0) return alert("Сумма должна быть > 0");

    if(type === "expense"){
      if(!categoryId) return alert("Выберите категорию");
      const cat = month.categories.find(c=>c.id===categoryId);
      const avail = availableForCategory(cat);
      if(amount > avail) return alert(`Недостаточно в категории. Доступно: ${formatKZT(avail)}`);

      // activity decreases
      cat.activity = Number(cat.activity||0) - amount;
      month.transactions.push({ id: uid(), date, type, amount, categoryId, note });
    } else {
      // income adds to monthly income (you'll still need to assign it)
      month.income = Number(month.income||0) + amount;
      month.transactions.push({ id: uid(), date, type, amount, categoryId: "", note });
    }

    $("txAmount").value = "";
    $("txNote").value = "";
    render();
  });

  // table actions
  $("categoriesTable").addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey];

    if(act === "delCat"){
      const cat = month.categories.find(c=>c.id===id);
      if(!cat) return;

      // forbid deleting if has activity or assigned or transactions reference
      const hasTx = month.transactions.some(t=>t.categoryId===id);
      if(hasTx) return alert("Нельзя удалить категорию: есть транзакции. Сначала удалите транзакции.");

      if(Number(cat.assigned||0)!==0 || Number(cat.activity||0)!==0){
        return alert("Нельзя удалить категорию с назначенными/активностью. Сначала обнулите назначения/расходы.");
      }
      month.categories = month.categories.filter(c=>c.id!==id);
      render();
    }
  });

  $("txTable").addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey];

    if(act === "delTx"){
      const tx = month.transactions.find(t=>t.id===id);
      if(!tx) return;

      // rollback effects
      if(tx.type === "expense"){
        const cat = month.categories.find(c=>c.id===tx.categoryId);
        if(cat){
          cat.activity = Number(cat.activity||0) + Number(tx.amount||0); // undo expense
        }
      } else if(tx.type === "income"){
        month.income = Number(month.income||0) - Number(tx.amount||0);
      }

      month.transactions = month.transactions.filter(t=>t.id!==id);
      render();
    }
  });

  // import CSV
  $("importBtn").addEventListener("click", async ()=>{
    const file = $("csvFile").files?.[0];
    if(!file) return alert("Выберите CSV файл");

    const text = await file.text();
    // expected headers or raw: date,type,amount,category,note
    // type: expense|income
    const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
    if(lines.length < 2) return alert("CSV пустой");

    const header = lines[0].split(",").map(s=>s.trim().toLowerCase());
    const idx = {
      date: header.indexOf("date"),
      type: header.indexOf("type"),
      amount: header.indexOf("amount"),
      category: header.indexOf("category"),
      note: header.indexOf("note")
    };
    const anyMissing = Object.values(idx).some(v=>v === -1);
    if(anyMissing){
      return alert("Нужны колонки: date,type,amount,category,note");
    }

    ensureMonth(data, currentMonthKey);
    const month = data.months[currentMonthKey];

    let imported = 0;
    for(let i=1;i<lines.length;i++){
      const cols = lines[i].split(",").map(s=>s.trim());
      const date = cols[idx.date];
      const type = cols[idx.type];
      const amount = Number(cols[idx.amount] || 0);
      const categoryName = cols[idx.category];
      const note = cols[idx.note];

      if(!date || !type || amount <= 0) continue;

      if(type === "income"){
        month.income = Number(month.income||0) + amount;
        month.transactions.push({ id: uid(), date, type, amount, categoryId:"", note });
        imported++;
        continue;
      }

      // expense: find or create category
      let cat = month.categories.find(c=>c.name.toLowerCase() === (categoryName||"").toLowerCase());
      if(!cat){
        cat = { id: uid(), name: categoryName || "Без категории", assigned:0, activity:0, goal:0, goalDate:"" };
        month.categories.push(cat);
      }

      // if not enough available, auto-assign from toAssign to cover
      const avail = availableForCategory(cat);
      if(amount > avail){
        const need = amount - avail;
        const toAssign = calcToAssign(month);
        if(need <= toAssign){
          cat.assigned = Number(cat.assigned||0) + need;
        }
      }

      // if still not enough, skip
      if(amount > availableForCategory(cat)) continue;

      cat.activity = Number(cat.activity||0) - amount;
      month.transactions.push({ id: uid(), date, type:"expense", amount, categoryId: cat.id, note });
      imported++;
    }

    $("csvFile").value = "";
    render();
    alert(`Импортировано: ${imported}`);
  });

  // reset
  $("resetBtn").addEventListener("click", ()=>{
    const ok = confirm("Точно удалить все данные?");
    if(!ok) return;
    localStorage.removeItem(stateKey);
    data = load();
    ensureMonth(data, currentMonthKey);
    render();
  });

  // txType change: disable category if income
  $("txType").addEventListener("change", ()=>{
    const isIncome = $("txType").value === "income";
    $("txCategory").disabled = isIncome;
  });
}

(function init(){
  currentMonthKey = getMonthKey();
  $("month").value = currentMonthKey;
  ensureMonth(data, currentMonthKey);
  wire();
  setMonthInput();
  render();
})();