/**
 * The tarot deck 이한결 reads at 홍실당 (2026-11-05, 상담 phase 1): 78 cards, each with what it means upright and reversed.
 * The cards are drawn on the server with a cryptographic random number (api/lounge.ts passes one in), never chosen by a
 * language model, so the reading cannot be bent toward what the member wants to hear. The meanings are short keywords of
 * the common Rider-Waite-Smith reading, written anew in Korean; the interpreter weaves them into the member's question.
 */
export type LoungeTarotCard = { id: string; name: string; ko: string; upright: string; reversed: string };
export type LoungeTarotSpread = 'one' | 'three';
export type LoungeTarotDrawn = { position: string; id: string; name: string; ko: string; reversed: boolean; meaning: string };

const majors: ReadonlyArray<[string, string, string, string]> = [
  ['The Fool', '바보', '새로운 시작, 모험, 순수한 용기', '무모함, 준비 부족, 망설임'],
  ['The Magician', '마법사', '실행력, 가진 재능을 쓸 때, 주도권', '재능 낭비, 말만 앞섬, 계획만 많음'],
  ['The High Priestess', '여사제', '직관, 아직 드러나지 않은 것, 기다림', '감춘 속마음, 직관을 무시함, 비밀'],
  ['The Empress', '여황제', '풍요, 돌봄, 관계가 무르익음', '지나친 의존, 정체, 자기 돌봄 부족'],
  ['The Emperor', '황제', '안정, 책임, 질서', '통제욕, 고집, 윗사람과의 충돌'],
  ['The Hierophant', '교황', '전통, 조언자, 정해진 길', '틀을 깨고 싶음, 맞지 않는 규칙'],
  ['The Lovers', '연인', '끌림, 선택, 마음이 맞음', '엇갈린 선택, 불균형, 가치관 충돌'],
  ['The Chariot', '전차', '밀고 나가는 힘, 승리, 의지', '방향을 잃음, 조급함, 통제가 안 됨'],
  ['Strength', '힘', '부드러운 인내, 용기, 감정 다스리기', '자신감 부족, 감정이 터짐'],
  ['The Hermit', '은둔자', '혼자 돌아볼 시간, 성찰', '고립, 외면, 지나치게 혼자 있음'],
  ['Wheel of Fortune', '운명의 수레바퀴', '흐름이 바뀜, 전환점, 기회', '엇나간 타이밍, 되풀이되는 패턴'],
  ['Justice', '정의', '공정함, 균형, 원인과 결과', '불공정, 책임 회피, 한쪽으로 치우침'],
  ['The Hanged Man', '매달린 사람', '멈춤, 관점 바꾸기, 기다림', '쓸데없는 희생, 미루기'],
  ['Death', '죽음', '한 시기의 끝과 새 시작, 정리, 변화(실제 죽음과는 상관없다)', '놓지 못함, 변화를 거부함'],
  ['Temperance', '절제', '조화, 속도 조절, 회복', '불균형, 과함, 조급함'],
  ['The Devil', '악마', '집착, 유혹, 끊기 어려운 습관', '벗어나기 시작함, 묶인 걸 알아차림'],
  ['The Tower', '탑', '갑작스러운 변화, 무너지는 착각', '피해 간 위기, 미뤄 둔 변화'],
  ['The Star', '별', '희망, 회복, 다시 믿음', '실망, 자신감 상실'],
  ['The Moon', '달', '불안, 모호함, 숨은 사정', '오해가 풀림, 진실이 드러남'],
  ['The Sun', '태양', '기쁨, 성공, 솔직함', '잠시 흐린 기쁨, 지나친 낙관'],
  ['Judgement', '심판', '깨달음, 다시 부르는 목소리, 결단', '자기 비판, 결정을 미룸'],
  ['The World', '세계', '완성, 한 사이클의 끝, 성취', '마무리 부족, 미완성'],
];

