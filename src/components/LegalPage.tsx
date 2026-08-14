import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type LegalPageProps = { kind: 'privacy' | 'terms' };

const privacySections = [
  ['수집·처리하는 정보', '계정 식별정보(이메일, 닉네임, 로그인 제공자), 토론 설정과 텍스트 발언, 사람 간 토론에서 녹음된 본인 음성 발언과 전사문, AI 평가·영어 코칭 결과, 서비스 이용 기록을 처리합니다.'],
  ['음성 토론 처리', '지원 브라우저에서는 마이크 발언이 브라우저의 음성 인식 서비스를 통해 실시간 전사될 수 있습니다. 실시간 인식을 지원하지 않거나 결과가 없는 경우에는 발언 종료 후 Google Gemini API를 통해 전사합니다. 음성방에서는 마이크 음성이 LiveKit을 통해 다른 참가자에게 실시간 전달됩니다. 사람 간 토론의 본인 음성 발언은 복습과 발언 모니터링을 위해 비공개 저장소에 저장되며 해당 계정 본인만 재생하거나 다운로드할 수 있습니다.'],
  ['AI 서비스 제공', '토론 답변, 평가, 시뮬레이션, 영어 표현 코칭과 음성 합성을 위해 사용자가 입력한 문맥과 발언 일부가 Google Gemini API로 전달될 수 있습니다. 민감한 개인정보는 발언에 포함하지 마세요.'],
  ['보관과 삭제', '음성 발언은 기본 90일 보관정책과 저장 용량 정책에 따라 오래된 종료 토론부터 삭제될 수 있으므로, 필요한 음성은 보관기간 안에 다운로드해야 합니다. 용량 임계치에서는 사용자별 최근 녹음을 우선 보호하며 전사문과 평가는 유지합니다. 공개 공유 링크는 사용자가 명시적으로 생성한 경우에만 만들어지고 공유 화면에는 음성 접근 권한을 제공하지 않습니다. 계정 또는 관련 데이터 삭제 요청은 아래 문의처로 접수할 수 있습니다.'],
  ['이용자의 선택', '음성 대신 텍스트 토론을 선택할 수 있고, 음성 토론 중 전사문 표시 여부를 선택할 수 있습니다. 마이크 권한은 브라우저 설정에서 언제든 철회할 수 있습니다.'],
  ['안전과 문의', '접근 권한과 사용량 제한을 적용하지만 인터넷 전송의 절대적인 안전을 보장할 수는 없습니다. 개인정보 관련 문의: piorne@naver.com'],
];

const termsSections = [
  ['서비스의 목적', 'ThinkFit은 AI 스파링, 사람 간 토론, 상황별 시뮬레이션과 학습 리포트를 제공하는 사고력 훈련 서비스입니다. AI 결과는 학습 보조 자료이며 사실성·완전성이나 전문적 판단을 보장하지 않습니다.'],
  ['계정과 책임', '이용자는 정확한 계정 정보를 사용하고 로그인 수단을 안전하게 관리해야 합니다. 다른 사람의 계정을 사용하거나 서비스의 접근 제한을 우회해서는 안 됩니다.'],
  ['사람 간 토론 규칙', '참가자는 상대방의 동의와 존엄을 존중해야 하며 모욕, 협박, 혐오, 개인정보 노출, 불법 콘텐츠 공유를 해서는 안 됩니다. 음성방 입장 전 실시간 음성 전달과 자동 전사 방식을 확인해야 합니다.'],
  ['콘텐츠와 공개', '이용자는 자신이 작성하거나 발언한 콘텐츠에 필요한 권리를 보유해야 합니다. 토론 기록은 기본적으로 본인 계정에 저장되며, 보고서나 논증은 이용자가 별도로 공개 또는 공유한 경우에만 다른 사람에게 제공됩니다.'],
  ['금지 행위', '자동화된 대량 요청, API 비용 유발, 보안 취약점 악용, 토론방 정원·역할 우회, 평가 조작, 타인의 서비스 이용 방해를 금지합니다. 위반 시 이용을 제한할 수 있습니다.'],
  ['변경과 문의', '서비스 기능과 정책은 안전성 및 운영상 필요에 따라 변경될 수 있으며 중요한 변경은 서비스 화면을 통해 안내합니다. 서비스 문의: piorne@naver.com'],
];

