// 퍼블릭 도메인 희곡에서 독백 후보를 추출한다.
//
// 왜 이 파일이 저장소에 있나: 데이터셋(monologues.json)을 손으로 만들면 출처를 잃는다.
// 원문 URL과 라이선스 템플릿까지 함께 뽑아 두어야 나중에 저작권을 재확인할 수 있다.
//
//   node tools/extract.mjs > tools/extracted.json
//
// 출처는 전부 ko.wikisource.org이고, 각 문서의 PD 템플릿을 확인해 기록한다.
// 판정 규칙: 2013년 경과규정 때문에 **작가와 번역자 둘 다 1962년 이전 사망**이어야 만료다.

const WORKS = [
  {
    id: "byeongja",
    title: "병자삼인",
    author: "조중환",
    authorDied: 1944,
    translator: null,
    year: 1912,
    page: "병자삼인",
    format: "wikitext",
    license: "PD-old-50",
    note: "한국 최초의 창작 희곡"
  },
  {
    id: "gyuhan",
    title: "규한",
    author: "이광수",
    authorDied: 1950,
    translator: null,
    year: 1917,
    page: "규한",
    format: "wikitext",
    license: "PD-old-50"
  },
  {
    id: "doll",
    title: "인형의 집",
    author: "헨리크 입센",
    authorDied: 1906,
    translator: "박용철",
    translatorDied: 1938,
    year: 1934,
    page: "박용철 산문집/인형의 집",
    format: "rendered",
    license: "PD-old-70",
    note: "극예술연구회 제6회 공연 대본"
  },
  {
    id: "merchant",
    title: "베니스의 상인",
    author: "윌리엄 셰익스피어",
    authorDied: 1616,
    translator: "박용철",
    translatorDied: 1938,
    year: 1934,
    page: "박용철 산문집/베니스의 상인",
    format: "rendered",
    license: "PD-old-70",
    note: "법정 장면 발췌본"
  }
];

const API = "https://ko.wikisource.org/w/api.php";

async function fetchRaw(page) {
  const u = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(page)}&action=raw`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("raw " + r.status + " " + page);
  return r.text();
}

async function fetchRendered(page) {
  const u = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("parse " + r.status + " " + page);
  const d = await r.json();
  return d.parse.text;
}

function stripHtml(html) {
  let t = html;
  t = t.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, "");
  t = t.replace(/<\/(p|div|dd|dt|h[1-6]|li)>/g, "\n");
  t = t.replace(/<br[^>]*>/g, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return t;
}

// 지문(괄호)·주석·한자병기를 걷어낸 순수 대사
function cleanSpeech(s) {
  return String(s)
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\([^)]{0,80}\)/g, " ")       // 지문·한자병기
    .replace(/[​﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 위키텍스트 희곡 형식: ";인물" 다음 ":대사"
function parseWikitext(t) {
  const out = [];
  let cur = null;
  for (const L of t.split("\n")) {
    if (/^;/.test(L)) {
      if (cur) out.push(cur);
      cur = { who: cleanSpeech(L.slice(1)), text: "" };
    } else if (/^:/.test(L) && cur) {
      cur.text += (cur.text ? " " : "") + L.slice(1).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

// 렌더본 형식: 한 줄에 "인물 대사"
const KNOWN_CHARS = ["노라", "헬머", "린데", "크록스타", "랑크", "안네", "엘렌", "짐꾼",
                     "안토니오", "밧사니오", "샤일록", "포—샤", "포샤", "공작", "그라시아노",
                     "쎌러리오", "서기", "네릿사"];

function parseRendered(t) {
  const out = [];
  for (const raw of t.split("\n")) {
    const L = raw.replace(/[​﻿]/g, "").trim();
    if (!L || L.startsWith(".mw-")) continue;
    const who = KNOWN_CHARS.find((c) => L.startsWith(c));
    if (!who) continue;
    const text = L.slice(who.length).trim();
    if (text) out.push({ who, text });
  }
  return out;
}

const results = [];
for (const w of WORKS) {
  let speeches;
  try {
    if (w.format === "wikitext") speeches = parseWikitext(await fetchRaw(w.page));
    else speeches = parseRendered(stripHtml(await fetchRendered(w.page)));
  } catch (e) {
    console.error(`[extract] ${w.title} 실패: ${e.message}`);
    continue;
  }

  const cands = speeches
    .map((s, i) => ({ ...s, body: cleanSpeech(s.text), idx: i }))
    .filter((s) => s.body.length >= 120)
    .map((s) => ({
      work: w.id,
      workTitle: w.title,
      author: w.author,
      translator: w.translator || null,
      year: w.year,
      license: w.license,
      source: `https://ko.wikisource.org/wiki/${encodeURIComponent(w.page)}`,
      character: s.who,
      chars: s.body.length,
      body: s.body
    }));

  console.error(`[extract] ${w.title}: 대사 ${speeches.length} → 120자+ ${cands.length}`);
  results.push(...cands);
}

console.error(`[extract] 총 후보 ${results.length}편`);
console.log(JSON.stringify(results, null, 2));
