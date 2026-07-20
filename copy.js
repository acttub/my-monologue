// 오래된 독백 — 확정 카피
//
// 사용자에게 보이는 고정 텍스트는 전부 여기 있다.
// 독백 본문은 monologues.json의 퍼블릭 도메인 원문이고, 그 밖의 모든 문장은 이 파일에서 나온다.
// 런타임에 생성되는 텍스트는 없다.
"use strict";

window.COPY = {
  brand: "오래된 독백",
  tagline: "백 년 전 대사로 연습하기",
  sub: "저작권 걱정 없는 근대 희곡에서 골라 드려요. 판정도 점수도 없이, 대본만.",

  start: "골라보기",
  loading: "찾는 중",

  // 선택 축 1개. 데이터가 정하는 구조다 —
  // target×length 2축으로 나누면 한 칸에 1편만 남는 조합이 생겨 "다른 독백"이 무의미해진다.
  // target 단독이면 칸마다 7~20편이라 다시 눌러도 새 것이 나온다. 길이는 결과에 표시한다.
  axes: [
    {
      id: "target", question: "어떤 말을 해보고 싶어?",
      options: [
        { id: "confront", label: "따진다",           hint: "상대의 잘못을 짚는다" },
        { id: "plead",    label: "사정한다",         hint: "간절히 부탁한다" },
        { id: "confess",  label: "털어놓는다",       hint: "속내를 꺼낸다" },
        { id: "recall",   label: "지난 일을 말한다", hint: "겪은 일을 들려준다" },
        { id: "resolve",  label: "마음을 정한다",    hint: "결심을 밝힌다" }
      ]
    }
  ],

  // 결과 화면
  lenShort: "30초 안팎",
  lenLong: "1분 안팎",
  sourceLabel: "출처",
  again: "다른 독백",
  saveCard: "카드 저장",

  // 원문 표기 안내 — 1912~1934년 텍스트라 미리 알려준다.
  oldTextNotice: "발표 당시의 표기를 그대로 두었습니다. 낯선 말은 소리 내어 읽으면 대개 뜻이 통해요.",

  // 저작권 투명성. 퍼블릭 도메인이어도 출처를 밝히는 것이 원칙이다.
  licenseNotice: "저작권 보호기간이 끝난 작품입니다. 원문은 위키문헌에서 가져왔습니다.",

  // FR-005: 사용자의 상태·이해도를 단정하지 않는 질문형.
  bridgeLead: "대본은 찾았어.",
  bridgeAsk: "이 사람이 왜 이 말을 하는지, 너는 뭐라고 답할 수 있어?",
  bridgeCta: "연기해보고 acttub에서 질문으로 찾기",
  bridgeUrl: "https://acttub.com/?utm_source=my-monologue&utm_medium=subproject&utm_campaign=bridge",

  empty: "이 조합에는 아직 준비된 독백이 없어. 다른 걸 골라볼래?",

  // 공유 카드의 좌표 표기. 사람의 유형이 아니라 고른 장면 설정으로 읽혀야 한다.
  coord: function (targetLabel, workTitle) {
    return targetLabel + " · " + workTitle;
  }
};
