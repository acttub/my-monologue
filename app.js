// 나만의 독백 — 프론트엔드
// 화면 3개(랜딩·선택·결과) + 공유 카드 canvas 렌더. 빌드 단계 없음.
"use strict";

(function () {
  var C = window.COPY;
  var sel = {};      // {length,target,heat,tone}
  var axisIdx = 0;
  var current = null; // 마지막 결과
  var genCount = 0;   // 세션 내 생성 횟수 (부드러운 제한)
  var SESSION_MAX = 10;

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
  $("c-privacy").textContent = C.privacy;
  $("c-generating").textContent = C.generating;
  $("c-generating-sub").textContent = C.generatingSub;
  $("btn-again").textContent = C.again;
  $("btn-card").textContent = C.saveCard;
  $("c-ai-notice").textContent = C.aiNotice;
  $("c-bridge-lead").textContent = C.bridgeLead;
  $("c-bridge-ask").textContent = C.bridgeAsk;
  $("btn-bridge").textContent = C.bridgeCta;
  $("btn-bridge").href = C.bridgeUrl;

  // ── 선택 흐름 ─────────────────────────────────────────────────────
  function renderAxis() {
    var ax = C.axes[axisIdx];
    $("q-text").textContent = ax.question;
    $("prog-fill").style.width = ((axisIdx) / C.axes.length * 100) + "%";
    $("btn-back").hidden = (axisIdx === 0);

    var box = $("q-options");
    box.innerHTML = "";
    // 앞 축의 선택에 따라 못 쓰는 조합은 아예 보여주지 않는다.
    // 고른 뒤에 서버가 몰래 다른 걸로 바꾸면 그건 사용자를 속이는 것이다.
    var options = ax.options.filter(function (o) {
      if (!o.unavailableFor) return true;
      return !o.unavailableFor.some(function (t) {
        return Object.keys(sel).some(function (k) { return sel[k] === t; });
      });
    });
    options.forEach(function (o) {
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
        else generate();
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

  // ── 생성 ──────────────────────────────────────────────────────────
  function generate() {
    show("s-loading");
    genCount += 1;

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sel)
    })
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.body) throw new Error("empty");
        current = data;
        renderResult(data);
      })
      .catch(function () {
        // 서버가 폴백까지 실패한 경우에만 도달. 사용자에게 빈손을 남기지 않는다.
        $("r-coord").textContent = "";
        $("r-title").textContent = C.errorTitle;
        $("r-stage").textContent = "";
        $("r-body").textContent = C.errorBody;
        show("s-result");
      });
  }

  function renderResult(d) {
    $("r-coord").textContent = C.coord(labelOf("heat", sel.heat), labelOf("target", sel.target));
    $("r-title").textContent = d.title;
    $("r-stage").textContent = d.stage;
    $("r-body").textContent = d.body;
    $("btn-again").disabled = (genCount >= SESSION_MAX);
    show("s-result");
  }

  $("btn-again").addEventListener("click", function () {
    if (genCount >= SESSION_MAX) return;
    generate();
  });

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

    g.fillStyle = "rgba(255,255,255,.92)";
    roundRect(g, PAD, 232, W - PAD * 2, H - 232 - 208, 40);
    g.fill();

    // 좌표 — 장면 설정으로 읽히는 표기 (FR-027)
    g.fillStyle = "rgba(255,255,255,.9)";
    g.font = "700 34px 'Pretendard Variable',Pretendard,sans-serif";
    g.textAlign = "center";
    g.fillText(C.coord(labelOf("heat", sel.heat), labelOf("target", sel.target)), W / 2, 148);

    g.fillStyle = "#111827";
    g.font = "800 62px 'Pretendard Variable',Pretendard,sans-serif";
    wrapText(g, current.title, W / 2, 372, W - PAD * 2 - 96, 76, 2);

    g.fillStyle = "#6B7280";
    g.font = "400 30px 'Pretendard Variable',Pretendard,sans-serif";
    wrapText(g, current.stage, W / 2, 520, W - PAD * 2 - 96, 44, 2);

    // 첫 문장만
    var first = (current.body.split(/(?<=[.!?…])\s|\n/)[0] || current.body).trim();
    g.fillStyle = "#111827";
    g.font = "700 42px 'Pretendard Variable',Pretendard,sans-serif";
    wrapText(g, "“" + first + "”", W / 2, 700, W - PAD * 2 - 96, 66, 6);

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
