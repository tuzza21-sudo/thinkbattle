type KakaoShare = {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: {
    sendDefault: (template: Record<string, unknown>) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoShare;
  }
}

const kakaoScriptUrl = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js';
const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY as string | undefined;

export const isKakaoShareConfigured = () => Boolean(kakaoJavaScriptKey);

const loadKakao = async (): Promise<KakaoShare> => {
  if (window.Kakao) return window.Kakao;

  await new Promise<void>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk]');
    if (script) {
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('카카오 SDK를 불러오지 못했습니다.')), { once: true });
      return;
    }

    const nextScript = document.createElement('script');
    nextScript.src = kakaoScriptUrl;
    nextScript.async = true;
    nextScript.dataset.kakaoSdk = 'true';
    nextScript.onload = () => resolve();
    nextScript.onerror = () => reject(new Error('카카오 SDK를 불러오지 못했습니다.'));
    document.head.appendChild(nextScript);
  });

  if (!window.Kakao) throw new Error('카카오 SDK 초기화에 실패했습니다.');
  return window.Kakao;
};

export const shareReportToKakao = async ({ title, description, url }: { title: string; description: string; url: string }) => {
  if (!kakaoJavaScriptKey) {
    throw new Error('VITE_KAKAO_JAVASCRIPT_KEY가 설정되지 않았습니다.');
  }

  const kakao = await loadKakao();
  if (!kakao.isInitialized()) kakao.init(kakaoJavaScriptKey);

  kakao.Share.sendDefault({
    objectType: 'text',
    text: `${title}\n${description}`,
    link: { mobileWebUrl: url, webUrl: url },
    buttons: [{ title: '공개 보고서 보기', link: { mobileWebUrl: url, webUrl: url } }],
  });
};

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const splitText = (value: string, size: number) => {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += size) lines.push(value.slice(index, index + size));
  return lines.slice(0, 2);
};

