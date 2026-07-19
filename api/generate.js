// 나만의 독백 — Vercel 서버리스 함수 (/api/generate)
// 2패스: 생성(Gemini) → 독립 검사(Gemini, 별도 호출) → 통과분만 반환. 실패 시 폴백 대본.
//
// 왜 2패스인가: 이 서비스는 모델 자유 생성 텍스트를 사용자에게 그대로 노출한다.
// 보이스 컬러처럼 "열거형만 통과"시키는 구조적 방어를 쓸 수 없으므로, 그 자리를 검사 층이 대신한다.
// 생성 프롬프트의 지시만으로는 FR-008(안전)·FR-017(패러프레이즈 탐지)을 보장할 수 없다.
// 상세: specs/001-my-monologue/research.md R-1
"use strict";

const FALLBACKS = require("../fallbacks.json");

// ── 선택 축 (구조적 검증: 이 값 밖은 받지 않는다) ────────────────────────
const LENGTH = ["sec30", "min1", "min2"];
const TARGET = ["leaving", "abandoned", "gone", "believed", "unknown-self"];
const HEAT   = ["burst", "hold", "persuade", "collapse"];
const TONE   = ["now", "classic"];

// 길이별 목표 글자수 (한국어 낭독 ≈ 초당 5음절). FR-003의 ±25%는 클라이언트 표기가 아니라 이 값 기준.
const LENGTH_SPEC = {
  sec30: { label: "30초", chars: "150~200자" },
  min1:  { label: "1분",  chars: "300~400자" },
  min2:  { label: "2분",  chars: "600~800자" }
};

// 상대의 '물리적 위치'까지 못박는다. 이걸 흐리게 두면 abandoned가 leaving으로 흘러
// "아직 문 앞에 있는 사람을 붙잡는" 장면이 되어 선택과 어긋난다(2026-07-19 감사에서 20% 불일치).
const TARGET_KO = {
  leaving: "지금 떠나려는 사람. **상대는 아직 눈앞에 있다.** 아직 말이 닿는다",
  abandoned: "나를 버리고 이미 떠나버린 사람. **상대는 지금 이 자리에 없다.** 붙잡을 수 없고, 말은 허공에 간다",
  gone: "이미 세상에 없는 사람. **답이 돌아오지 않는다**",
  believed: "나를 믿어준 사람(스승·부모·선배 등). **상대는 나를 의심한 적이 없다** — 나를 의심한 사람으로 쓰지 마라",
  "unknown-self": "미래의 자기 자신. **수신자는 오직 나 자신이다** — 옛 연인이나 타인이 수신자가 되면 안 된다"
};
const HEAT_KO = {
  burst: "감정을 터뜨리는",
  hold: "말을 참고 눌러두는",
  persuade: "상대를 설득하려는",
  collapse: "버티다 무너지는"
};
const TONE_KO = {
  now: "지금 한국에서 실제로 쓰는 구어체",
  // classic이 무너지는 이유는 '옛스러운 말투'를 '옛스러운 상황·소품'으로 확장하기 때문이다.
  // 말투만 격식체이고 세계는 현대여야 한다 (2026-07-19 감사: classic 성립률 29%).
  classic:
    "격식 있는 문어체. **말투만 격식체이고, 상황과 소품은 현대여야 한다.** " +
    "시대극처럼 쓰지 마라. 편의점·지하철·카톡·월세·면접 같은 현대의 것이 문어체로 말해질 때 생기는 " +
    "긴장이 목적이다. '그대여'로 시작하는 호명, 미문(美文) 나열, 탄식조는 금지한다"
};

const GEN_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    stage: { type: "STRING" },
    body:  { type: "STRING" }
  },
  required: ["title", "stage", "body"]
};

// 검사 결과는 내부 전용이다. 이 스키마의 어떤 필드도 클라이언트로 나가지 않는다 (FR-016).
const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    c1_reader_description: { type: "STRING", enum: ["pass", "fail"] },
    c2_acting_direction:   { type: "STRING", enum: ["pass", "fail"] },
    c3_effect_claim:       { type: "STRING", enum: ["pass", "fail"] },
    c4_safety:             { type: "STRING", enum: ["pass", "fail"] },
    c5_existing_work:      { type: "STRING", enum: ["pass", "fail"] },
    quote: { type: "STRING" }
  },
  required: ["c1_reader_description","c2_acting_direction","c3_effect_claim","c4_safety","c5_existing_work"]
};

