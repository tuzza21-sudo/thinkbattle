/**
 * What counts as the same place (2026-11-18, by the owner: a chat kept moving between "모텔 방", "모텔 침대 위" and "근처 모텔 방 소파", and each wording
 * got its own background). A place is judged by the room or building it names, not by the spot in it, and a motel or a hotel the two are in is one room.
 * Shared by the engine's scene (loungeMessenger.ts) and the background that follows it (loungeSceneFollow.ts).
 */
const lodging = /모텔|호텔|숙소|여관|펜션|리조트|게스트하우스/;
// Parts of a lodging that are not its room: the two are somewhere else in it, or outside it.
const notTheRoom = /로비|라운지|카페|바\b|레스토랑|식당|연회장|볼룸|수영장|사우나|헬스|복도|엘리베이터|주차장|옥상|루프탑|정원|입구|앞$|앞\s|밖|골목|거리|가는\s*길|오는\s*길|프런트|프론트|조식/;
// A spot inside a place, at the end of its name: "창가 자리", "침대 위", "낮은 소파 자리".
const spot = /(?:\s*의)?\s*(?:(?:낮은|높은|푹신한|작은|큰|긴|둥근|안쪽|바깥|한쪽|구석진)\s+)?(?:소파|침대|창가|테이블|좌석|벤치|구석|식탁|책상|카운터|바\s*자리)(?:\s*(?:위|옆|곁|앞|근처|쪽|자리|아래|맡))*$/;

/** The place without its spot: 모텔 방, 호텔 객실, or the name with the spot taken off its end. */
export function canonicalScenePlace(place: string | undefined): string {
  const text = (place ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (lodging.test(text) && !notTheRoom.test(text)) return /모텔|여관/.test(text) ? '모텔 방' : '호텔 객실';
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