const suits: ReadonlyArray<[string, string]> = [['Wands', '완드'], ['Cups', '컵'], ['Swords', '소드'], ['Pentacles', '펜타클']];
const ranks: ReadonlyArray<[string, string]> = [['Ace', '에이스'], ['Two', '2'], ['Three', '3'], ['Four', '4'], ['Five', '5'], ['Six', '6'], ['Seven', '7'], ['Eight', '8'], ['Nine', '9'], ['Ten', '10'], ['Page', '시종'], ['Knight', '기사'], ['Queen', '여왕'], ['King', '왕']];
// Upright and reversed for each rank of each suit, in the order of `ranks`. Wands are passion and work, cups feelings and
// relationships, swords thoughts and words, pentacles money and everyday life.
const minorMeanings: Record<string, ReadonlyArray<[string, string]>> = {
  Wands: [
    ['새 열정, 시작하고 싶은 일', '시작이 늦어짐, 의욕이 떨어짐'], ['계획, 더 큰 그림, 선택 앞', '망설임, 익숙한 데 머묾'],
    ['확장, 기다리던 소식, 앞을 봄', '지연, 기대가 어긋남'], ['축하, 안정된 기반, 환영', '들뜬 분위기 속 불안, 흔들리는 기반'],
    ['경쟁, 의견 충돌, 소란', '갈등 피하기, 속으로 쌓이는 다툼'], ['인정, 성과, 칭찬', '인정받지 못함, 자만'],
    ['내 자리를 지킴, 방어', '지침, 압박에 밀림'], ['빠른 진행, 소식, 속도', '지연, 엇갈린 연락'],
    ['버팀, 경계, 마지막 고비', '지침, 의심, 지나친 방어'], ['짐이 많음, 책임 과다', '짐 내려놓기, 번아웃'],
    ['호기심, 새 소식, 탐색', '산만함, 시작만 함'], ['열정적인 돌진, 모험', '성급함, 변덕'],
    ['자신감, 매력, 따뜻한 리더십', '질투, 자신감이 흔들림'], ['비전, 결단력, 이끄는 힘', '독단, 성급한 결정'],
  ],
  Cups: [
    ['새 감정, 마음이 열림', '감정이 막힘, 마음을 닫음'], ['서로 통함, 연결, 끌림', '엇갈림, 한쪽으로 기운 관계'],
    ['축하, 친구, 즐거운 모임', '지나침, 겉도는 관계'], ['권태, 무관심, 놓치는 기회', '다시 생긴 관심, 새로운 시선'],
    ['상실감, 지난 일에 대한 후회', '회복의 시작, 남은 것을 봄'], ['추억, 옛 인연, 순수함', '과거에 머묾, 놓아줄 때'],
    ['많은 선택지, 환상, 상상', '현실을 봄, 선택이 분명해짐'], ['떠남, 더 의미 있는 것을 찾아감', '떠나지 못함, 방황'],
    ['만족, 바라던 일이 이뤄짐', '겉만 만족, 채워지지 않음'], ['정서적 행복, 가족 같은 안정', '기대와 다른 관계, 균열'],
    ['설레는 마음, 감정 표현', '서툰 감정, 서운함'], ['고백, 다가옴, 낭만', '말뿐인 낭만, 변덕'],
    ['공감, 따뜻함, 직관', '감정 과잉, 의존'], ['감정 조절, 성숙한 배려', '감정을 억누름, 휘두름'],
  ],
  Swords: [
    ['명확한 판단, 진실, 결단', '혼란, 오판'], ['결정을 미룸, 교착', '결정할 때, 정보가 너무 많음'],
    ['상처, 아픈 말, 이별의 아픔', '회복 중, 상처를 놓아줌'], ['휴식, 회복, 잠시 멈춤', '쉬지 못함, 다시 움직일 때'],
    ['이겨도 남는 게 없는 싸움, 갈등', '화해 시도, 갈등 정리'], ['힘든 시기를 벗어나 이동함', '벗어나지 못함, 풀리지 않은 일'],
    ['숨김, 혼자 해결하려 함, 전략', '들킴, 솔직해짐'], ['스스로 묶임, 갇힌 느낌', '벗어남, 새로운 관점'],
    ['걱정, 잠 못 듦, 머릿속 불안', '불안이 줄어듦, 털어놓음'], ['바닥을 찍음, 한 국면의 끝', '회복의 시작, 최악은 지남'],
    ['경계, 정보 수집, 호기심', '뒷말, 성급한 말'], ['직설, 빠른 행동, 돌진', '무례함, 충동'],
    ['냉철함, 분명한 선', '차가움, 날 선 말'], ['논리, 공정한 판단', '냉혹함, 고집스러운 원칙'],
  ],
  Pentacles: [
    ['새 기회, 현실적인 시작', '놓친 기회, 계획 부족'], ['균형 잡기, 여러 일 병행', '과부하, 우선순위 혼란'],
    ['협업, 실력을 인정받음', '손발이 안 맞음, 평가가 박함'], ['지킴, 안정 추구, 아낌', '집착, 지나친 통제'],
    ['어려움, 소외감, 결핍', '회복, 도움의 손길'], ['주고받음, 도움, 나눔', '기운 관계, 조건 붙은 호의'],
    ['기다림, 중간 점검, 인내', '조급함, 성과가 더딤'], ['성실, 숙련, 꾸준함', '반복에 지침, 완벽주의'],
    ['자립, 여유, 스스로 이룬 것', '겉치레, 과한 소비'], ['오래가는 안정, 가족, 기반', '가족 갈등, 기반이 흔들림'],
    ['배움, 성실한 시작', '게으름, 집중 부족'], ['꾸준함, 신중한 진행', '지나친 느림, 정체'],
    ['실용적인 돌봄, 안정', '자기 소홀, 일 중독'], ['현실적인 성공, 풍요, 신뢰', '물질 집착, 고집'],
  ],
};