function buildGenPrompt(sel) {
  const spec = LENGTH_SPEC[sel.length];
  return [
    "너는 연기 연습용 오리지널 독백을 쓰는 극작가다. 아래 조건에 맞는 독백 한 편을 창작한다.",
    "",
    "조건:",
    "- 인물이 말을 거는 상대: " + TARGET_KO[sel.target],
    "- 장면의 온도: " + HEAT_KO[sel.heat],
    "- 말투: " + TONE_KO[sel.tone],
    "- 분량: 소리 내어 읽어 " + spec.label + " (" + spec.chars + ")",
    "",
    "출력 3개:",
    "1) title — 작품 제목처럼. 짧고 구체적. '이별'·'그리움' 같은 추상적 제목 금지.",
    "2) stage — 지문 한 줄.",
    "3) body — 독백 본문.",
    "",
    "지문(stage) 규칙 — 엄격:",
    "인물이 처한 상황과 이미 일어난 사실만 적는다. 배우가 무엇을 어떻게 할지는 절대 적지 않는다.",
    "  허용: '장례식이 끝나고 혼자 남았다' / '상대는 이미 문을 나섰다'",
    "  금지: '슬픔을 억누르며 말한다' / '점점 목소리를 높인다' / '마지막에 감정을 터뜨린다'",
    "판별법: 그 문장을 지웠을 때 인물의 처지를 알 수 없게 되면 지문이고, 연기 방법만 사라지면 금지 대상이다.",
    "",
    "절대 금지:",
    "- 이 글을 읽는 배우에 대해 서술하지 마라. '당신에게 어울리는', '당신의 섬세함' 같은 표현 일절 금지.",
    "  너는 인물의 말을 쓰는 것이지 배우에 대한 말을 쓰는 것이 아니다.",
    "- 연기 효과를 단정하지 마라. '관객이 몰입할', '진정성 있게 다가올' 류 금지.",
    "- 점수·등급·난이도를 붙이지 마라.",
    "- 자해·자살 암시, 성적 내용, 학대 관계의 미화·정당화 금지. 읽는 사람 중에 미성년자가 있다.",
    "  상실을 다루되 죽음을 낭만화하거나 출구가 닫힌 느낌으로 끝내지 마라.",
    "- 실존 희곡·영화·드라마 대사를 그대로 또는 거의 그대로 쓰지 마라. 전부 오리지널이어야 한다.",
    "",
    "품질 — 이게 이 대본의 전부다:",
    "- **쓰기 전에 목적을 먼저 정해라.** 인물이 이 말로 상대에게서 얻어내려는 것이 무엇인가?",
    "  (붙잡는다 / 용서를 받는다 / 책임을 떠넘긴다 / 허락을 구한다 / 관계를 끝낸다 …)",
    "  그 목적이 본문에서 드러나야 한다. 감정 나열이나 신세한탄으로 끝나면 실패다.",
    "- **시작과 끝에서 인물의 위치가 달라져야 한다.** 같은 감정을 반복만 하면 실패다.",
    "  중간에 최소 한 번 태도가 꺾이거나, 다른 카드를 꺼내거나, 물러서야 한다.",
    "- **구체적인 사물 하나를 축으로 삼아라.** 그 사물이 장식이 아니라 대사를 움직여야 한다.",
    "  '사랑'·'상처'·'믿음'·'그리움' 같은 추상 명사에 기대지 마라.",
    "- 제목은 본문에 실제로 등장하는 것에서 따와라. 본문에 없는 것을 제목에 쓰지 마라.",
    "",
    "진부함 회피 — 아래는 이미 과도하게 쓰였다. 쓰지 마라:",
    "- 소품·장소: 서재, 낡은 회중시계/탁상시계, 찻잔, 머그컵, 라일락, 오래된 서랍 속 편지, 빈 의자",
    "- 구조: '멈추라 → 추억 나열 → 이 모든 것이 헛되냐 → 부디' 식의 붙잡기",
    "- 구조: '당신의 신뢰 → 나는 밤낮없이 → 그러나 실패했다 → 얼굴을 들 수 없다' 식의 자책",
    "- 구조: '그대여 → 기억하는가 → 추상적 질문 → 잊지 말라' 식의 호명",
    "- 표현: '부서진 유리 조각처럼', '삶의 빛이 꺼진다', '목을 조르는 밧줄'",
    "",
    "- 특정 연도·날짜(예: 2024년 10월 27일)를 쓰지 마라. 읽는 시점과 어긋난다.",
    "",
    "오직 JSON만 출력한다."
  ].join("\n");
}

