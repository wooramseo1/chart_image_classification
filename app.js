/* Chart Strategy Agent — 모델 추론 + 전략 결정 엔진 */
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/5OHUfHQ4G/";
const HISTORY_KEY = "csa.history.v1";
const HISTORY_MAX = 12;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const state = {
  model: null,
  imageLoaded: false,
  options: { direction: "auto", risk: "normal" },
  threshold: 0.7,
  lastReport: "",
};

/* ---------------- 모델 로드 ---------------- */
async function loadModel() {
  const status = $("#modelStatus");
  try {
    state.model = await tmImage.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");
    status.classList.add("ready");
    status.querySelector("em").textContent = "모델 준비 완료";
    $("#hint").textContent = "차트 이미지를 업로드하세요.";
    updateAnalyzeBtn();
  } catch (err) {
    console.error(err);
    status.classList.add("error");
    status.querySelector("em").textContent = "모델 로드 실패";
    $("#hint").textContent = "모델을 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침하세요.";
    $("#hint").classList.add("err");
  }
}

function updateAnalyzeBtn() {
  $("#analyzeBtn").disabled = !(state.model && state.imageLoaded);
  if (state.model && state.imageLoaded) $("#hint").textContent = "준비 완료 — AI 분석을 실행하세요.";
}

/* ---------------- 이미지 입력 ---------------- */
const dropzone = $("#dropzone");
const preview = $("#preview");

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("이미지 파일만 업로드할 수 있습니다.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.onload = () => {
      state.imageLoaded = true;
      preview.hidden = false;
      $("#dzEmpty").hidden = true;
      $("#resetBtn").hidden = false;
      dropzone.classList.add("has-img");
      updateAnalyzeBtn();
    };
    preview.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

$("#fileInput").addEventListener("change", (e) => handleFile(e.target.files[0]));
dropzone.addEventListener("click", (e) => {
  if (state.imageLoaded) e.preventDefault();
});
["dragenter", "dragover"].forEach((t) =>
  dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach((t) =>
  dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) {
    handleFile(item.getAsFile());
    toast("클립보드 이미지를 불러왔습니다.");
  }
});

$("#resetBtn").addEventListener("click", () => {
  state.imageLoaded = false;
  preview.hidden = true;
  preview.removeAttribute("src");
  $("#dzEmpty").hidden = false;
  $("#resetBtn").hidden = true;
  $("#fileInput").value = "";
  dropzone.classList.remove("has-img");
  $("#analyzeBtn").disabled = true;
  if (state.model) $("#hint").textContent = "차트 이미지를 업로드하세요.";
});

/* ---------------- 옵션 ---------------- */
$$(".seg").forEach((seg) => {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    state.options[seg.dataset.name] = btn.dataset.v;
  });
});
$("#threshold").addEventListener("input", (e) => {
  state.threshold = e.target.value / 100;
  $("#thrVal").textContent = e.target.value + "%";
});

/* ---------------- 분석 실행 ---------------- */
$("#analyzeBtn").addEventListener("click", analyze);

async function analyze() {
  const btn = $("#analyzeBtn");
  btn.disabled = true;
  btn.querySelector(".spinner").hidden = false;
  btn.querySelector(".lbl").textContent = "분석 중…";
  $("#scan").hidden = false;

  try {
    const [prediction] = await Promise.all([
      state.model.predict(preview),
      new Promise((r) => setTimeout(r, 900)), // 스캔 애니메이션 최소 노출
    ]);
    const probs = prediction
      .map((p) => ({ key: classKey(p.className), raw: p.className, p: p.probability }))
      .sort((a, b) => b.p - a.p);
    const strategy = decideStrategy(probs, state.options, state.threshold);
    renderResult(probs, strategy);
    saveHistory(strategy);
  } catch (err) {
    console.error(err);
    toast("분석 중 오류가 발생했습니다.");
  } finally {
    $("#scan").hidden = true;
    btn.querySelector(".spinner").hidden = true;
    btn.querySelector(".lbl").textContent = "AI 분석 실행";
    updateAnalyzeBtn();
  }
}

function classKey(name) {
  const n = name.toLowerCase();
  if (n.includes("trend")) return "trend";
  if (n.includes("triangle")) return "triangle";
  return n;
}

