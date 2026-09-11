export const openingFields = ['position', 'criterion', 'claim1', 'reason1', 'evidence1', 'impact1', 'claim2', 'reason2', 'evidence2', 'impact2'] as const;
export type OpeningField = typeof openingFields[number];
export type OpeningDraft = Record<OpeningField, string>;

export const openingLabels: Record<'ko' | 'en', Record<OpeningField, string>> = {
  ko: { position: '나의 입장', criterion: '판단 기준', claim1: '핵심 주장 1', reason1: '이유 1', evidence1: '근거나 사례 1', impact1: '중요성 1', claim2: '핵심 주장 2', reason2: '이유 2', evidence2: '근거나 사례 2', impact2: '중요성 2' },
  en: { position: 'My position', criterion: 'Judging criterion', claim1: 'Claim 1', reason1: 'Reason 1', evidence1: 'Evidence 1', impact1: 'Impact 1', claim2: 'Claim 2', reason2: 'Reason 2', evidence2: 'Evidence 2', impact2: 'Impact 2' },
};

export function parseOpeningDraft(value: string): OpeningDraft {
  const fields = Object.fromEntries(openingFields.map(key => [key, ''])) as OpeningDraft;
  const labelMap = new Map(Object.values(openingLabels).flatMap(labels => openingFields.map(key => [labels[key], key] as const)));
  const normalized = value.replace(/\r\n/g, '\n');
  const headers = [...normalized.matchAll(/^\[([^\]\n]+)\]$/gm)].filter(match => labelMap.has(match[1]));
  if (!headers.length) return { ...fields, claim1: value };
  fields.claim1 = normalized.slice(0, headers[0].index).replace(/\n\n$/, '');
  headers.forEach((match, index) => {
    const key = labelMap.get(match[1])!;
    const start = match.index + match[0].length + (normalized[match.index + match[0].length] === '\n' ? 1 : 0);
    const nextIndex = headers[index + 1]?.index;
    let text = normalized.slice(start, nextIndex);
    if (nextIndex !== undefined) text = text.replace(/\n\n$/, '');
    fields[key] += `${fields[key] ? '\n\n' : ''}${text}`;
  });
  return fields;
}

export function serializeOpeningDraft(fields: OpeningDraft, language: 'ko' | 'en' = 'ko'): string {
  return openingFields.filter(key => fields[key].trim()).map(key => `[${openingLabels[language][key]}]\n${fields[key]}`).join('\n\n');
}
