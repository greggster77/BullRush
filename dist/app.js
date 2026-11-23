import {
  hit,
  visitResult,
  homography,
  project,
  checkout,
  sectors,
} from "./core.mjs";
import { botLevels, botThrow } from "./bot.mjs";
import { AutoTracker } from "./detection.mjs";
import { drawBoard, boardPoint } from "./board.mjs";
const $ = (id) => document.getElementById(id),
  video = $("video"),
  overlay = $("overlay"),
  o = overlay.getContext("2d"),
  sample = document.createElement("canvas"),
  ctx = sample.getContext("2d", { willReadFrequently: true });
let state;
try {
  state = JSON.parse(localStorage.getItem("pilkoll-match-v1"));
} catch {}
if (!state || !Array.isArray(state.players) || !state.players.length)
  state = fresh(["Greger"], 501, true);

state.legsToWin ??= 1;
state.leg ??= 1;
state.players.forEach((player, index) => {
  player.legs ??= Number(state.winner === index);
});
let undoStack = [],
  multiplier = 1,
  editIndex = null,
  stream = null,
  interval = null,
  H = null,
  points = [],
  calibrating = false,
  tracker = null,
  auto = false,
  advanceOnClear = false,
  cameraView = false,
  lastTip = null,
  wakeLock = null,
  modalPaused = false,
  cameraStarting = false;
let botTimer = null;

function fresh(names, start, double, legsToWin = 1) {
  return {
    players: names.map((name) => ({ name, score: start, legs: 0 })),
    start,
    double,
    legsToWin,
    leg: 1,
    turn: 0,
    darts: [],
    history: [],
    winner: null,
  };
}
function save() {
  try {
    localStorage.setItem("pilkoll-match-v1", JSON.stringify(state));
  } catch {
    gameMessage("Matchen kunde inte sparas i webbläsaren.");
  }
}
function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 100) undoStack.shift();
}
function result() {
  if (state.winner !== null) return { left: 0, bust: false, win: true };
  return visitResult(
    state.players[state.turn].score,
    state.darts,
    state.double,
  );
}
function gameMessage(text) {
  $("gamestatus").textContent = text;
}
function statsFor(i, leg) {
  const mine = state.history.filter(
      (v) => v.player === i && (leg === undefined || (v.leg ?? 1) === leg),
    ),
    sum = mine.reduce((a, v) => a + v.scored, 0),
    n = mine.reduce((a, v) => a + v.darts.length, 0);
  return {
    average: n ? ((sum / n) * 3).toFixed(1) : "0.0",
    darts: n,
    best: mine.length ? Math.max(...mine.map((v) => v.scored)) : 0,
  };
}
const dartSVG =
  '<svg viewBox="0 0 100 28" aria-hidden="true"><path d="M2 14 9 3h13l9 9h52l12 2-12 2H31l-9 9H9Z"/></svg>';
