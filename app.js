// 나만의 독백 — 프론트엔드
//
// 질문 4개로 재료를 받아 서버리스에 보내고, 돌아온 독백을 보여준다.
// 답은 저장하지 않는다 — 메모리에만 있고 새로고침하면 사라진다.
"use strict";

(function () {
  var C = window.COPY;
  var Q = C.questions;
  var answers = {};
  var qIdx = 0;
  var current = null;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ["s-landing", "s-ask", "s-loading", "s-result", "s-crisis"].forEach(function (s) {
      $(s).hidden = (s !== id);
    });
    window.scrollTo(0, 0);
  }
  function whoLabel() {
    var o = Q[0].options.find(function (x) { return x.id === answers.who; });
    return o ? o.label : "";
  }

  // ── 정적 카피 주입 ────────────────────────────────────────────────
  $("c-brand").textContent = C.brand;
  $("c-tagline").textContent = C.tagline;
  $("c-sub").textContent = C.sub;
  $("btn-start").textContent = C.start;
  $("c-ai-notice").textContent = C.aiNotice;
  $("c-ai-notice-2").textContent = C.aiNotice;
  $("c-loading").textContent = C.loading;
  $("c-loading-sub").textContent = C.loadingSub;
  $("btn-next").textContent = C.next;
  $("btn-back").textContent = C.back;
  $("btn-again").textContent = C.again;
  $("btn-card").textContent = C.saveCard;
  $("c-bridge-lead").textContent = C.bridgeLead;
  $("c-bridge-ask").textContent = C.bridgeAsk;
  $("btn-bridge").textContent = C.bridgeCta;
  $("btn-bridge").href = C.bridgeUrl;
  $("c-crisis-title").textContent = C.crisisTitle;
  $("c-crisis-body").textContent = C.crisisBody;
  $("btn-crisis-back").textContent = C.crisisBack;
  C.crisisLines.forEach(function (t) {
    var li = document.createElement("li");
    li.textContent = t;
    $("c-crisis-lines").appendChild(li);
  });

  // ── 질문 흐름 ─────────────────────────────────────────────────────
  function renderQ() {
    var q = Q[qIdx];
    $("q-text").textContent = q.q;
    $("prog-fill").style.width = (qIdx / Q.length * 100) + "%";
    $("btn-back").hidden = (qIdx === 0);

    var box = $("q-options");
    box.innerHTML = "";

    if (q.type === "choice") {
      $("q-answer").hidden = true;
      box.hidden = false;
      q.options.forEach(function (o) {
        var b = document.createElement("button");
        b.className = "opt";
        b.type = "button";
        b.textContent = o.label;
        b.addEventListener("click", function () { answers[q.id] = o.id; advance(); });
        box.appendChild(b);
      });
    } else {
      box.hidden = true;
      $("q-answer").hidden = false;
      var input = $("q-input");
      input.value = answers[q.id] || "";
      input.maxLength = q.max;
      $("q-hint").textContent = q.hint;
      setTimeout(function () { input.focus(); }, 50);
    }
    show("s-ask");
  }

  function submitText() {
    var q = Q[qIdx];
    var v = $("q-input").value.trim();
    if (!v) return;
    answers[q.id] = v;
    advance();
  }

  function advance() {
    qIdx += 1;
    if (qIdx < Q.length) renderQ();
    else generate();
  }

  $("btn-next").addEventListener("click", submitText);
  $("q-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submitText(); }
  });
  $("btn-start").addEventListener("click", function () {
    qIdx = 0; answers = {};
    renderQ();
  });
  $("btn-back").addEventListener("click", function () {
    if (qIdx > 0) { qIdx -= 1; renderQ(); }
  });
  $("btn-crisis-back").addEventListener("click", function () {
    qIdx = 0; answers = {};
    show("s-landing");
  });

  // ── 생성 ──────────────────────────────────────────────────────────
  function generate() {
    show("s-loading");
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers)
    })
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.json();
      })
      .then(function (d) {
        if (d && d.crisis) { show("s-crisis"); return; }
        if (!d || !d.body) throw new Error("empty");
        current = d;
        render(d);
      })
      .catch(function () {
        $("r-lead").textContent = "";
        $("r-title").textContent = C.errorTitle;
        $("r-stage").textContent = "";
        $("r-body").textContent = C.errorBody;
        $("r-source").hidden = true;
        show("s-result");
      });
  }

  function render(d) {
    // 생성된 것과 고전 폴백을 구분해서 말한다. 남의 글을 "네 이야기"라고 하면 안 된다.
    $("r-lead").textContent = d.mine ? C.resultLead : C.fallbackLead;
    $("r-title").textContent = d.title;
    $("r-stage").textContent = d.stage;
    $("r-body").textContent = d.body;

    var src = $("r-source");
    if (!d.mine && d.source) {
      var who = d.source.translator
        ? (d.source.author + " 원작 · " + d.source.translator + " 옮김")
        : d.source.author;
      src.textContent = d.source.workTitle + " (" + d.source.year + ") · " + who;
      src.href = d.source.url;
      src.hidden = false;
    } else {
      src.hidden = true;
    }
    show("s-result");
  }

  $("btn-again").addEventListener("click", generate);

  // ── 공유 카드 (1080×1440, 인스타 3:4) ─────────────────────────────
  $("btn-card").addEventListener("click", function () {
    if (!current) return;
    var cv = $("card-canvas");
    var g = cv.getContext("2d");
    var W = 1080, H = 1440, PAD = 88;

    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0355F1");
    grad.addColorStop(1, "#44C0FD");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    g.fillStyle = "rgba(255,255,255,.94)";
    roundRect(g, PAD, 232, W - PAD * 2, H - 232 - 208, 40);
    g.fill();

    g.fillStyle = "rgba(255,255,255,.9)";
    g.font = "700 34px 'Pretendard Variable',Pretendard,sans-serif";
    g.textAlign = "center";
    g.fillText(current.mine ? C.coord(whoLabel()) : current.source.workTitle, W / 2, 148);

    g.fillStyle = "#111827";
    g.font = "800 56px 'Pretendard Variable',Pretendard,sans-serif";
    var y = wrapText(g, current.title, W / 2, 370, W - PAD * 2 - 96, 70, 2);

    g.fillStyle = "#6B7280";
    g.font = "400 29px 'Pretendard Variable',Pretendard,sans-serif";
    y = wrapText(g, current.stage, W / 2, y + 30, W - PAD * 2 - 96, 44, 2);

    // 첫 문장만
    var first = (current.body.split(/(?<=[.!?…])\s/)[0] || current.body).trim();
    g.fillStyle = "#111827";
    g.font = "700 40px 'Pretendard Variable',Pretendard,sans-serif";
    wrapText(g, "“" + first + "”", W / 2, y + 60, W - PAD * 2 - 96, 64, 6);

    g.fillStyle = "rgba(255,255,255,.95)";
    g.font = "700 34px 'Pretendard Variable',Pretendard,sans-serif";
    g.fillText("나만의 독백  ·  mono.acttub.com", W / 2, H - 108);

    cv.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "monologue-card.png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, "image/png");
  });

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // 한국어는 어절 단위로 끊는다. maxLines 초과분은 말줄임.
  function wrapText(g, text, cx, y, maxW, lh, maxLines) {
    var words = String(text).split(" ");
    var lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, "") + "…";
    }
    lines.forEach(function (ln, i) { g.fillText(ln, cx, y + i * lh); });
    return y + lines.length * lh;
  }
})();