export const downloadReportImage = async ({ topic, score, maxScore, grade }: { topic: string; score: number; maxScore: number; grade: string }) => {
  const topicLines = splitText(topic, 21)
    .map((line, index) => `<text x="60" y="${180 + index * 42}" fill="#e8edf7" font-size="30" font-weight="700">${escapeXml(line)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071426"/><stop offset="1" stop-color="#111b3d"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <rect x="60" y="60" width="960" height="1230" rx="44" fill="#111c34" stroke="#2d476f" stroke-width="2"/>
    <text x="60" y="125" fill="#4fd1ff" font-size="28" font-weight="700">THINKFIT · 공개 토론 리포트</text>
    ${topicLines}
    <circle cx="540" cy="535" r="190" fill="none" stroke="#243b61" stroke-width="20"/>
    <circle cx="540" cy="535" r="190" fill="none" stroke="#4fd1ff" stroke-width="20" stroke-linecap="round" stroke-dasharray="900 1200" transform="rotate(-90 540 535)"/>
    <text x="540" y="520" text-anchor="middle" fill="#4fd1ff" font-size="130" font-weight="800">${escapeXml(grade)}</text>
    <text x="540" y="600" text-anchor="middle" fill="#e8edf7" font-size="48">${score} / ${maxScore}</text>
    <line x1="120" y1="820" x2="960" y2="820" stroke="#2d476f" stroke-width="2"/>
    <text x="120" y="900" fill="#e8edf7" font-size="38" font-weight="700">생각을 구조화하고, 설득력을 훈련합니다.</text>
    <text x="120" y="970" fill="#9fb0cc" font-size="30">내 토론 리포트는 thinkfit.kr에서 확인하세요.</text>
    <text x="120" y="1190" fill="#4fd1ff" font-size="28">thinkfit.kr</text>
  </svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('공유 이미지를 만들지 못했습니다.'));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  const pngUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = pngUrl;
  link.download = 'thinkfit-debate-report.png';
  link.click();
  URL.revokeObjectURL(url);
};

type SocialSummaryCategory = {
  name: string;
  score: number;
  maxScore: number;
};

export const downloadSocialSummaryImage = async ({
  topic,
  overallFeedback,
  score,
  maxScore,
  grade,
  categories,
}: {
  topic: string;
  overallFeedback: string;
  score: number;
  maxScore: number;
  grade: string;
  categories: SocialSummaryCategory[];
}) => {
  const topicLines = splitText(topic, 22);
  const feedbackLines = splitText(overallFeedback, 36);
  const visibleCategories = categories.slice(0, 7);
  const categoryRows = visibleCategories.map((category, index) => {
    const y = 805 + index * 60;
    const ratio = Math.max(0, Math.min(1, category.score / Math.max(category.maxScore, 1)));
    const fill = ratio >= 0.8 ? '#4fd1ff' : ratio >= 0.6 ? '#9f7aea' : ratio >= 0.4 ? '#ffb800' : '#ff6b8a';
    return `
      <text x="126" y="${y}" fill="#e8edf7" font-size="25" font-weight="700">${escapeXml(category.name)}</text>
      <text x="915" y="${y}" fill="${fill}" font-size="25" font-weight="800" text-anchor="end">${category.score}/${category.maxScore}</text>
      <rect x="126" y="${y + 15}" width="790" height="8" rx="4" fill="#283854"/>
      <rect x="126" y="${y + 15}" width="${Math.round(790 * ratio)}" height="8" rx="4" fill="${fill}"/>
    `;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071426"/><stop offset="1" stop-color="#192653"/></linearGradient>
      <linearGradient id="score" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4fd1ff"/><stop offset="1" stop-color="#9f7aea"/></linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <rect x="54" y="48" width="972" height="1254" rx="42" fill="#101d35" stroke="#35527c" stroke-width="2"/>
    <text x="108" y="112" fill="#4fd1ff" font-size="25" font-weight="800" letter-spacing="3">THINKFIT · DEBATE SUMMARY</text>
    ${topicLines.map((line, index) => `<text x="108" y="${180 + index * 45}" fill="#f4f7fb" font-size="34" font-weight="800">${escapeXml(line)}</text>`).join('')}
    <rect x="108" y="${250 + topicLines.length * 22}" width="864" height="2" fill="#35527c"/>
    <circle cx="540" cy="420" r="102" fill="#132744" stroke="url(#score)" stroke-width="10"/>
    <text x="540" y="413" fill="#4fd1ff" font-size="88" font-weight="900" text-anchor="middle">${escapeXml(grade)}</text>
    <text x="540" y="458" fill="#c9d5e7" font-size="24" font-weight="700" text-anchor="middle">종합 등급</text>
    <text x="540" y="566" fill="#f4f7fb" font-size="54" font-weight="900" text-anchor="middle">${score} <tspan fill="#8fa4c1" font-size="31">/ ${maxScore}</tspan></text>
    <text x="540" y="605" fill="#8fa4c1" font-size="22" font-weight="700" text-anchor="middle">TOTAL SCORE</text>
    <rect x="108" y="650" width="864" height="110" rx="18" fill="#142844" stroke="#2d496f" stroke-width="1"/>
    <text x="138" y="690" fill="#4fd1ff" font-size="22" font-weight="800">총평 요약</text>
    ${feedbackLines.map((line, index) => `<text x="138" y="${724 + index * 30}" fill="#e8edf7" font-size="24">${escapeXml(line)}</text>`).join('')}
    <text x="108" y="790" fill="#c9d5e7" font-size="24" font-weight="800">평가 항목별 점수</text>
    ${categoryRows}
    <text x="540" y="1256" fill="#4fd1ff" font-size="22" font-weight="800" text-anchor="middle">THINKFIT · 생각을 구조화하는 토론 훈련</text>
  </svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('SNS 요약 이미지를 만들지 못했습니다.'));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'thinkfit-sns-debate-summary.png';
  link.click();
  URL.revokeObjectURL(url);
};
