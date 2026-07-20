// 데이터·구조 검증 — 배포 전 실행.
//
//   node audit/check.mjs
//
// 생성 방식이었을 때는 "모델 출력이 새는가"를 검사했다. 큐레이션에서는 검사 대상이 바뀐다:
// 텍스트가 고정이므로 안전은 전수 검토로 한 번에 끝나고, 여기서는 **데이터가 온전한가**를 본다.
// 출처·라이선스 누락, 빈 칸, 연기 지시 혼입 — 사람이 매번 눈으로 볼 수 없는 것들이다.

import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const data = JSON.parse(readFileSync(new URL("monologues.json", root), "utf8"));
const copySrc = readFileSync(new URL("copy.js", root), "utf8");
const appSrc = readFileSync(new URL("app.js", root), "utf8");
const htmlSrc = readFileSync(new URL("index.html", root), "utf8");

let failed = 0;
const ok = (m) => console.log("  ✓ " + m);
const bad = (m) => { console.log("  ✗ " + m); failed++; };

console.log("\n[1] 데이터 무결성");
{
  const need = ["id", "workTitle", "author", "year", "license", "source", "character",
                "target", "heat", "length", "situation", "body"];
  const missing = data.filter((m) => need.some((k) => !m[k]));
  missing.length ? bad(`필수 필드 누락 ${missing.length}건: ${missing.slice(0,3).map(m=>m.id).join(", ")}`)
                 : ok(`${data.length}편 전부 필수 필드 완비`);

  const ids = data.map((m) => m.id);
  new Set(ids).size === ids.length ? ok("id 중복 없음") : bad("id 중복");

  const empty = data.filter((m) => m.body.trim().length < 100);
  empty.length ? bad(`본문이 100자 미만인 항목 ${empty.length}건`) : ok("본문 길이 정상");
}

console.log("\n[2] 저작권 — 출처와 라이선스가 모든 항목에 있는가");
{
  const noSrc = data.filter((m) => !/^https:\/\/ko\.wikisource\.org\//.test(m.source));
  noSrc.length ? bad(`출처 URL 이상 ${noSrc.length}건`) : ok("전 항목이 위키문헌 출처를 가짐");

  const okLic = ["PD-old-50", "PD-old-70"];
  const badLic = data.filter((m) => !okLic.includes(m.license));
  badLic.length ? bad(`알 수 없는 라이선스: ${[...new Set(badLic.map(m=>m.license))].join(", ")}`)
                : ok("라이선스가 전부 PD 템플릿");

  // 작가·번역자가 둘 다 1962년 이전 사망이어야 한다는 규칙은 tools/extract.mjs의
  // WORKS 표에 사망연도로 박혀 있다. 여기서는 작품 목록이 그 표를 벗어나지 않았는지만 본다.
  const known = ["병자삼인", "규한", "인형의 집", "베니스의 상인"];
  const unknown = [...new Set(data.map((m) => m.workTitle))].filter((t) => !known.includes(t));
  unknown.length ? bad(`저작권 확인 안 된 작품: ${unknown.join(", ")} — 작가·번역자 사망연도를 확인하라`)
                 : ok("확인된 4개 작품 안에서만 나옴");
}

console.log("\n[3] situation 필드에 연기 지시가 섞였는가");
{
  // "어떻게 연기하라"는 지시. 상황 서술과 구분된다.
  const DIRECTION = /(억누르며|참으며|떨리는 목소리|목소리를 (높|낮)|감정을 (터뜨|폭발)|울먹이며|천천히 말한다|낮게 시작|담담하게 (말|읊)|격정적으로)/;
  const hits = data.filter((m) => DIRECTION.test(m.situation));
  hits.length ? bad(`연기 지시 혼입 ${hits.length}건: ${hits.slice(0,2).map(m=>m.id).join(", ")}`)
              : ok("전 항목이 상황 서술만 담음");
}

console.log("\n[4] 선택 조합이 전부 채워졌는가");
{
  const TARGETS = ["confront", "plead", "confess", "recall", "resolve"];
  const LENGTHS = ["short", "long"];
  const empty = [];
  const counts = [];
  for (const t of TARGETS) for (const l of LENGTHS) {
    const n = data.filter((m) => m.target === t && m.length === l).length;
    counts.push(`${t}/${l}=${n}`);
    if (n === 0) empty.push(`${t}×${l}`);
  }
  empty.length ? bad(`빈 조합: ${empty.join(", ")} — 사용자가 고르면 결과가 없다`)
               : ok(`10칸 전부 채워짐 (최소 ${Math.min(...counts.map(c=>+c.split("=")[1]))}편)`);
}

console.log("\n[5] 런타임에 LLM·외부 호출이 없는가 (이 설계의 핵심)");
{
  const callsApi = /\/api\/|generativelanguage|openai|anthropic|GEMINI_API_KEY/.test(appSrc);
  callsApi ? bad("app.js가 외부 API를 호출한다 — 큐레이션 설계가 깨졌다")
           : ok("app.js에 외부 호출 없음");

  const onlyLocal = (appSrc.match(/fetch\(([^)]*)\)/g) || [])
    .every((f) => /monologues\.json/.test(f));
  onlyLocal ? ok("fetch는 monologues.json 하나뿐")
            : bad("app.js에 예상 밖의 fetch가 있다");

  const hasApiDir = (() => { try { readFileSync(new URL("api/generate.js", root)); return true; } catch { return false; } })();
  hasApiDir ? bad("api/ 서버리스 함수가 남아 있다") : ok("서버리스 함수 없음 — 정적 사이트");
}

console.log("\n[6] 카피 — 노출 문자열이 copy.js 밖에 박혀 있는가");
{
  // 화면에 보이는 한국어가 HTML에 직접 들어가면 안 된다(빈 태그 + JS 주입이 원칙).
  const inHtml = htmlSrc
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta[^>]*>/g, "")
    .match(/>([^<>{}]*[가-힣][^<>{}]*)</g) || [];
  const leaked = inHtml.map((s) => s.slice(1, -1).trim()).filter((s) => s && s !== "뒤로");
  leaked.length ? bad(`HTML에 박힌 문구 ${leaked.length}건: ${leaked.slice(0,3).join(" / ")}`)
                : ok("노출 문자열이 copy.js에 모여 있음");

  ["bridgeAsk", "licenseNotice", "oldTextNotice"].forEach((k) => {
    copySrc.includes(k) ? null : bad(`copy.js에 ${k} 없음`);
  });
  ok("필수 카피 항목 존재");

  // 전환 문구는 사용자의 상태를 단정하지 않는 질문형이어야 한다.
  const askLine = (copySrc.match(/bridgeAsk:\s*"([^"]*)"/) || [])[1] || "";
  /\?$/.test(askLine.trim()) ? ok("전환 문구가 질문형")
                             : bad(`전환 문구가 단정형이다: "${askLine}"`);
}

console.log(failed ? `\n실패 ${failed}건\n` : "\n전 항목 통과\n");
process.exit(failed ? 1 : 0);
