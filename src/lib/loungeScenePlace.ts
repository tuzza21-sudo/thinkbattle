/**
 * What counts as the same place (2026-11-18, by the owner: a chat kept moving between "모텔 방", "모텔 침대 위" and "근처 모텔 방 소파", and each wording
 * got its own background). A place is judged by the room or building it names, not by the spot in it, and a motel or a hotel the two are in is one room.
 * Shared by the engine's scene (loungeMessenger.ts) and the background that follows it (loungeSceneFollow.ts).
 */
const lodging = /모텔|호텔|숙소|여관|펜션|리조트|게스트하우스/;
// What a lodging's room is called, word by word. A lodging counts as the room only when every word of its name is one of these (2026-11-19, by the owner:
// "호텔 지하 칵테일바" was read as 호텔 객실, because a list of the places that are not the room missed the bar). Anything else in the name is another place.
const roomWord = /^(?:(?:새벽|아침|낮|점심|오후|저녁|밤|한밤)(?:의)?|(?:모텔|호텔|숙소|여관|펜션|리조트|게스트하우스)(?:의)?|근처|인근|그|이|어느|허름한|낡은|작은|조용한|넓은|좁은|고급|아늑한|어두운|낮은|높은|푹신한|안|안쪽|내부|위|옆|곁|아래|맡|자리|[가-힣]*(?:방|객실|룸|스위트|침실|침대|소파|창가|욕실|샤워실|화장실|욕조|발코니|베란다))$/;
// A spot inside a place, at the end of its name: "창가 자리", "침대 위", "낮은 소파 자리".
const spot = /(?:\s*의)?\s*(?:(?:낮은|높은|푹신한|작은|큰|긴|둥근|안쪽|바깥|한쪽|구석진)\s+)?(?:소파|침대|창가|테이블|좌석|벤치|구석|식탁|책상|카운터|바\s*자리)(?:\s*(?:위|옆|곁|앞|근처|쪽|자리|아래|맡))*$/;

/** The place without its spot: 모텔 방, 호텔 객실, or the name with the spot taken off its end. */
export function canonicalScenePlace(place: string | undefined): string {
  const text = (place ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (lodging.test(text) && text.split(' ').every(word => roomWord.test(word))) return /모텔|여관/.test(text) ? '모텔 방' : '호텔 객실';
  const stripped = text.replace(spot, '').trim();
  return stripped.length >= 2 ? stripped : text;
}

/** Whether two wordings name the same place. */
export function sameScenePlace(a: string | undefined, b: string | undefined) {
  const key = (value: string | undefined) => canonicalScenePlace(value).toLowerCase().replace(/[\s.,，。·—–\-~!?'"“”‘’()（）]/g, '');
  return Boolean(a && b) && key(a) === key(b);
}

/** A name that says nothing of where: "저녁의 조용한 실내", "밤의 사적인 공간". */
export const isGenericPlaceName = (name: string | undefined) => /^(?:(?:새벽|아침|낮|점심|오후|저녁|밤|한밤)(?:의)?\s*)?(?:(?:조용한|사적인|개인|은은한|아늑한)\s*)*(?:실내|공간|개인\s*공간|방)$/.test((name ?? '').replace(/\s+/g, ' ').trim());

/** A page of a list, for numbered pages: the items of one page, how many pages there are, and the page that exists. */
export function pageOf<T>(items: readonly T[], page: number, size = 20) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { items: items.slice((current - 1) * size, current * size), pages, page: current };
}

/**
 * The shared backgrounds a member is shown: the ones that name no place are left out, and of two that carry the same name (or the same place)
 * the more used one is kept, so the list does not repeat itself.
 */
export function distinctSharedScenes<T extends { name?: string | null; description: string; uses?: number }>(scenes: readonly T[]): T[] {
  const kept = new Map<string, T>();
  for (const scene of scenes) {
    const label = (scene.name || scene.description || '').trim();
    if (!label || isGenericPlaceName(label)) continue;
    const key = canonicalScenePlace(label).replace(/^(?:(?:새벽|아침|낮|점심|오후|저녁|밤|한밤)(?:의)?\s*)/, '').replace(/\s+/g, '');
    const earlier = kept.get(key);
    if (!earlier || (scene.uses ?? 0) > (earlier.uses ?? 0)) kept.set(key, scene);
  }
  return scenes.filter(scene => [...kept.values()].includes(scene));
}
