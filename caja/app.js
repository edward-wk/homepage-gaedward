/** Rutas locales (carpeta images/) — funcionan sin internet */
const IMG = (file) => new URL(`images/${file}`, document.baseURI).href;

/** Denominaciones del euro (céntimos) */
const DENOMINATIONS = [
  { cents: 1, label: "1 c", type: "coin", image: IMG("1c.svg") },
  { cents: 2, label: "2 c", type: "coin", image: IMG("2c.svg") },
  { cents: 5, label: "5 c", type: "coin", image: IMG("5c.svg") },
  { cents: 10, label: "10 c", type: "coin", image: IMG("10c.svg") },
  { cents: 20, label: "20 c", type: "coin", image: IMG("20c.svg") },
  { cents: 50, label: "50 c", type: "coin", image: IMG("50c.svg") },
  { cents: 100, label: "1 €", type: "coin", image: IMG("1e.svg") },
  { cents: 200, label: "2 €", type: "coin", image: IMG("2e.svg") },
  {
    cents: 500,
    label: "5 €",
    type: "note",
    noteClass: "note-5",
    image: IMG("5e.svg"),
  },
  {
    cents: 1000,
    label: "10 €",
    type: "note",
    noteClass: "note-10",
    image: IMG("10e.svg"),
  },
  {
    cents: 2000,
    label: "20 €",
    type: "note",
    noteClass: "note-20",
    image: IMG("20e.svg"),
  },
  {
    cents: 5000,
    label: "50 €",
    type: "note",
    noteClass: "note-50",
    image: IMG("50e.svg"),
  },
  {
    cents: 10000,
    label: "100 €",
    type: "note",
    noteClass: "note-100",
    image: IMG("100e.svg"),
  },
  {
    cents: 20000,
    label: "200 €",
    type: "note",
    noteClass: "note-200",
    image: IMG("200e.svg"),
  },
  {
    cents: 50000,
    label: "500 €",
    type: "note",
    noteClass: "note-500",
    image: IMG("500e.svg"),
  },
];

const COINS = DENOMINATIONS.filter((d) => d.type === "coin");
const NOTES = DENOMINATIONS.filter((d) => d.type === "note");

const state = {
  purchaseCents: 0,
  customerCents: 0,
  changeDueCents: 0,
  given: [],
  startedAt: null,
  solved: false,
  changeRevealed: false,
  transactionReady: false,
  stats: loadStats(),
};

const $ = (id) => document.getElementById(id);

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem("cajaStats")) || {
      correct: 0,
      streak: 0,
      times: [],
    };
  } catch {
    return { correct: 0, streak: 0, times: [] };
  }
}

function saveStats() {
  localStorage.setItem("cajaStats", JSON.stringify(state.stats));
}