function render() {
  const r = result(),
    botTurn = isBotTurn();
  $("match-format").textContent =
    state.start +
    " · " +
    (state.double ? "Dubbel ut" : "Rak ut") +
    (state.legsToWin > 1 ? " · Leg " + state.leg : "");
  $("players").replaceChildren(
    ...state.players.map((p, i) => {
      let el = document.createElement("div");
      el.className = "player" + (state.turn === i ? " active" : "");
      let name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;
      let scoreRow = document.createElement("div");
      scoreRow.className = "score-row";
      let num = document.createElement("strong");
      num.textContent = i === state.turn ? r.left : p.score;
      let turnScore = document.createElement("span");
      turnScore.className = "turn-score";
      turnScore.textContent = p.legs;
      turnScore.title = p.legs + " vunna leg";
      turnScore.setAttribute("aria-label", turnScore.title);
      scoreRow.append(num, turnScore);
      let avg = document.createElement("div");
      avg.className = "averages";
      let stats = statsFor(i);
      avg.textContent =
        "Leg " + statsFor(i, state.leg).average + " / Match " + stats.average;
      let count = document.createElement("span");
      count.className = "dart-count";
      count.textContent =
        stats.darts + (i === state.turn ? state.darts.length : 0);
      el.append(name, scoreRow, avg, count);
      return el;
    }),
  );
  if (state.players.length === 1) {
    let p = document.createElement("div");
    p.className = "player passive";
    p.innerHTML =
      '<span class="name">◎ EGEN TRÄNING</span><div class="score-row"><strong>SOLO</strong></div><div class="averages">En spelare</div><span class="dart-count">En pil i taget</span>';
    $("players").append(p);
  }
  $("darts").replaceChildren(
    ...[0, 1, 2].map((i) => {
      let b = document.createElement("button");
      b.className = "dart";
      let d = state.darts[i];
      b.disabled = botTurn || !d || state.winner !== null;
      b.setAttribute(
        "aria-label",
        d
          ? "Rätta pil " + (i + 1) + ": " + d.label
          : "Pil " + (i + 1) + " ej kastad",
      );
      if (d) {
        b.textContent = d.label;
        if (d.source === "camera") {
          let dot = document.createElement("i");
          dot.className = "auto-dot";
          b.append(dot);
        }
        b.onclick = () => openManual(i);
      } else b.innerHTML = dartSVG;
      return b;
    }),
  );
  $("visitTotal").textContent = r.bust
    ? "BUST"
    : state.darts.reduce((a, d) => a + d.value, 0);
  renderCheckout(r);
  $("manual-open").disabled = botTurn || state.winner !== null;
  $("next").disabled = botTurn || !state.darts.length || state.winner !== null;
  $("next").textContent = r.win ? "Spara" : "Nästa";
  $("undo").disabled = botTurn || !undoStack.length;
  let s = statsFor(state.turn);
  $("average").textContent = s.average;
  $("best").textContent = s.best || "–";
  $("stats-player").textContent = state.players[state.turn].name;
  $("history").replaceChildren();
  if (!state.history.length)
    $("history").textContent = "Inga färdiga omgångar ännu.";
  for (const v of state.history.slice(-8).reverse()) {
    let p = document.createElement("p"),
      name = document.createElement("span"),
      val = document.createElement("strong");
    name.textContent =
      state.players[v.player].name +
      " · " +
      v.darts.map((d) => d.label).join(" / ");
    val.textContent = v.bust ? "BUST" : v.scored;
    p.append(name, val);
    $("history").append(p);
  }
  renderBotStatus();
  renderLegHistory();
  drawBoard($("board"), state.darts);
  queueBotTurn();
  const blocked =
    state.darts.length >= 3 || r.bust || r.win || state.winner !== null;
  document
    .querySelectorAll("#numbers button,#bull,#doublebull,#miss")
    .forEach((b) => (b.disabled = editIndex === null && blocked));
}
function renderCheckout(visit) {
  const dartsLeft = 3 - state.darts.length;
  const route =
    isBotTurn() || visit.bust || visit.win
      ? null
      : checkout(visit.left, state.double, dartsLeft);

  $("checkout-card").hidden = !route;
  if (route) {
    const darts = dartsLeft === 1 ? "1 pil kvar" : dartsLeft + " pilar kvar";
    $("checkout-caption").textContent =
      "Utgång · " + visit.left + " poäng · " + darts;
    $("checkout-route").textContent = route.join(" → ");
  }

  $("checkout").textContent =
    visit.win && !state.players[state.turn].botLevel && state.winner === null
      ? "Du har gått ut."
      : visit.bust
        ? "Bust · omgången ger 0 poäng"
        : "";
}
function isBotTurn() {
  return state.winner === null && !!state.players[state.turn].botLevel;
}

function renderBotStatus() {
  const status = $("bot-status");
  const botIndex = state.players.findIndex((player) => player.botLevel);
  status.hidden = botIndex < 0;
  if (status.hidden) return;

  let message = state.players[botIndex].name;
  if (isBotTurn()) {
    message +=
      " kastar" +
      (state.darts.length
        ? " · " + state.darts.map((dart) => dart.label).join(" / ")
        : " …");
  } else {
    const lastVisit = state.history.findLast(
      (visit) => visit.player === botIndex,
    );
    if (lastVisit) {
      message +=
        " · " +
        lastVisit.darts.map((dart) => dart.label).join(" / ") +
        (lastVisit.bust ? " · BUST" : " · " + lastVisit.scored + " poäng");
    }
  }
  if (status.textContent !== message) status.textContent = message;
}

