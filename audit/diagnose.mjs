// 진단 — 생성물이 어느 검사에서 떨어지는지 로컬에서 재현한다.
//
// 서버 응답에 진단 필드를 넣으면 내부 라벨이 사용자에게 노출될 위험이 생긴다(FR-016).
// 그래서 배포된 함수를 건드리지 않고, 같은 프롬프트로 로컬에서 2패스를 돌려 분해한다.
//
//   GEMINI_API_KEY=... node audit/diagnose.mjs --n 30 --tone classic
//
// 키는 인자로 받지 않는다. 환경변수로만 넘기고 출력에 찍지 않는다.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../api/generate.js").__test;

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 환경변수 필요"); process.exit(1); }

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const N = Number(arg("n", 30));
const TONE = arg("tone", "classic");
const CONC = Number(arg("conc", 5));

const GEN_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const REV_MODEL = process.env.GEMINI_REVIEW_MODEL || "gemini-flash-lite-latest";

const GEN_SCHEMA = {
  type: "OBJECT",
  properties: { title: { type: "STRING" }, stage: { type: "STRING" }, body: { type: "STRING" } },
  required: ["title", "stage", "body"]
};
const REV_SCHEMA = {
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

async function call(model, prompt, schema, temperature) {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature }
      }) }
  );
  if (!r.ok) throw new Error("gemini_" + r.status);
  const d = await r.json();
  const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(t || "{}");
}

const pick = (a, i) => a[i % a.length];
const jobs = Array.from({ length: N }, (_, i) => ({
  length: pick(T.LENGTH, i), target: pick(T.TARGET, i), heat: pick(T.HEAT, i), tone: TONE
}));

const tally = { total: 0, genError: 0, prefilter: 0, reviewError: 0,
                c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, passed: 0 };
const failedSamples = [];

async function run(sel) {
  tally.total++;
  let out;
  try { out = await call(GEN_MODEL, T.buildGenPrompt(sel), GEN_SCHEMA, 1.0); }
  catch { tally.genError++; return; }
  if (!out?.title || !out?.stage || !out?.body) { tally.genError++; return; }

  if (!T.prefilter(out)) {
    tally.prefilter++;
    failedSamples.push({ why: "정규식 거름망", sel, out });
    return;
  }
  let v;
  try { v = await call(REV_MODEL, T.buildReviewPrompt(out), REV_SCHEMA, 0); }
  catch { tally.reviewError++; return; }

  const map = { c1: "c1_reader_description", c2: "c2_acting_direction", c3: "c3_effect_claim",
                c4: "c4_safety", c5: "c5_existing_work" };
  let failedAny = false;
  for (const [k, f] of Object.entries(map)) {
    if (v[f] === "fail") { tally[k]++; failedAny = true; }
  }
  if (failedAny) failedSamples.push({ why: "검사 " + Object.entries(map).filter(([k,f])=>v[f]==="fail").map(([k])=>k).join(","), sel, out, quote: v.quote });
  else tally.passed++;
}

let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) { await run(jobs[next++]); process.stdout.write("."); }
}));
process.stdout.write("\n");

console.log("\n=== tone=" + TONE + " n=" + tally.total + " ===");
console.log("  통과:", tally.passed, "(" + (tally.passed / tally.total * 100).toFixed(0) + "%)");
console.log("  생성 오류:", tally.genError);
console.log("  정규식 거름망 차단:", tally.prefilter);
console.log("  검사 호출 오류:", tally.reviewError);
console.log("  검사 항목별 fail:");
console.log("    c1 독자 서술:", tally.c1);
console.log("    c2 연기 처방:", tally.c2);
console.log("    c3 효과 단정:", tally.c3);
console.log("    c4 안전:", tally.c4);
console.log("    c5 실존 작품:", tally.c5);

console.log("\n=== 탈락 표본 (최대 6건) ===");
failedSamples.slice(0, 6).forEach((f, i) => {
  console.log("\n[" + (i + 1) + "] " + f.why + " / " + f.sel.target + "·" + f.sel.heat + "·" + f.sel.length);
  console.log("  제목:", f.out.title);
  console.log("  지문:", f.out.stage);
  console.log("  본문:", f.out.body.slice(0, 180));
  if (f.quote) console.log("  검사가 지목한 구절:", f.quote);
});
