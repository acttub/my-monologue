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
  // 「베니스의 상인」은 뺐다. 확보된 3편이 전부 법정 장면인데, 샤일록을 "무도한 유대인"으로
  // 부르며 집단 전체를 말이 통하지 않는 자연재해에 빗대고, 강제 개종을 판결 조건으로 내건다.
  // 극 전체 맥락(샤일록이 받은 모욕)이 잘려나간 발췌라 민족 멸칭만 남는다. 원문이라는 사실이
  // 그 문장을 중립화하지 못한다. 2026-07-20 전수 검토 판정.
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
  let t = String(s)
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");

  // HTML 엔티티를 문자로 되돌린다. 이걸 빼먹으면 본문에 "&#32;&#8203;"가 그대로 노출된다
  // (2026-07-20 전수 검토에서 14편에서 발견). 숫자 엔티티는 두 번 인코딩된 경우도 있어
  // &amp; 를 먼저 푼 뒤 다시 처리한다.
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  t = t.replace(/&(nbsp|lt|gt|quot|apos);/g, (_, e) =>
    ({ nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'" }[e]));

  // 지문 제거. 길이 제한을 두지 않는다 — 긴 지문이 본문에 통째로 들어온 사례가 있었다
  // (화자를 3인칭으로 묘사하는 문장을 화자가 읽게 된다).
  t = t.replace(/\([^()]*\)/g, " ");
  t = t.replace(/\([^()]*\)/g, " ");   // 중첩 괄호 1단계 더

  return t
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")   // 폭 없는 문자
    .replace(/\s+([,.!?…])/g, "$1")                 // 한자 병기 제거 후 남는 공백
    .replace(/\s+/g, " ")
    .trim();
}

// 지문이 본문에 섞여 들어왔는지 — 괄호를 지운 뒤에도 3인칭 서술이 남는 경우가 있다.
function looksLikeStageDirection(body) {
  return /(하며|하면서)\s*(퇴장|등장)|은\/는\s*.{0,20}(하다|한다)\.|눈짓과 기침으로/.test(body);
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
    .filter((s) => !looksLikeStageDirection(s.body))
    // 끝맺지 않은 토막은 뺀다. 쉼표나 줄표로 끝나면 다음 대사로 이어지는 조각이다.
    .filter((s) => !/[,、―—\-]$/.test(s.body.trim()))
    // 현대 폰트가 렌더하지 못하는 옛한글 자모가 든 편은 뺀다. 원문을 고치지 않는 대신
    // 화면에 안 보이는 글자가 나오는 편을 배제한다 (예: 1934년 표기의 인명 "아ᅄᅡ—르").
    .filter((s) => !/[\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/.test(s.body))
    // 한자가 남은 편은 뺀다. 53편 중 2편만 한자를 달고 있어 표기가 어긋났다.
    // 소리 내어 읽는 용도라 읽기 곤란한 글자가 섞이면 안 된다.
    .filter((s) => !/[\u4E00-\u9FFF]/.test(s.body))
    // 말줄임표로 끝나는 토막은 뺀다. 문장이 완결되지 않아 뜻이 안 통한다.
    .filter((s) => !/(…|\.\.\.|‥)\s*$/.test(s.body.trim()))
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