function renderLegHistory() {
  const history = $("leg-history");
  const finishes = state.history.filter((visit) => visit.dartsToWin);
  $("leg-results").hidden = finishes.length === 0;
  history.replaceChildren(
    ...finishes.map((visit) => {
      const row = document.createElement("p");
      row.textContent =
        "Leg " +
        visit.leg +
        " · " +
        state.players[visit.player].name +
        " · " +
        visit.dartsToWin +
        " pilar";
      return row;
    }),
  );
}

function queueBotTurn() {
  if (botTimer !== null || !isBotTurn() || modalPaused || document.hidden)
    return;

  botTimer = setTimeout(() => {
    botTimer = null;
    if (!isBotTurn() || modalPaused || document.hidden) return;

    const visit = result();
    if (visit.win || visit.bust || state.darts.length === 3) {
      finishVisit(false, true);
      return;
    }

    const level = state.players[state.turn].botLevel;
    const dart = botThrow(
      visit.left,
      state.double,
      3 - state.darts.length,
      level,
    );
    state.darts.push({ ...dart, source: "bot" });
    save();
    render();
  }, 520);
}

function pointFor(d) {
  if (d.value === 0) return {};
  if (d.value === 25 || d.value === 50)
    return { bx: 0, by: d.value === 25 ? 0.065 : 0 };
  let n = d.value / d.m,
    i = sectors.indexOf(n),
    a = -Math.PI / 2 + (i * Math.PI) / 10,
    r = d.m === 3 ? 0.606 : d.m === 2 ? 0.976 : 0.8;
  return { bx: Math.cos(a) * r, by: Math.sin(a) * r };
}
function insert(d, source = "manual") {
  if (isBotTurn() || state.winner !== null) return false;
  const r = result();
  if (
    editIndex === null &&
    (state.darts.length >= 3 || r.bust || r.win || state.winner !== null)
  )
    return false;
  if (!Number.isFinite(d.bx)) Object.assign(d, pointFor(d));
  d.source = source;
  snapshot();
  if (editIndex !== null) {
    state.darts[editIndex] = d;
    editIndex = null;
  } else state.darts.push(d);
  save();
  render();
  if (tracker && auto) {
    const next = result();
    if (state.darts.length >= 3 || next.bust || next.win) {
      tracker.waitForClear();
      advanceOnClear = true;
      cameraMessage(
        next.win
          ? "Utgång! Ta ur pilarna för att spara segern."
          : "Omgång klar. Ta ur alla pilar — appen går vidare automatiskt.",
        "clear",
      );
    } else if (source === "camera") {
      cameraMessage(
        d.label + " · " + d.value + " poäng. Redo för nästa pil.",
        "live",
      );
    } else {
      tracker.phase = "watch";
      advanceOnClear = false;
      tracker.resume();
      cameraMessage(
        "Avläser tavlan igen. Vänta tills kameran är redo.",
        "live",
      );
    }
  }
  return true;
}
function finishVisit(fromCamera = false, fromBot = false) {
  if (!state.darts.length || state.winner !== null || isBotTurn() !== fromBot)
    return;
  const visit = result();
  if (!fromBot) snapshot();
  const player = state.players[state.turn];
  const dartsToWin = visit.win
    ? statsFor(state.turn, state.leg).darts + state.darts.length
    : null;
  state.history.push({
    player: state.turn,
    leg: state.leg,
    darts: [...state.darts],
    bust: visit.bust,
    scored: visit.bust ? 0 : player.score - visit.left,
    dartsToWin,
  });
  player.score = visit.left;
  state.darts = [];

  if (visit.win) {
    player.legs += 1;
    if (player.legs >= state.legsToWin) {
      state.winner = state.turn;
      gameMessage(
        player.name +
          " vann matchen. Sista leget tog " +
          dartsToWin +
          " pilar.",
      );
      auto = false;
      releaseWake();
    } else {
      state.leg += 1;
      for (const p of state.players) p.score = state.start;
      state.turn = (state.leg - 1) % state.players.length;
      gameMessage(
        player.name +
          " vann leget på " +
          dartsToWin +
          " pilar. Leg " +
          state.leg +
          " börjar.",
      );
    }
  } else {
    state.turn = (state.turn + 1) % state.players.length;
    gameMessage("");
  }

  advanceOnClear = false;
  if (tracker && auto && !fromCamera && !fromBot) {
    tracker.waitForClear();
    cameraMessage("Ta ur alla pilar. Kameran väntar på tom tavla.", "clear");
  } else if (fromBot && auto && tracker?.phase === "watch" && !isBotTurn()) {
    cameraMessage("Redo för nästa pil. Kameran bevakar tavlan.", "live");
  }
  save();
  render();
  updateButtons();
}