const CLASS_INFO = {
  trend: { name: "Trend Line", ko: "추세선", color: "var(--blue)" },
  triangle: { name: "Triangle Pattern", ko: "삼각수렴", color: "var(--green)" },
};
const info = (k) => CLASS_INFO[k] || { name: k, ko: k, color: "var(--violet)" };

/* ---------------- 전략 결정 엔진 ---------------- */
const RISK_PROFILE = {
  safe: { label: "보수적", size: "계좌의 10~20%", split: "3회 분할", stopPad: "타이트하게(-2~3%)", rr: "1 : 2", riskAdj: -1 },
  normal: { label: "중립", size: "계좌의 20~35%", split: "2회 분할", stopPad: "기본(-3~5%)", rr: "1 : 2.5", riskAdj: 0 },
  aggr: { label: "공격적", size: "계좌의 35~50%", split: "1~2회", stopPad: "넓게(-5~7%)", rr: "1 : 3", riskAdj: 1 },
};

function decideStrategy(probs, opts, threshold) {
  const top = probs[0];
  const margin = top.p - (probs[1]?.p ?? 0);
  const rp = RISK_PROFILE[opts.risk];
  const dir = opts.direction;
  let s;

  if (top.p < threshold) {
    s = {
      action: "HOLD", cls: "hold", title: "관망 — 패턴 신호 불명확",
      summary: `최고 확률(${pct(top.p)})이 신뢰도 기준(${pct(threshold)})에 미달합니다. 두 패턴의 특징이 혼재되어 있어 명확한 방향성 판단이 어렵습니다.`,
      entry: "신규 진입 보류", stop: "기존 포지션은 최근 저점 이탈 시 정리",
      target: "패턴 확정 후 재분석",
      checklist: [
        "더 긴 기간(일봉·주봉)의 차트로 다시 분석해 보세요.",
        "지표·텍스트가 적은 깔끔한 캔들 차트 캡처를 사용하세요.",
        "거래량 급증 등 명확한 이벤트가 나올 때까지 대기합니다.",
      ],
      risk: 3,
    };
  } else if (top.key === "trend") {
    if (dir === "down") {
      s = {
        action: "REDUCE", cls: "sell", title: "하락 추세 — 비중 축소 / 반등 매도",
        summary: "하락 추세선이 유효한 구간으로 판단됩니다. 추세선 저항에서의 반등 실패를 매도·비중 축소 기회로 활용합니다.",
        entry: "추세선 저항 터치 후 음봉 확인 시 매도(숏)",
        stop: `하락 추세선 상향 돌파 종가 · ${rp.stopPad}`,
        target: `직전 저점 → 추가 저점 갱신 구간 (손익비 ${rp.rr})`,
        checklist: [
          "추세선과 3회 이상 접점이 있는지 확인",
          "반등 시 거래량이 감소하는지 확인",
          "추세선 상향 돌파 + 거래량 증가 시 즉시 전략 폐기",
        ],
        risk: 3,
      };
    } else {
      s = {
        action: "BUY", cls: "buy", title: dir === "up" ? "상승 추세 — 추세 추종 매수" : "추세 지속 — 추세 추종 전략",
        summary: (dir === "up"
          ? "상승 추세선이 지지선 역할을 하는 구간입니다. "
          : "명확한 추세선 구조가 감지되었습니다. 상승 추세라면 매수, 하락 추세라면 비중 축소로 대응합니다. ") +
          `추세선 근처 눌림목에서 ${rp.split} 진입을 권장합니다.`,
        entry: `추세선 지지 확인 후 눌림목 ${rp.split} 매수 (${rp.size})`,
        stop: `종가 기준 추세선 이탈 · ${rp.stopPad}`,
        target: `직전 고점 1차 → 추세 채널 상단 2차 (손익비 ${rp.rr})`,
        checklist: [
          "저점이 지속적으로 높아지는지(Higher Low) 확인",
          "추세선 터치 시 거래량이 감소하고 반등 시 증가하는지 확인",
          "추세선 이탈 시 미련 없이 손절 — 추세 전환 가능성",
        ],
        risk: 2,
      };
    }
  } else if (top.key === "triangle") {
    const bias = dir === "up" ? "상단(상승) 돌파 우세" : dir === "down" ? "하단(하락) 이탈 우세" : "양방향 돌파 가능";
    s = {
      action: "WAIT", cls: "wait", title: `삼각수렴 — 돌파 대기 (${bias})`,
      summary: "변동성이 수렴하는 삼각형 패턴으로 판단됩니다. 수렴 내부에서는 방향성이 불확실하므로, 추세선 돌파가 확인될 때 해당 방향으로 진입합니다.",
      entry: dir === "down"
        ? "하단 추세선 이탈 종가 확인 시 매도 / 보유분 정리"
        : `상단 추세선 돌파 + 거래량 증가 시 매수 (${rp.size})`,
      stop: dir === "down"
        ? "삼각형 내부 재진입 시 손절"
        : `돌파 실패로 삼각형 내부 복귀 시 · ${rp.stopPad}`,
      target: `삼각형 최대 폭만큼 돌파 지점에서 투영 (손익비 ${rp.rr})`,
      checklist: [
        "수렴 꼭짓점의 2/3~3/4 지점 이전 돌파가 신뢰도가 높음",
        "돌파 캔들의 거래량이 평균 대비 1.5배 이상인지 확인",
        "가짜 돌파(Fake-out) 대비 — 리테스트 후 진입도 고려",
      ],
      risk: 2,
    };
  } else {
    s = {
      action: "HOLD", cls: "hold", title: `${info(top.key).name} 감지`,
      summary: "정의된 전략 규칙이 없는 클래스입니다.", entry: "—", stop: "—", target: "—", checklist: [], risk: 3,
    };
  }

  // 신뢰도·마진·성향에 따른 리스크 보정 (1~5)
  let risk = s.risk + rp.riskAdj;
  if (top.p >= 0.9 && s.action !== "HOLD") risk -= 1;
  if (margin < 0.3) risk += 1;
  s.risk = Math.max(1, Math.min(5, risk));
  s.top = top;
  s.margin = margin;
  s.profile = rp.label;
  return s;
}

