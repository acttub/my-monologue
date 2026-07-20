// 오래된 독백 — 프론트엔드
//
// 완전 정적이다. 서버 호출도, LLM도, API 키도 없다.
// monologues.json(퍼블릭 도메인 원문 73편)을 받아 사용자 선택으로 걸러 하나를 보여준다.
"use strict";

(function () {
  var C = window.COPY;
  var DATA = null;
  var sel = {};
  var axisIdx = 0;
  var current = null;
  var seen = [];   // 같은 세션에서 본 것은 뒤로 미룬다

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ["s-landing", "s-select", "s-loading", "s-result"].forEach(function (s) {
      $(s).hidden = (s !== id);
    });
    window.scrollTo(0, 0);
  }
  function labelOf(axisId, optId) {
    var ax = C.axes.find(function (a) { return a.id === axisId; });
    var o = ax && ax.options.find(function (x) { return x.id === optId; });
    return o ? o.label : "";
  }

  // ── 정적 카피 주입 ────────────────────────────────────────────────
  $("c-brand").textContent = C.brand;
  $("c-tagline").textContent = C.tagline;
  $("c-sub").textContent = C.sub;
  $("btn-start").textContent = C.start;
  $("c-license").textContent = C.licenseNotice;
  $("c-loading").textContent = C.loading;
  $("btn-again").textContent = C.again;
  $("btn-card").textContent = C.saveCard;
  $("c-old-text").textContent = C.oldTextNotice;
  $("c-bridge-lead").textContent = C.bridgeLead;
  $("c-bridge-ask").textContent = C.bridgeAsk;
  $("btn-bridge").textContent = C.bridgeCta;
  $("btn-bridge").href = C.bridgeUrl;

  // ── 데이터 ────────────────────────────────────────────────────────
  var loading = fetch("/monologues.json")
    .then(function (r) { return r.json(); })
    .then(function (d) { DATA = d; });

  // ── 선택 흐름 ─────────────────────────────────────────────────────
  function renderAxis() {
    var ax = C.axes[axisIdx];
    $("q-text").textContent = ax.question;
    $("prog-fill").style.width = (axisIdx / C.axes.length * 100) + "%";
    $("btn-back").hidden = (axisIdx === 0);

    var box = $("q-options");
    box.innerHTML = "";
    ax.options.forEach(function (o) {
      var b = document.createElement("button");
      b.className = "opt";
      b.type = "button";

      var l = document.createElement("span");
      l.className = "opt-label";
      l.textContent = o.label;
      b.appendChild(l);

      if (o.hint) {
        var h = document.createElement("span");
        h.className = "opt-hint";
        h.textContent = o.hint;
        b.appendChild(h);
      }

      b.addEventListener("click", function () {
        sel[ax.id] = o.id;
        axisIdx += 1;
        if (axisIdx < C.axes.length) renderAxis();
        else pick();
      });
      box.appendChild(b);
    });
    show("s-select");
  }

  $("btn-start").addEventListener("click", function () {
    axisIdx = 0; sel = {};
    renderAxis();
  });
  $("btn-back").addEventListener("click", function () {
    if (axisIdx > 0) { axisIdx -= 1; renderAxis(); }
  });

  // ── 고르기 ────────────────────────────────────────────────────────
  function pick() {
    show("s-loading");
    loading.then(function () {
      var pool = DATA.filter(function (m) {
        return m.target === sel.target && m.length === sel.length;
      });
      if (!pool.length) {
        $("r-situation").textContent = C.empty;
        $("r-title").textContent = "";
        $("r-body").textContent = "";
        $("r-source").textContent = "";
        show("s-result");
        return;
      }
      // 이번 세션에 안 본 것 우선 — 다시 눌렀을 때 같은 게 나오지 않게
      var fresh = pool.filter(function (m) { return seen.indexOf(m.id) === -1; });
      if (!fresh.length) { seen = []; fresh = pool; }
      var m = fresh[Math.floor(Math.random() * fresh.length)];
      seen.push(m.id);
      current = m;
      render(m);
    });
  }

  function render(m) {
    $("r-situation").textContent = m.situation;
    $("r-title").textContent = m.character;
    $("r-body").textContent = m.body;
    var who = m.translator ? (m.author + " 원작 · " + m.translator + " 옮김") : m.author;
    $("r-source").textContent = m.workTitle + " (" + m.year + ") · " + who;
    $("r-source").href = m.source;
    show("s-result");
  }

  $("btn-again").addEventListener("click", pick);

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
    g.fillText(C.coord(labelOf("target", sel.target), current.workTitle), W / 2, 148);

    g.fillStyle = "#111827";
    g.font = "800 58px 'Pretendard Variable',Pretendard,sans-serif";
    g.fillText(current.character, W / 2, 366);

    g.fillStyle = "#6B7280";
    g.font = "400 29px 'Pretendard Variable',Pretendard,sans-serif";
    var y = wrapText(g, current.situation, W / 2, 452, W - PAD * 2 - 96, 44, 3);

    // 첫 문장만
    var first = (current.body.split(/(?<=[.!?…])\s/)[0] || current.body).trim();
    g.fillStyle = "#111827";
    g.font = "700 40px 'Pretendard Variable',Pretendard,sans-serif";
    wrapText(g, "“" + first + "”", W / 2, y + 72, W - PAD * 2 - 96, 64, 6);

    g.fillStyle = "#9CA3AF";
    g.font = "400 26px 'Pretendard Variable',Pretendard,sans-serif";
    g.fillText(current.workTitle + " (" + current.year + ")", W / 2, H - 300);

    g.fillStyle = "rgba(255,255,255,.95)";
    g.font = "700 34px 'Pretendard Variable',Pretendard,sans-serif";
    g.fillText("오래된 독백  ·  mono.acttub.com", W / 2, H - 108);

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