function pauseForDialog() {
  modalPaused = true;
}
function resumeCamera() {
  if (!tracker || !auto || isBotTurn()) return;
  const visit = result();
  if (
    tracker.empty &&
    state.winner === null &&
    (state.darts.length >= 3 || visit.bust || visit.win)
  ) {
    tracker.waitForClear();
    advanceOnClear = true;
    cameraMessage(
      "Omgång klar. Ta ur alla pilar eller tryck på Nästa.",
      "clear",
    );
    return;
  }
  tracker.resume();
  if (tracker.phase !== "clear") {
    cameraMessage("Avläser tavlan igen. Vänta tills kameran är redo.", "live");
  }
}
function resumeAfterDialog() {
  modalPaused = false;
  resumeCamera();
  queueBotTurn();
}
function openManual(index = null) {
  if (isBotTurn() || state.winner !== null) return;
  editIndex = index;
  pauseForDialog();
  $("manual-title").textContent =
    index === null ? "Registrera en pil" : "Rätta pil " + (index + 1);
  $("manual-hint").textContent =
    index === null
      ? "Välj ring och siffra. Missar lägger du till här."
      : "Välj den riktiga träffen. Poängen räknas om.";
  render();
  $("manual").showModal();
}
function choose(d) {
  if (insert(d)) $("manual").close();
}
for (let n = 1; n <= 20; n++) {
  let b = document.createElement("button");
  b.textContent = n;
  b.onclick = () =>
    choose({
      value: n * multiplier,
      m: multiplier,
      label: (multiplier === 3 ? "T" : multiplier === 2 ? "D" : "") + n,
    });
  $("numbers").append(b);
}
document.querySelectorAll("[data-m]").forEach(
  (b) =>
    (b.onclick = () => {
      multiplier = +b.dataset.m;
      document
        .querySelectorAll("[data-m]")
        .forEach((x) => x.classList.toggle("selected", x === b));
    }),
);
$("bull").onclick = () => choose({ value: 25, m: 1, label: "Bull" });
$("doublebull").onclick = () => choose({ value: 50, m: 2, label: "Bullseye" });
$("miss").onclick = () => choose({ value: 0, m: 1, label: "Miss" });
$("manual-open").onclick = () => openManual();
$("manual-close").onclick = () => $("manual").close();
$("manual").addEventListener("close", () => {
  editIndex = null;
  resumeAfterDialog();
  render();
});
$("board").onclick = (e) => {
  let p = boardPoint($("board"), e.clientX, e.clientY);
  if (Math.hypot(p.x, p.y) > 1.08) return;
  let d = hit(p.x, p.y);
  insert({ ...d, bx: p.x, by: p.y });
};
$("board").tabIndex = 0;
$("board").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openManual();
  }
};
$("undo").onclick = () => {
  if (isBotTurn() || !undoStack.length) return;
  state = JSON.parse(undoStack.pop());
  advanceOnClear = false;
  editIndex = null;
  save();
  render();
  gameMessage("Senaste ändringen ångrad.");
  if (tracker && auto) {
    if (tracker.empty) tracker.phase = "watch";
    resumeCamera();
  }
};
$("next").onclick = () => finishVisit(false);
for (const [value, level] of Object.entries(botLevels)) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = level.name + " · ca " + level.typical501 + " pilar";
  $("bot-level").append(option);
}