function buildReviewPrompt(out) {
  return [
    "아래는 연기 연습용으로 생성된 독백이다. 5개 항목을 각각 독립적으로 판정한다.",
    "너는 글을 고치지 않는다. 판정만 한다.",
    "",
    "=== 검사 대상 ===",
    "[제목] " + out.title,
    "[지문] " + out.stage,
    "[본문] " + out.body,
    "=== 끝 ===",
    "",
    "판정 항목 (각각 pass 또는 fail):",
    "",
    "c1_reader_description — 이 글을 '읽는 사람(배우)'의 성격·역량·역할 적합성을 언급하는 문장이 있는가?",
    "  fail 예: '감정을 드러내지 않는 당신에게 어울리는', '당신의 섬세함이 돋보일'",
    "  주의: 인물이 자기 자신이나 상대에 대해 말하는 것은 pass다. 독자를 향한 말만 fail이다.",
    "",
    "c2_acting_direction — 지문이 '수행 방법'을 지시하는가?",
    "  fail 예: '울음을 억누르며 낮게 시작한다', '점점 목소리를 높인다', '마지막 문장에서 터뜨린다'",
    "  pass 예: '장례식이 끝나고 혼자 남았다', '상대는 이미 문을 나섰다'",
    "  판별: 그 문장을 지웠을 때 인물의 처지를 알 수 없게 되면 pass, 연기 방법만 사라지면 fail.",
    "",
    "c3_effect_claim — 전달력·몰입도·진정성·관객 반응을 예단하는 표현이 있는가?",
    "  fail 예: '관객이 몰입할 수밖에 없는', '진정성 있게 다가올 것이다'",
    "",
    "c4_safety — 자해·자살 암시, 성적 내용, 학대 관계의 미화·정당화가 있는가?",
    "  읽는 사람 중에 미성년자가 있다는 전제로 엄격하게 판정한다.",
    "  상실·이별·분노를 다루는 것 자체는 pass다. 죽음을 해결책으로 그리거나 자기파괴를 낭만화하면 fail.",
    "  폭력이나 지배를 사랑의 증거로 그리면 fail.",
    "",
    "c5_existing_work — 널리 알려진 희곡·영화·드라마의 실제 대사와 실질적으로 동일한 구절이 있는가?",
    "  네가 아는 유명 작품에 한해 판정한다. 확신이 없으면 pass.",
    "",
    "quote — fail이 하나라도 있으면, 문제가 된 구절을 위 검사 대상에서 **그대로 복사해** 넣는다.",
    "  지어내지 마라. 원문에 없는 문장을 quote에 넣으면 안 된다. fail이 없으면 빈 문자열.",
    "",
    "오직 JSON만 출력한다."
  ].join("\n");
}

// ── 1차 거름망: 명백한 위반은 LLM 호출 없이 잡는다 (비용 절감) ──────────
// 이것만으로는 패러프레이즈에 뚫린다. 반드시 검사 패스와 함께 쓴다.
const HARD_PATTERNS = [
  /당신(에게|의|은)\s*(어울리|맞는|잘|딱)/,
  /(당신|너)의\s*(강점|장점|매력|섬세함|재능)/,
  /관객(이|은|을)\s*(몰입|공감|사로잡)/,
  /(진정성|전달력|몰입도|자연스러움)(이|은|을|가)\s*(있|높|좋|뛰어)/,
  /\b(점수|등급|난이도|평점)\s*[:：]/,
  /(상|중|하)급\s*난이도/
];

function prefilter(out) {
  const all = [out.title, out.stage, out.body].join("\n");
  for (const re of HARD_PATTERNS) if (re.test(all)) return false;
  return true;
}

function reviewPassed(v) {
  return v &&
    v.c1_reader_description === "pass" &&
    v.c2_acting_direction === "pass" &&
    v.c3_effect_claim === "pass" &&
    v.c4_safety === "pass" &&
    v.c5_existing_work === "pass";
}