export const loungeTarotDeck: readonly LoungeTarotCard[] = [
  ...majors.map(([name, ko, upright, reversed], index) => ({ id: `major-${index}`, name, ko, upright, reversed })),
  ...suits.flatMap(([suit, suitKo]) => ranks.map(([rank, rankKo], index) => ({
    id: `${suit.toLowerCase()}-${index + 1}`, name: `${rank} of ${suit}`, ko: `${suitKo} ${rankKo}`,
    upright: minorMeanings[suit][index][0], reversed: minorMeanings[suit][index][1],
  }))),
];

export const loungeTarotPositions: Record<LoungeTarotSpread, readonly string[]> = { one: ['오늘의 답'], three: ['과거', '현재', '미래'] };

/**
 * Draws distinct cards for a spread, each upright or reversed. `randomInt(n)` returns an integer from 0 to n-1; the server
 * passes node:crypto's randomInt so the draw is neither predictable nor steerable.
 */
export function drawLoungeTarot(spread: LoungeTarotSpread, randomInt: (max: number) => number): LoungeTarotDrawn[] {
  const pool = [...loungeTarotDeck];
  return loungeTarotPositions[spread].map(position => turned(position, pool.splice(randomInt(pool.length), 1)[0], randomInt));
}
const turned = (position: string, card: LoungeTarotCard, randomInt: (max: number) => number): LoungeTarotDrawn => {
  const reversed = randomInt(2) === 1;
  return { position, id: card.id, name: card.name, ko: card.ko, reversed, meaning: reversed ? card.reversed : card.upright };
};

/** The deck in a new order (Fisher-Yates with the given random source), as card ids: the cards laid face down. */
export function shuffleLoungeTarot(randomInt: (max: number) => number): string[] {
  const ids = loungeTarotDeck.map(card => card.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}

/**
 * The cards the member picked from the face-down deck (`order`, from shuffleLoungeTarot), one per position of the spread.
 * A pick that is out of range or repeated is replaced by the next card not taken, so a spread is always complete.
 */
export function loungeTarotFromPicks(spread: LoungeTarotSpread, order: readonly string[], picks: readonly number[], randomInt: (max: number) => number): LoungeTarotDrawn[] {
  const taken = new Set<number>();
  return loungeTarotPositions[spread].map((position, index) => {
    let at = picks[index];
    if (!Number.isInteger(at) || at < 0 || at >= order.length || taken.has(at)) at = order.findIndex((_, i) => !taken.has(i));
    taken.add(at);
    return turned(position, loungeTarotDeck.find(card => card.id === order[at]) ?? loungeTarotDeck[0], randomInt);
  });
}