function updateOpponentOptions() {
  const againstBot = $("opponent").value === "bot";
  $("name2-option").hidden = againstBot;
  $("name2").disabled = againstBot;
  $("bot-options").hidden = !againstBot;
  $("bot-level").disabled = !againstBot;
}

$("opponent").onchange = updateOpponentOptions;
function openSetup() {
  pauseForDialog();
  const bot = state.players.find((player) => player.botLevel);
  $("opponent").value = bot ? "bot" : "local";
  $("name1").value = state.players[0].name;
  $("name2").value = state.players[1] && !bot ? state.players[1].name : "";
  $("startscore").value = String(state.start);
  $("out").value = state.double ? "double" : "straight";
  $("legs").value = String(state.legsToWin);
  $("bot-level").value = bot?.botLevel ?? "novice";
  updateOpponentOptions();
  $("setup").showModal();
}
$("new").onclick = openSetup;
$("settings-open").onclick = openSetup;
$("cancel").onclick = () => $("setup").close();
$("setup").addEventListener("close", resumeAfterDialog);
$("setupform").onsubmit = (e) => {
  e.preventDefault();
  const playerName = $("name1").value.trim();
  if (!playerName) return;
  const botLevel = $("opponent").value === "bot" ? $("bot-level").value : null;
  const opponent = botLevel ? botLevels[botLevel] : null;
  const secondName = opponent
    ? "Datorn · " + opponent.name
    : $("name2").value.trim();
  snapshot();
  state = fresh(
    [playerName, secondName].filter(Boolean),
    +$("startscore").value,
    $("out").value === "double",
    +$("legs").value,
  );
  if (opponent) state.players[1].botLevel = botLevel;
  advanceOnClear = false;
  editIndex = null;
  gameMessage("");
  if (tracker) {
    tracker.restart();
    auto = false;
    releaseWake();
    cameraMessage("Ny match. Töm tavlan och tryck Starta automatik.", "paused");
  }
  save();
  render();
  updateButtons();
  $("setup").close();
};
$("stats-open").onclick = () => {
  pauseForDialog();
  $("statistics").showModal();
};
$("stats-close").onclick = () => $("statistics").close();
$("statistics").addEventListener("close", resumeAfterDialog);
function cameraMessage(text, status) {
  $("camstatus").textContent = text;
  $("auto-status").textContent = text;
  $("auto-status").classList.toggle("live", status === "live");
}
function updateButtons() {
  $("camera-count").textContent = stream ? "1" : "0";
  $("pause-auto").hidden = !tracker;
  $("pause-auto").textContent = auto ? "Pausa" : "Starta automatik";
  $("camera-control").classList.toggle("live", auto);
  $("start").hidden = !!stream;
  $("stop").hidden = !stream;
  $("calibrate").disabled = !stream;
}
function parkDock() {
  const dock = $("camera-dock");
  if (cameraView) {
    $("camera-host").append(dock);
    dock.classList.remove("parked");
  } else if (stream) {
    $("preview-host").append(dock);
    dock.classList.remove("parked");
    $("preview-host").hidden = false;
  } else {
    document.body.append(dock);
    dock.classList.add("parked");
    $("preview-host").hidden = true;
  }
  if (stream) video.play().catch(() => {});
}
function showCamera(show = true) {
  cameraView = show;
  $("camera-screen").hidden = !show;
  $("match-screen").hidden = show;
  parkDock();
  window.scrollTo(0, 0);
}
$("camera-open").onclick = () => showCamera();
$("camera-control").onclick = () => showCamera();
$("camera-done").onclick = () => showCamera(false);
$("preview-host").onclick = () => showCamera();
async function requestWake() {
  if (
    !navigator.wakeLock ||
    !auto ||
    document.hidden ||
    (wakeLock && !wakeLock.released)
  )
    return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!auto || document.hidden || (wakeLock && !wakeLock.released)) {
      await lock.release();
    } else {
      wakeLock = lock;
    }
  } catch {}
}
function releaseWake() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
$("start").onclick = async () => {
  if (stream || cameraStarting) return;
  cameraStarting = true;
  $("start").disabled = true;
  cameraMessage("Startar bakre kameran …");
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Öppna appens https-länk i Safari.");
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    video.srcObject = stream;
    const activeStream = stream;
    for (const track of stream.getVideoTracks())
      track.addEventListener(
        "ended",
        () => {
          if (stream !== activeStream) return;
          stopStream(false);
          cameraMessage("Kameran avbröts. Starta den och kalibrera igen.");
        },
        { once: true },
      );
    await video.play();
    if (stream !== activeStream) return;
    if (!video.videoWidth || !video.videoHeight)
      throw Error("Ingen kamerabild. Försök igen.");
    const scale = 480 / Math.max(video.videoWidth, video.videoHeight);
    sample.width = Math.round(video.videoWidth * scale);
    sample.height = Math.round(video.videoHeight * scale);
    overlay.width = sample.width;
    overlay.height = sample.height;
    $("camera-dock").style.aspectRatio =
      video.videoWidth + "/" + video.videoHeight;
    $("camera-empty").hidden = true;
    clearInterval(interval);
    interval = setInterval(processFrame, 160);
    updateButtons();
    cameraMessage(
      "Töm tavlan. Tryck Kalibrera tavlan för att starta automatisk avläsning.",
    );
  } catch (e) {
    stopStream(false);
    if (e.name === "NotAllowedError") {
      cameraMessage(
        "Tillåt kameraåtkomst i webbläsaren och försök igen. Du kan också använda manuell poängräkning.",
      );
    } else {
      cameraMessage("Kameran kunde inte startas: " + e.message);
    }
  } finally {
    cameraStarting = false;
    $("start").disabled = false;
  }
};
function stopStream(notify = true) {
  clearInterval(interval);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  auto = false;
  tracker = null;
  H = null;
  points = [];
  calibrating = false;
  advanceOnClear = false;
  lastTip = null;
  $("camera-empty").hidden = false;
  $("camera-progress").textContent = "20 → 6 → 3 → 11";
  $("camera-progress").classList.remove("ready");
  drawOverlay();
  releaseWake();
  updateButtons();
  parkDock();
  if (notify) cameraMessage("Kameran är avstängd.");
}
$("stop").onclick = () => stopStream();
window.addEventListener("pagehide", () => stopStream());
const prompts = [
  "överst vid 20",
  "till höger vid 6",
  "nederst vid 3",
  "till vänster vid 11",
];
$("calibrate").onclick = () => {
  auto = false;
  tracker = null;
  H = null;
  points = [];
  lastTip = null;
  calibrating = true;
  advanceOnClear = false;
  updateButtons();
  cameraMessage(
    "TOM TAVLA: Tryck på dubbelringens ytterkant " + prompts[0] + ".",
  );
  $("camera-progress").classList.remove("ready");
  $("camera-progress").textContent = "1/4 · 20";
  drawOverlay();
};
function drawOverlay() {
  o.clearRect(0, 0, overlay.width, overlay.height);
  o.font = "bold 13px system-ui";
  points.forEach((p, i) => {
    o.beginPath();
    o.arc(p.x, p.y, 5, 0, 7);
    o.fillStyle = "#3991ff";
    o.fill();
    o.fillStyle = "#fff";
    o.fillText(["20", "6", "3", "11"][i], p.x + 8, p.y - 5);
  });
  if (lastTip) {
    o.strokeStyle = "#55dba0";
    o.lineWidth = 2;
    o.beginPath();
    o.arc(lastTip.x, lastTip.y, 10, 0, 7);
    o.stroke();
  }
}
overlay.onclick = (e) => {
  if (!stream || !calibrating) return;
  let rect = overlay.getBoundingClientRect(),
    p = {
      x: ((e.clientX - rect.left) * overlay.width) / rect.width,
      y: ((e.clientY - rect.top) * overlay.height) / rect.height,
    };
  points.push(p);
  if (points.length === 4) {
    try {
      const cross = points.map((p, i) => {
        let q = points[(i + 1) % 4],
          r = points[(i + 2) % 4];
        return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
      });
      const area =
        Math.abs(
          points.reduce((a, p, i) => {
            let q = points[(i + 1) % 4];
            return a + p.x * q.y - q.x * p.y;
          }, 0),
        ) / 2;
      if (
        cross.some((v) => v <= 0) ||
        area < sample.width * sample.height * 0.05
      )
        throw Error("Punkterna behöver omge tavlan i ordningen 20, 6, 3, 11.");
      H = homography(points);
      tracker = new AutoTracker(sample.width, sample.height, H);
      calibrating = false;
      auto = true;
      modalPaused = false;
      $("camera-progress").textContent = "✓ KALIBRERAD";
      $("camera-progress").classList.add("ready");
      cameraMessage(
        "Kalibrerad. Håll tavlan tom och vänta på ”Redo för nästa pil”.",
        "live",
      );
      updateButtons();
      requestWake();
    } catch (err) {
      H = null;
      points = [];
      cameraMessage(err.message + " Börja om vid 20.");
      $("camera-progress").textContent = "1/4 · 20";
    }
  } else {
    cameraMessage(
      "Tryck på dubbelringens ytterkant " + prompts[points.length] + ".",
    );
    $("camera-progress").textContent =
      points.length + 1 + "/4 · " + ["20", "6", "3", "11"][points.length];
  }
  drawOverlay();
};
$("pause-auto").onclick = () => {
  if (!tracker) return;
  auto = !auto;
  if (auto) {
    resumeCamera();
    requestWake();
  } else {
    cameraMessage(
      "Automatiken är pausad. Kameran är fortfarande igång.",
      "paused",
    );
    releaseWake();
  }
  updateButtons();
};
function processFrame() {
  if (
    !stream ||
    !tracker ||
    !auto ||
    modalPaused ||
    calibrating ||
    document.visibilityState !== "visible" ||
    video.readyState < 2 ||
    (isBotTurn() && tracker.phase !== "clear")
  )
    return;
  ctx.drawImage(video, 0, 0, sample.width, sample.height);
  const event = tracker.step(
    ctx.getImageData(0, 0, sample.width, sample.height).data,
  );
  if (!event) return;
  if (event.type === "ready") {
    const visit = result();
    if (
      state.winner === null &&
      (state.darts.length >= 3 || visit.bust || visit.win)
    ) {
      resumeCamera();
    } else {
      cameraMessage("Redo för nästa pil. Kameran bevakar tavlan.", "live");
    }
  }
  if (event.type === "hit") {
    const d = hit(event.bx, event.by);
    lastTip = event;
    drawOverlay();
    if (insert({ ...d, bx: event.bx, by: event.by }, "camera")) {
      gameMessage(
        "Automatiskt: " + d.label + " · tryck på pilen i raden för att rätta.",
      );
    }
  }
  if (event.type === "removed") {
    advanceOnClear = state.darts.length > 0;
    cameraMessage("Tavlan töms. Håll den tom en stund.", "clear");
  }
  if (event.type === "clear") {
    if (advanceOnClear) finishVisit(true);
    advanceOnClear = false;
    lastTip = null;
    drawOverlay();
    if (auto)
      cameraMessage(
        isBotTurn()
          ? "Tom tavla. Vänta på datorns kast."
          : "Tom tavla. Redo för nästa pil.",
        "live",
      );
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    releaseWake();
    if (auto) cameraMessage("Bevakningen pausar när appen är i bakgrunden.");
  } else {
    if (auto && tracker) {
      resumeCamera();
      requestWake();
    }
    queueBotTurn();
  }
});
render();
updateButtons();
parkDock();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Bullrush kunde inte förberedas för offlinespel.", error);
  });
}
