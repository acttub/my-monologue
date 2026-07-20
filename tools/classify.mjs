// 추출된 독백 후보를 빌드 타임에 분류하고 안전 판정한다.
//
// ★ 이 서비스의 핵심 설계: LLM은 **여기서만** 돈다. 런타임에는 호출이 없다.
//
// AI 오리지널 생성 방식은 안전 감사 9회를 통과하지 못했다. 매 회차 위반이 새로운
// 형태로 나타났고, 마지막에는 방어 규칙 자체가 다음 우회 경로를 만들었다.
// 근본 원인은 "런타임에 새 텍스트가 만들어진다"는 것이었다 — 무한한 출력을
// 유한한 규칙으로 막으려 한 것이다.
//
// 큐레이션은 그 전제를 없앤다. 텍스트가 유한하고 고정이므로:
//   · 전수 검토가 가능하다 (100편 미만)
//   · 런타임 지연·비용·인젝션 위험이 0이다
//   · 검사층이 뚫릴 수 있다는 걱정 자체가 사라진다
//
//   GEMINI_API_KEY=... node tools/classify.mjs
//   → monologues.json (통과분만)

import { readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 필요"); process.exit(1); }
const MODEL = process.env.CLASSIFY_MODEL || "gemini-3.5-flash";

const cands = JSON.parse(readFileSync(new URL("./extracted.json", import.meta.url), "utf8"));

const SCHEMA = {
  type: "OBJECT",
  properties: {
    standalone: { type: "STRING", enum: ["yes", "no"] },
    target:     { type: "STRING", enum: ["confront", "plead", "confess", "recall", "resolve"] },
    heat:       { type: "STRING", enum: ["burst", "hold", "persuade", "collapse"] },
    safe:       { type: "STRING", enum: ["yes", "no"] },
    unsafe_quote: { type: "STRING" },
    situation:  { type: "STRING" }
  },
  required: ["standalone", "target", "heat", "safe", "situation"]
};

function prompt(m) {
  return [
    "아래는 1910~1930년대 한국에서 출판된 희곡의 대사 한 토막이다.",
    "연기 연습용 독백으로 쓸 수 있는지 판정하고 분류한다.",
    "",
    "작품: " + m.workTitle + " (" + m.year + ") · 인물: " + m.character,
    "",
    "=== 대사 ===",
    m.body,
    "=== 끝 ===",
    "",
    "판정할 것:",
    "",
    "1) standalone — 앞뒤 맥락 없이 이 토막만 읽어도 독백으로 성립하는가?",
    "   yes: 말하는 사람의 처지와 상대가 짐작되고, 하나의 덩어리로 읽힌다",
    "   no: 앞 대사에 대한 짧은 응수라 혼자서는 뜻이 안 통한다",
    "",
    "2) target — 이 말의 성격은?",
    "   confront(따진다) / plead(호소·간청) / confess(속을 털어놓는다) /",
    "   recall(지난 일을 이야기한다) / resolve(마음을 정하고 선언한다)",
    "",
    "3) heat — 장면의 온도?",
    "   burst(터뜨린다) / hold(참고 눌러둔다) / persuade(설득한다) / collapse(무너진다)",
    "",
    "4) safe — 오늘날 미성년 연기 지망생에게 그대로 보여줘도 되는가?",
    "   ★ 시대 배경상 위험한 표현이 실제로 들어 있다. 엄격하게 본다.",
    "   no로 판정할 것:",
    "     · 죽고 싶다·죽어버리겠다 등 자기 죽음에 대한 소망",
    "     · 자살·자해의 암시나 묘사",
    "     · 여성 비하나 폭력을 정당한 것으로 그리는 대목",
    "       (인물이 그 부당함을 말하는 것은 yes다. 부당함을 옹호하는 말이 no다)",
    "       예: '계집을 이렇게 상전같이 섬기는 놈은 나밖에 없을 걸' — 아내의 사회 진출을",
    "           웃음거리로 만드는 쪽에 화자가 서 있으므로 no다.",
    "       반대로 「규한」의 여인이 시집살이의 부당함을 토로하는 것은 yes다.",
    "     · 성적인 내용, 축첩·유흥업 알선. 성병을 부도덕의 대가로 그리는 것도 no다",
    "     · **장애를 웃음거리로 삼거나 흉내 내는 것**",
    "       귀머거리·벙어리·병신 같은 멸칭, 장애인 행세로 이득을 보는 상황.",
    "       연기 연습 소재로 주면 '장애인 흉내 내기'를 시키는 셈이 된다. 반드시 no.",
    "     · 특정 민족·계층·집단 전체를 멸시하는 서술",
    "       (개인의 악행을 고발하는 것은 yes, 집단을 싸잡는 것은 no)",
    "       예: 증거 없이 '하인놈의 짓인 게지'라고 단정하는 계층 편견",
    "     · 우생학적 결정론 — 성품·행실을 '혈통'이나 '유전'으로 규정하는 말",
    "   yes로 둘 것: 슬픔·분노·원망·억울함·신세한탄 자체. 시대적 고통의 서술.",
    "   no면 unsafe_quote에 문제가 되는 구절을 원문에서 그대로 옮긴다.",
    "",
    "5) situation — 이 대사를 연기할 사람이 알아야 할 상황을 한 문장으로.",
    "   인물이 처한 사정과 상대만 적는다. 어떻게 연기하라는 말은 절대 적지 마라.",
    "   ★ 인물의 내면 상태를 수식어로 붙이지 마라. 이것도 연기 지시다:",
    "     '불안감을 억누르며' / '담담하게' / '격정적으로' / '떨리는 마음으로'",
    "   상황만 적으면 그 정서는 배우가 알아서 찾는다. 그게 이 서비스의 원칙이다.",
    "   좋음: '남편에게 버림받고 시댁에 남겨진 여인이 시누이에게 속을 털어놓는다'",
    "   좋음: '비밀이 드러날 처지에 놓인 여자가 크리스마스 저녁 혼자 남아 우편함을 살핀다'",
    "   나쁨: '슬픔을 억누르며 담담하게 말한다' / '불안감을 억누르며 스스로를 안심시킨다'",
    "",
    "오직 JSON만 출력한다."
  ].join("\n");
}

// 재시도가 없으면 일시적 오류로 원문이 조용히 유실된다. 실제로 한 번에 13편을 잃었다.
// 데이터셋은 재현 가능해야 하므로 여기서 반드시 복구한다.
async function classifyOnce(m) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL +
              ":generateContent?key=" + KEY;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(m) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 }
    })
  });
  if (!r.ok) throw new Error("gemini_" + r.status);
  const d = await r.json();
  const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("empty_response");
  return JSON.parse(txt);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function classify(m) {
  let last;
  for (let i = 0; i < 4; i++) {
    try { return await classifyOnce(m); }
    catch (e) { last = e; await sleep(800 * Math.pow(2, i)); }
  }
  throw last;
}