const pct = (v) => (v * 100).toFixed(1) + "%";
const RISK_LABELS = ["", "매우 낮음", "낮음", "보통", "높음", "매우 높음"];

/* ---------------- 렌더링 ---------------- */
function renderResult(probs, s) {
  $("#resultEmpty").hidden = true;
  $("#result").hidden = false;
  $("#copyBtn").hidden = false;
  const res = $("#result");
  res.style.animation = "none"; res.offsetHeight; res.style.animation = "";

  const top = s.top;
  const ti = info(top.key);
  const low = s.action === "HOLD";

  // gauge
  const arc = $("#gaugeArc");
  arc.style.stroke = low ? "var(--amber)" : ti.color;
  arc.style.strokeDashoffset = 314.16;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.strokeDashoffset = 314.16 * (1 - top.p);
  }));
  countUp($("#gaugeVal"), top.p * 100);

  $("#patternName").textContent = `${ti.name}`;
  $("#tags").innerHTML = [
    ti.ko,
    `마진 ${pct(s.margin)}`,
    `성향 ${s.profile}`,
    low ? "기준 미달" : "기준 충족",
  ].map((t) => `<span class="tag">${t}</span>`).join("");

  $("#probs").innerHTML = probs.map((p) => {
    const i = info(p.key);
    return `<div class="prob-row"><span>${i.name}</span><div class="bar"><i style="background:${i.color}" data-w="${p.p * 100}"></i></div><b>${pct(p.p)}</b></div>`;
  }).join("");
  requestAnimationFrame(() => requestAnimationFrame(() =>
    $$("#probs .bar i").forEach((el) => (el.style.width = el.dataset.w + "%"))
  ));

  const badge = $("#actionBadge");
  badge.className = "sc-badge " + s.cls;
  badge.textContent = s.action;
  $("#strategyTitle").textContent = s.title;
  $("#strategySummary").textContent = s.summary;
  $("#planEntry").textContent = s.entry;
  $("#planStop").textContent = s.stop;
  $("#planTarget").textContent = s.target;
  $("#checklist").innerHTML = s.checklist.map((c) => `<li>${c}</li>`).join("");
  $("#riskFill").style.width = s.risk * 20 + "%";
  $("#riskLabel").textContent = RISK_LABELS[s.risk];

  state.lastReport = [
    "[Chart Strategy Agent 분석 리포트]",
    `일시: ${new Date().toLocaleString("ko-KR")}`,
    `판별 패턴: ${ti.name} (${ti.ko}) · 신뢰도 ${pct(top.p)}`,
    ...probs.map((p) => `  - ${info(p.key).name}: ${pct(p.p)}`),
    `액션: ${s.action} — ${s.title}`,
    `요약: ${s.summary}`,
    `진입: ${s.entry}`,
    `손절: ${s.stop}`,
    `목표: ${s.target}`,
    `리스크: ${RISK_LABELS[s.risk]} (성향 ${s.profile})`,
    "※ 참고용 정보이며 투자 권유가 아닙니다.",
  ].join("\n");

  if (window.innerWidth < 1024) $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function countUp(el, target) {
  const start = performance.now();
  const dur = 900;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    el.textContent = (target * (1 - Math.pow(1 - k, 3))).toFixed(1) + "%";
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

$("#copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.lastReport);
    toast("리포트를 클립보드에 복사했습니다.");
  } catch {
    toast("복사에 실패했습니다.");
  }
});

