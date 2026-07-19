// 나만의 독백 — 확정 카피
//
// 여기 있는 텍스트는 전부 사람이 쓴 것이고, 모델이 건드리지 않는다.
// 모델 자유 생성이 허용된 범위는 독백의 title·stage·body 세 필드뿐이다.
// Constitution 원칙 III을 부분적으로라도 지키기 위한 분리다.
"use strict";

window.COPY = {
  brand: "나만의 독백",
  tagline: "네 가지만 고르면, 너만 가진 독백 한 편",
  sub: "연습할 대본이 없을 때. 판정도 점수도 없이, 대본만.",

  start: "시작하기",
  generating: "쓰는 중",
  generatingSub: "20초 안쪽으로 걸려",

  // 선택 축 — 라벨은 '장면 설정'으로 읽혀야 한다. 사람의 유형으로 읽히면 안 된다 (FR-027).
  axes: [
    {
      id: "length", question: "얼마나 긴 걸로?",
      options: [
        { id: "sec30", label: "30초", hint: "짧게 감 잡기" },
        { id: "min1",  label: "1분",  hint: "가장 무난" },
        { id: "min2",  label: "2분",  hint: "길게 끌고 가기" }
      ]
    },
    {
      id: "target", question: "누구한테 말해?",
      options: [
        { id: "leaving",      label: "떠나는 사람",      hint: "아직 앞에 있다" },
        { id: "abandoned",    label: "나를 버린 사람",   hint: "이미 갔다" },
        { id: "gone",         label: "이미 없는 사람",   hint: "닿지 않는다" },
        { id: "believed",     label: "나를 믿어준 사람", hint: "빚이 있다" },
        { id: "unknown-self", label: "아직 모르는 나",   hint: "미래의 나에게" }
      ]
    },
    {
      id: "heat", question: "이 장면의 온도는?",
      options: [
        // unavailableFor: 앞 축에서 이 대상을 고른 경우 이 선택지를 보여주지 않는다.
        //
        // gone(이미 없는 사람) × burst(터뜨린다)는 배포 전 감사에서 제거됐다.
        // 이 조합은 "왜 나를 두고 갔느냐"는 분노를 요구하는데, 사고사·병사라면
        // "무책임·선택·도망" 같은 말이 성립하지 않는다. 즉 고인을 비난 가능한
        // 주체로 세워야 성립하고, 그 비난이 곧 자살 암시로 미끄러진다.
        // 어휘를 막으면 완곡어로 갈아타고(→"당신의 선택"), 의미로 물어도
        // 유서 구조 같은 서사 형태가 빠져나갔다. 프롬프트로 못 막는 구조라 뺐다.
        // 감사 기록: specs/001-my-monologue/audit-2026-07-19.md
        { id: "burst",    label: "터뜨린다", unavailableFor: ["gone"] },
        { id: "hold",     label: "참는다" },
        { id: "persuade", label: "설득한다" },
        { id: "collapse", label: "무너진다" }
      ]
    },
    {
      id: "tone", question: "말투는?",
      options: [
        { id: "now",     label: "지금 쓰는 말", hint: "현대 구어" },
        { id: "classic", label: "문어체",       hint: "고전풍" }
      ]
    }
  ],

  again: "다시 만들기",
  saveCard: "카드 저장",

  // FR-005: 사용자의 상태·이해도를 단정하지 않는 질문형.
  // 초안의 단정형("아직 네 안에 없어")은 관찰 없이 단정하므로 폐기했다.
  bridgeLead: "대본은 나왔어.",
  bridgeAsk: "이 인물이 왜 이 말을 하는지, 너는 뭐라고 답할 수 있어?",
  bridgeCta: "연기해보고 acttub에서 질문으로 찾기",
  bridgeUrl: "https://acttub.com/?utm_source=my-monologue&utm_medium=subproject&utm_campaign=bridge",

  aiNotice: "이 대본은 AI가 쓴 오리지널 창작물입니다. 기존 작품의 대사가 아닙니다.",
  privacy: "고른 선택 외에는 아무것도 저장하지 않습니다.",

  errorTitle: "지금은 안 되네",
  errorBody: "잠시 뒤에 다시 눌러줘.",

  // 공유 카드의 좌표 표기. '참는 사람'이 아니라 '참는다 × 이미 없는 사람'이어야 한다 —
  // 앞은 사람의 유형이고 뒤는 장면 설정이다. 유형 라벨은 Constitution II 위반이다 (FR-027).
  coord: function (heatLabel, targetLabel) {
    return heatLabel + " × " + targetLabel;
  }
};