const CONC = 5;
const out = [];
const dropped = { notStandalone: 0, unsafe: [], error: 0 };
let next = 0;

await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < cands.length) {
    const m = cands[next++];
    let v;
    try { v = await classify(m); }
    catch { dropped.error++; process.stdout.write("!"); continue; }

    if (v.standalone !== "yes") { dropped.notStandalone++; process.stdout.write("·"); continue; }
    if (v.safe !== "yes") {
      dropped.unsafe.push({ work: m.workTitle, character: m.character, quote: v.unsafe_quote || "" });
      process.stdout.write("x");
      continue;
    }
    out.push({
      id: m.work + "-" + String(out.length + 1).padStart(3, "0"),
      work: m.work,
      workTitle: m.workTitle,
      author: m.author,
      translator: m.translator,
      year: m.year,
      license: m.license,
      source: m.source,
      character: m.character,
      target: v.target,
      heat: v.heat,
      length: m.chars < 200 ? "short" : "long",
      chars: m.chars,
      situation: v.situation,
      body: m.body
    });
    process.stdout.write(".");
  }
}));
process.stdout.write("\n");

console.error("\n=== 분류 결과 ===");
console.error("  후보:", cands.length);
console.error("  채택:", out.length);
console.error("  탈락 — 독백 미성립:", dropped.notStandalone);
console.error("  탈락 — 안전:", dropped.unsafe.length);
dropped.unsafe.forEach((u) => console.error(`      ${u.work}·${u.character}: ${u.quote.slice(0, 60)}`));
console.error("  오류:", dropped.error);

const cells = {};
out.forEach((m) => { const k = m.target + "×" + m.heat; cells[k] = (cells[k] || 0) + 1; });
console.error("\n  조합별 분포:", JSON.stringify(cells));

writeFileSync(new URL("../monologues.json", import.meta.url), JSON.stringify(out, null, 2));
console.error("\n  → monologues.json 저장");