const englishPrivacy = [
  ['Data we process', 'We process account identifiers, debate settings and transcripts, your recorded speeches in human voice debates, AI feedback, English coaching results and basic service activity.'],
  ['Voice debates', 'Supported browsers may transcribe microphone speech in real time through their speech-recognition service. If live recognition is unavailable or produces no result, the recording is transcribed through Google Gemini after the speech. In voice rooms, microphone audio is delivered to other participants through LiveKit. Your own speeches in human debates are stored privately for review and can only be played or downloaded by your account.'],
  ['AI processing', 'Relevant prompts, debate context and speech may be sent to Google Gemini to provide responses, judging, coaching, transcription and speech synthesis. Do not include sensitive personal information in a debate.'],
  ['Retention and choices', 'Recordings use a default 90-day retention and may be removed earlier from the oldest completed debates when storage thresholds are reached. Download any recording you need before it expires. Transcripts and evaluations remain available, and shared report viewers receive no audio access. You may choose text debate, revoke microphone permission, or request deletion of your account and related data.'],
  ['Contact', 'Privacy enquiries: piorne@naver.com'],
];

const englishTerms = [
  ['Purpose', 'ThinkFit is a training service for AI sparring, live debate, simulations and learning reports. AI output is educational assistance and is not guaranteed to be complete, accurate or professional advice.'],
  ['Account responsibility', 'Keep your sign-in method secure and do not use another person’s account or bypass access controls.'],
  ['Live debate conduct', 'Respect every participant. Harassment, threats, hate, disclosure of personal information and unlawful content are prohibited. Voice debates use live audio delivery and automatic transcription.'],
  ['Content and sharing', 'You must have the right to use content you submit. Records are private to your account unless you deliberately publish an argument or create a report-sharing link.'],
  ['Prohibited use', 'Automated bulk requests, cost abuse, security exploitation, role or capacity bypass, evaluation manipulation and disruption of other users are prohibited.'],
  ['Contact', 'Service enquiries: piorne@naver.com'],
];

export const LegalPage = ({ kind }: LegalPageProps) => {
  const navigate = useNavigate();
  const isEnglish = localStorage.getItem('app-language') === 'en';
  const sections = isEnglish
    ? kind === 'privacy' ? englishPrivacy : englishTerms
    : kind === 'privacy' ? privacySections : termsSections;
  const title = isEnglish
    ? kind === 'privacy' ? 'Privacy notice' : 'Terms of service'
    : kind === 'privacy' ? '개인정보 처리 안내' : '서비스 이용약관';

  return (
    <main className="app-container page-scroll legal-page">
      <header className="legal-page-header">
        <button type="button" className="icon-button" onClick={() => navigate(-1)} aria-label={isEnglish ? 'Go back' : '뒤로 가기'}><ChevronLeft size={22} /></button>
        <div><span><ShieldCheck size={16} /> THINKFIT TRUST CENTER</span><h1>{title}</h1><p>{isEnglish ? 'Effective 14 August 2026' : '시행일 2026년 8월 14일'}</p></div>
      </header>
      <section className="legal-intro card">
        <strong>{isEnglish ? 'Please understand how your debate data is used before training.' : '훈련을 시작하기 전에 토론 데이터가 어떻게 처리되는지 확인해 주세요.'}</strong>
        <p>{isEnglish ? 'This notice describes the current product behaviour and will be updated when data handling changes.' : '이 문서는 현재 서비스 동작을 기준으로 작성되며, 데이터 처리 방식이 달라지면 함께 갱신됩니다.'}</p>
      </section>
      <div className="legal-section-list">
        {sections.map(([heading, content], index) => <section className="card" key={heading}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{heading}</h2><p>{content}</p></div></section>)}
      </div>
    </main>
  );
};