function formatEuro(cents) {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseEuroInput(raw) {
  const trimmed = String(raw).trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(parseFloat(normalized) * 100);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function centsToInput(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function setTransactionHint(message, isError = false) {
  const hint = $("ticket-hint");
  hint.textContent = message;
  hint.classList.toggle("error", isError);
}

function setChangeRevealed(revealed) {
  state.changeRevealed = revealed;
  const dueEl = $("change-due");
  const row = $("change-due-row");
  if (revealed) {
    dueEl.textContent = formatEuro(state.changeDueCents);
    dueEl.classList.remove("hidden-value");
    dueEl.removeAttribute("aria-hidden");
    row.classList.add("revealed");
  } else {
    dueEl.textContent = "?";
    dueEl.classList.add("hidden-value");
    dueEl.setAttribute("aria-hidden", "true");
    row.classList.remove("revealed");
  }
}

/** Compra en euros enteros (exacta) o con céntimos ,05 */
function randomPurchaseCents() {
  const euros = randomInt(1, 85);
  const cents = randomInt(0, 1) === 0 ? 0 : 5;
  return euros * 100 + cents;
}

/** Desglose greedy de un importe en monedas/billetes */
function breakdown(cents) {
  const result = [];
  let left = cents;
  const sorted = [...DENOMINATIONS].sort((a, b) => b.cents - a.cents);
  for (const d of sorted) {
    while (left >= d.cents) {
      result.push(d);
      left -= d.cents;
    }
  }
  return result;
}

/** Agrupa desglose para mostrar "2× 20 €" */
function summarize(items) {
  const map = new Map();
  for (const d of items) {
    map.set(d.cents, (map.get(d.cents) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cents, count]) => {
      const d = DENOMINATIONS.find((x) => x.cents === cents);
      return { label: d.label, count };
    });
}

function renderBreakdownList(el, items) {
  el.innerHTML = "";
  if (!items.length) return;
  const summary = summarize(items);
  for (const { label, count } of summary) {
    const li = document.createElement("li");
    li.textContent = count > 1 ? `${count}× ${label}` : label;
    el.appendChild(li);
  }
}

const BILLS_CENTS = [500, 1000, 2000, 5000, 10000];

/**
 * Pagos habituales en efectivo: exacto, euro redondo de más, 5,50 en compras
 * pequeñas, o un billete de 5/10/20/50/100 €. Sin cantidades raras (54,25 €…).
 */
function getRealisticPaymentOptions(purchaseCents) {
  const options = new Set();

  options.add(purchaseCents);

  const nextEuro = Math.ceil(purchaseCents / 100) * 100;
  if (nextEuro > purchaseCents) options.add(nextEuro);

  const centsPart = purchaseCents % 100;
  if (purchaseCents < 1500 && centsPart === 30) {
    const halfEuro = Math.floor(purchaseCents / 100) * 100 + 50;
    if (halfEuro > purchaseCents) options.add(halfEuro);
  }

  const nextFive = Math.ceil(purchaseCents / 500) * 500;
  if (nextFive > purchaseCents) options.add(nextFive);

  for (const bill of BILLS_CENTS) {
    if (bill < purchaseCents) continue;
    if (bill === 500 && purchaseCents > 500) continue;
    if (bill === 10000 && purchaseCents < 4000) continue;
    options.add(bill);
  }

  return [...options];
}

function paymentOptionWeight(totalCents, purchaseCents) {
  const excess = totalCents - purchaseCents;
  if (excess === 0) return 3;

  if (BILLS_CENTS.includes(totalCents)) {
    if (excess <= 600) return 9;
    if (excess <= 1500) return 7;
    if (excess <= 3500) return 4;
    return 2;
  }

  if (totalCents % 100 === 0 && excess <= 100) return 10;
  if (totalCents % 50 === 0 && excess === 20) return 9;
  if (totalCents % 500 === 0) return 6;

  return 1;
}

function pickRandomCustomerPayment(purchaseCents) {
  const options = getRealisticPaymentOptions(purchaseCents);
  const pool = options.map((total) => ({
    total,
    weight: paymentOptionWeight(total, purchaseCents),
  }));
  let roll = randomInt(1, pool.reduce((s, o) => s + o.weight, 0));
  for (const { total, weight } of pool) {
    roll -= weight;
    if (roll <= 0) return total;
  }
  return pool[0].total;
}

function applyTransactionFromInputs() {
  const purchase = parseEuroInput($("purchase-input").value);
  const customer = parseEuroInput($("customer-input").value);

  if (purchase === null || customer === null) {
    setTransactionHint("Usa números como 54,05 o 10.50", true);
    state.transactionReady = false;
    return false;
  }

  if (customer < purchase) {
    setTransactionHint("El cliente debe pagar al menos la compra.", true);
    state.transactionReady = false;
    return false;
  }

  state.purchaseCents = purchase;
  state.customerCents = customer;
  state.changeDueCents = customer - purchase;
  state.given = [];
  state.startedAt = Date.now();
  state.solved = false;
  state.changeRevealed = false;
  state.transactionReady = true;

  setChangeRevealed(false);
  setTransactionHint(
    `Practica: saca cambio hasta llegar a ${formatEuro(customer)}.`
  );
  updateGivenUI();
  hideFeedback();
  document.querySelector(".your-change").classList.remove("correct", "wrong");
  return true;
}

function fillRandomExample() {
  const purchase = randomPurchaseCents();
  const customer = pickRandomCustomerPayment(purchase);
  $("purchase-input").value = centsToInput(purchase);
  $("customer-input").value = centsToInput(customer);
  applyTransactionFromInputs();
}

function resetPractice() {
  state.given = [];
  state.solved = false;
  state.changeRevealed = false;
  if (state.transactionReady) {
    state.startedAt = Date.now();
  }
  setChangeRevealed(false);
  updateGivenUI();
  hideFeedback();
  document.querySelector(".your-change").classList.remove("correct", "wrong");
}

function changePickedCents() {
  return state.given.reduce((s, d) => s + d.cents, 0);
}

/** Compra + monedas/billetes sacados de la caja */
function deliveredTotalCents() {
  return state.purchaseCents + changePickedCents();
}

function setPracticeLocked(locked) {
  $("denominations-section").classList.toggle("locked", locked);
  $("coins-section").classList.toggle("locked", locked);
  document.querySelectorAll(".denom-btn").forEach((btn) => {
    btn.disabled = locked;
  });
  $("btn-check").disabled = locked;
  $("btn-clear").disabled = locked;
  $("btn-undo").disabled = locked;
}

function updateGivenUI() {
  const picked = changePickedCents();
  const delivered = deliveredTotalCents();
  const target = state.customerCents;
  const remainingLabel = $("remaining-label");
  const formula = $("entregado-formula");

  setPracticeLocked(!state.transactionReady);

  $("given-total").textContent = formatEuro(
    state.transactionReady ? delivered : 0
  );

  if (!state.transactionReady) {
    formula.textContent = "Escribe compra y pago, luego Empezar";
    remainingLabel.className = "remaining";
    remainingLabel.textContent = "Los botones de caja se activan al empezar.";
    renderBreakdownList($("given-breakdown"), []);
    renderCashVisual(0);
    return;
  }

  formula.textContent = picked
    ? `${formatEuro(state.purchaseCents)} compra + ${formatEuro(picked)} cambio`
    : `${formatEuro(state.purchaseCents)} compra — saca el cambio`;

  if (state.solved) {
    remainingLabel.className = "remaining exact";
    remainingLabel.textContent = "Correcto: coincide con lo que pagó el cliente.";
  } else if (!state.changeRevealed) {
    if (picked === 0) {
      remainingLabel.className = "remaining";
      remainingLabel.textContent = "Pulsa monedas y billetes para sumar el cambio.";
    } else if (delivered < target) {
      remainingLabel.className = "remaining";
      remainingLabel.textContent = "Sigue sacando cambio de la caja…";
    } else if (delivered === target) {
      remainingLabel.className = "remaining exact";
      remainingLabel.innerHTML =
        "¡Coincide con el pago del cliente! Pulsa <strong>Comprobar</strong>.";
    } else {
      remainingLabel.className = "remaining over";
      remainingLabel.textContent = "Te has pasado — quita con Deshacer o Limpiar.";
    }
  } else {
    const changeDiff = state.changeDueCents - picked;
    if (changeDiff > 0) {
      remainingLabel.className = "remaining";
      remainingLabel.innerHTML = `En cambio te faltaron: <strong>${formatEuro(changeDiff)}</strong>`;
    } else if (changeDiff < 0) {
      remainingLabel.className = "remaining over";
      remainingLabel.innerHTML = `En cambio te sobraron: <strong>${formatEuro(-changeDiff)}</strong>`;
    } else {
      remainingLabel.className = "remaining exact";
      remainingLabel.textContent = "El cambio sacado fue exacto.";
    }
  }

  renderBreakdownList($("given-breakdown"), state.given);
  renderCashVisual(picked);

  if (!state.solved && !state.changeRevealed && picked > 0 && delivered === target) {
    checkAnswer(true);
  }
}

function renderCashVisual(pickedCents) {
  const stack = $("cash-visual-stack");
  const empty = $("cash-visual-empty");
  const totalEl = $("visual-change-total");

  totalEl.textContent = formatEuro(pickedCents);
  stack.innerHTML = "";

  if (!state.given.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  state.given.forEach((d, index) => {
    const piece = document.createElement("div");
    const isNew = index === state.given.length - 1;
    piece.className = `cash-piece ${d.type}${isNew ? " just-added" : ""}`;
    piece.style.setProperty("--index", index);
    piece.style.setProperty(
      "--rot",
      `${((index * 17) % 24) - 12}deg`
    );

    const img = document.createElement("img");
    img.src = d.image;
    img.alt = d.label;
    img.loading = "lazy";
    img.decoding = "async";

    const tag = document.createElement("span");
    tag.className = "cash-piece-label";
    tag.textContent = d.label;

    piece.appendChild(img);
    piece.appendChild(tag);
    stack.appendChild(piece);
  });
}

function addDenomination(d) {
  if (state.solved || !state.transactionReady) return;
  state.given.push(d);
  updateGivenUI();
}

function undoLast() {
  if (state.solved || !state.given.length) return;
  state.given.pop();
  updateGivenUI();
}

function clearGiven() {
  if (state.solved) return;
  state.given = [];
  if (!state.changeRevealed) hideFeedback();
  updateGivenUI();
}

function playSuccessSound() {
  if (!$("opt-sound").checked) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* sin audio */
  }
}

function showFeedback(ok, message, hintItems) {
  const fb = $("feedback");
  fb.hidden = false;
  fb.className = `feedback ${ok ? "success" : "error"}`;
  fb.innerHTML = message;
  if (!ok && hintItems && $("opt-hint").checked) {
    const ul = document.createElement("ul");
    ul.className = "hint-list";
    ul.innerHTML = "<li>Cambio óptimo sugerido:</li>";
    for (const { label, count } of summarize(hintItems)) {
      const li = document.createElement("li");
      li.textContent = count > 1 ? `${count}× ${label}` : label;
      ul.appendChild(li);
    }
    fb.appendChild(ul);
  }
}

function hideFeedback() {
  $("feedback").hidden = true;
}

function updateStatsBar(_ok, seconds) {
  $("stat-correct").textContent = state.stats.correct;
  $("stat-streak").textContent = state.stats.streak;
  if (seconds != null) {
    $("stat-time").textContent = seconds.toFixed(1);
    const avg =
      state.stats.times.reduce((a, b) => a + b, 0) / state.stats.times.length;
    $("stat-avg").textContent = avg.toFixed(1);
  }
}

function checkAnswer(auto = false) {
  if (state.solved || !state.transactionReady) return;

  const picked = changePickedCents();
  const delivered = deliveredTotalCents();

  if (picked === 0) {
    showFeedback(false, "Saca monedas o billetes de la caja para el cambio.");
    return;
  }

  setChangeRevealed(true);

  const due = state.changeDueCents;
  const elapsed = (Date.now() - state.startedAt) / 1000;
  const panel = document.querySelector(".your-change");

  if (delivered === state.customerCents) {
    state.solved = true;
    state.stats.correct += 1;
    state.stats.streak += 1;
    state.stats.times.push(elapsed);
    if (state.stats.times.length > 50) state.stats.times.shift();
    saveStats();
    updateStatsBar(true, elapsed);
    panel.classList.add("correct");
    panel.classList.remove("wrong");
    playSuccessSound();
    showFeedback(
      true,
      auto
        ? `¡Exacto! Cambio: ${formatEuro(due)} — ${elapsed.toFixed(1)} s`
        : `¡Correcto! Cambio: ${formatEuro(due)} — ${elapsed.toFixed(1)} s`
    );
    updateGivenUI();
  } else {
    state.stats.streak = 0;
    saveStats();
    updateStatsBar(false);
    panel.classList.add("wrong");
    panel.classList.remove("correct");
    const diff = due - picked;
    const msg =
      diff > 0
        ? `Debías devolver ${formatEuro(due)} de cambio. Te faltaron ${formatEuro(diff)}.`
        : `Debías devolver ${formatEuro(due)} de cambio. Te sobraron ${formatEuro(-diff)}.`;
    showFeedback(false, msg, breakdown(due));
    updateGivenUI();
  }
}

function buildDenomButtons() {
  const coinContainer = $("coin-buttons");
  const noteContainer = $("note-buttons");

  for (const d of COINS) {
    coinContainer.appendChild(createDenomButton(d));
  }
  for (const d of NOTES) {
    noteContainer.appendChild(createDenomButton(d));
  }
}

function createDenomButton(d) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `denom-btn ${d.type}${d.noteClass ? ` ${d.noteClass}` : ""}`;
  btn.innerHTML = `<img class="denom-thumb" src="${d.image}" alt="" /><span>${d.label}</span>`;
  btn.setAttribute("aria-label", `Sacar ${d.label} de la caja`);
  btn.addEventListener("click", () => addDenomination(d));
  return btn;
}

function init() {
  buildDenomButtons();
  $("transaction-form").addEventListener("submit", (e) => {
    e.preventDefault();
    applyTransactionFromInputs();
  });
  $("btn-random").addEventListener("click", fillRandomExample);
  $("btn-check").addEventListener("click", checkAnswer);
  $("btn-new").addEventListener("click", resetPractice);
  $("btn-clear").addEventListener("click", clearGiven);
  $("btn-undo").addEventListener("click", undoLast);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("#purchase-input, #customer-input")) {
      return;
    }
    if (e.key === "Enter" && !state.solved && state.transactionReady) {
      checkAnswer();
    }
    if (e.key === "Escape") clearGiven();
    if (e.key === "Backspace" && e.ctrlKey) {
      e.preventDefault();
      undoLast();
    }
  });

  updateStatsBar();
  setTransactionHint("Introduce compra y pago; luego pulsa Empezar.");
  updateGivenUI();
}

init();
