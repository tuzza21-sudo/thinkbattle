import { generateDebateResponse } from './src/lib/api.js';

async function test() {
  console.log("Testing generateDebateResponse...");
  try {
    const res = await generateDebateResponse(
      "기본 소득제 도입",
      [{
        id: "1",
        playerId: "p1",
        isAi: false,
        content: "기본 소득제란 모든 국민에게 조건 없이 일정한 금액을 지급하는 제도입니다.",
        timestamp: "00:00",
        roundId: "opening",
        roundTitle: "논제 확인 및 용어 정리"
      }],
      "affirmative",
      "opening",
      600,
      600,
      "intermediate",
      "policy"
    );
    console.log("Response:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