/* ---------------- 분석 기록 ---------------- */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function thumbnail(img, w = 320) {
  const c = document.createElement("canvas");
  const r = w / img.naturalWidth;
  c.width = w;
  c.height = Math.round(img.naturalHeight * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

function saveHistory(s) {
  const list = loadHistory();
  list.unshift({
    thumb: thumbnail(preview),
    pattern: info(s.top.key).name,
    conf: s.top.p,
    action: s.action,
    cls: s.cls,
    time: Date.now(),
  });
  const trimmed = list.slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // 저장 공간 부족 시 오래된 기록부터 줄여서 재시도
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed.slice(0, 4))); } catch {}
  }
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  $("#historyEmpty").hidden = list.length > 0;
  $("#clearHistory").hidden = list.length === 0;
  $("#historyGrid").innerHTML = list.map((h) => `
    <div class="h-card">
      <img src="${h.thumb}" alt="${h.pattern} 차트" loading="lazy" />
      <div class="h-body">
        <b>${h.pattern} · ${pct(h.conf)}</b>
        <div class="h-meta">
          <span>${new Date(h.time).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span class="act ${h.cls}">${h.action}</span>
        </div>
      </div>
    </div>`).join("");
}

$("#clearHistory").addEventListener("click", () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  renderHistory();
  toast("분석 기록을 삭제했습니다.");
});

/* ---------------- UI 유틸 ---------------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// 모바일 메뉴
$("#menuToggle").addEventListener("click", () => $("#menu").classList.toggle("open"));
$$("#menu a").forEach((a) => a.addEventListener("click", () => $("#menu").classList.remove("open")));

// 스크롤 위치에 따른 메뉴 활성화
const navLinks = [...$$("#menu a")];
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }
  });
}, { rootMargin: "-45% 0px -50% 0px" });
$$("main section[id]").forEach((s) => io.observe(s));

// 히어로 데모 캔들 (삼각수렴 형태)
(function drawHeroCandles() {
  const g = $("#heroCandles");
  const n = 22;
  let html = "";
  for (let i = 0; i < n; i++) {
    const x = 24 + i * 14.5;
    const t = i / (n - 1);
    const hi = 40 + 64 * t;
    const lo = 190 - 68 * t;
    const up = i % 2 === 0;
    const amp = (lo - hi) * (0.55 + 0.35 * Math.sin(i * 1.7));
    const mid = (hi + lo) / 2;
    const y1 = up ? lo - 4 : hi + 4;
    const y2 = up ? lo - amp : hi + amp;
    const top = Math.min(y1, y2), h = Math.abs(y2 - y1);
    const color = up ? "#10b981" : "#ef4444";
    html += `<line x1="${x}" x2="${x}" y1="${up ? hi + 6 : hi}" y2="${up ? lo : lo - 6}" stroke="${color}" stroke-width="1.2" opacity=".6"/>`;
    html += `<rect x="${x - 4}" y="${Math.max(top, hi) || mid}" width="8" height="${Math.max(4, Math.min(h, lo - hi))}" fill="${color}" rx="1"/>`;
  }
  g.innerHTML = html;
})();

renderHistory();
loadModel();