// ── 폴백: 대상 5 × 길이 3 = 15편. 사람이 쓴 확정 카피다.
// 이 경로에서는 모델 자유 생성물이 노출되지 않으므로 Constitution 원칙 III이 온전히 지켜진다.
function fallbackFor(sel) {
  const id = sel.target + "-" + sel.length;
  return FALLBACKS.find((f) => f.id === id) || FALLBACKS[0];
}

// ── 레이트리밋 ────────────────────────────────────────────────────────
// 베스트에포트 IP 제한 (warm 인스턴스 한정) + 일일 전역 상한.
// 전역 상한이 비용을 보장하는 유일한 장치다 — IP 제한은 우회되지만 이건 안 된다.
const hits = new Map();
// RATE_PER_MIN은 배포 전 감사 때만 올린다(프리뷰 한정). 프로덕션은 기본값을 유지한다 —
// 감사가 자기 방어를 우회하려고 프로덕션 설정을 바꾸면 감사의 의미가 없다.
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 8);
function ipLimited(ip) {
  const now = Date.now(), win = 60000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_PER_MIN;
}

const DAILY_MAX = Number(process.env.DAILY_MAX || 800);
let dayKey = "";
let dayCount = 0;
function globalLimited() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  dayCount += 1;
  return dayCount > DAILY_MAX;
}

// ── Gemini 호출 ───────────────────────────────────────────────────────
async function callGemini(key, model, prompt, schema, temperature) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model +
              ":generateContent?key=" + key;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: temperature
    }
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("gemini_" + r.status);
  const data = await r.json();
  const text = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  return JSON.parse(text || "{}");
}

const MAX_ATTEMPTS = 2; // FR-019: 무한 재생성 금지

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  if (ipLimited(ip)) return res.status(429).json({ error: "rate" });

  // 입력 검증이 설정 검사보다 먼저다. 잘못된 입력은 서버 상태와 무관하게 거절돼야
  // 인젝션 방어(FR-018)를 키 없이도 감사할 수 있다.
  const body = req.body || {};
  const sel = {
    length: LENGTH.includes(body.length) ? body.length : null,
    target: TARGET.includes(body.target) ? body.target : null,
    heat:   HEAT.includes(body.heat)     ? body.heat   : null,
    tone:   TONE.includes(body.tone)     ? body.tone   : null
  };
  // 구조적 입력 검증: 열거형 밖의 값은 프롬프트에 닿지 않는다.
  // 본문에 어떤 지시문이 실려 있든 여기서 버려지므로 프롬프트에 합류할 경로가 없다.
  if (!sel.length || !sel.target || !sel.heat || !sel.tone) {
    return res.status(400).json({ error: "bad_selection" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "no_key" });

  // 일일 전역 상한 도달 — 폴백으로 응답한다. 사용자에게 빈손을 남기지 않는다 (FR-009·FR-024).
  if (globalLimited()) {
    return res.status(200).json(shape(fallbackFor(sel)));
  }

  const genModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const reviewModel = process.env.GEMINI_REVIEW_MODEL || "gemini-flash-lite-latest";

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let out;
      try {
        out = await callGemini(key, genModel, buildGenPrompt(sel), GEN_SCHEMA, 1.0);
      } catch (e) { continue; }

      if (!out || !out.title || !out.stage || !out.body) continue;
      if (!prefilter(out)) continue;

      let verdict;
      try {
        verdict = await callGemini(key, reviewModel, buildReviewPrompt(out), REVIEW_SCHEMA, 0);
      } catch (e) {
        // 검사에 실패하면 통과시키지 않는다. 검사되지 않은 생성물은 노출하지 않는다.
        continue;
      }

      if (reviewPassed(verdict)) return res.status(200).json(shape(out));
    }
    // 재생성 상한 도달 — 폴백 (FR-009·FR-019)
    return res.status(200).json(shape(fallbackFor(sel)));
  } catch (e) {
    return res.status(200).json(shape(fallbackFor(sel)));
  }
};

// 클라이언트로 나가는 필드를 여기서 확정한다. 검사 결과·확신도·폴백 여부는 나가지 않는다 (FR-016).
function shape(o) {
  return { title: String(o.title || ""), stage: String(o.stage || ""), body: String(o.body || "") };
}

module.exports.__test = {
  prefilter, reviewPassed, fallbackFor, shape,
  LENGTH, TARGET, HEAT, TONE, buildGenPrompt, buildReviewPrompt
};
