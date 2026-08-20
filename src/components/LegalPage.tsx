import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type LegalPageProps = { kind: 'privacy' | 'terms' };

const privacySections = [
  ['처리 목적', '회원 식별과 계정 운영, 토론·상황극 훈련 제공, 음성 전달과 전사, 맞춤 질문 및 학습 리포트 생성, 서비스 안전성 확보와 문의 대응을 위해 개인정보를 처리합니다.'],
  ['처리 항목', '이메일·닉네임·로그인 정보, 이용자가 입력한 텍스트와 음성 발언·전사문, 훈련 설정·결과·이용 기록을 처리합니다. 이력서·경력·전공·활동 정보는 이용자가 맞춤 훈련을 선택한 경우에만 처리합니다. 주민등록번호, 상세 주소, 연락처 등 훈련에 불필요한 정보는 입력하지 마세요.'],
  ['보유 및 파기', '계정 정보와 훈련 기록은 회원 탈퇴 또는 삭제 요청 시까지 보관합니다. 음성 녹음은 기본 90일 동안 보관하며 저장 용량 정책에 따라 더 일찍 삭제될 수 있습니다. 보유 목적이 끝난 정보는 복구하기 어려운 방법으로 지체 없이 파기하되, 관계 법령에 따라 보존할 필요가 있는 경우에는 해당 기간 동안 분리 보관합니다.'],
  ['외부 처리', '서비스 제공을 위해 인증, 데이터 보관, AI 분석, 음성 전사·합성 및 실시간 통신 업무의 일부를 국내외 전문 서비스 제공자에게 위탁할 수 있습니다. 이 경우 필요한 범위의 정보만 처리하고 계약과 접근 통제를 통해 보호하며, 법령상 별도 공개 또는 동의가 필요한 사항은 해당 화면이나 정책을 통해 안내합니다.'],
  ['이용자의 권리', '이용자는 자신의 개인정보 열람·정정·삭제·처리정지 및 동의 철회를 요청할 수 있습니다. 음성 대신 텍스트 훈련을 선택할 수 있고 마이크 권한은 브라우저 설정에서 언제든 철회할 수 있습니다. 공개 공유는 이용자가 직접 공유 링크를 만든 경우에만 이루어집니다.'],
  ['안전성 확보', '개인정보에 대한 접근 권한 제한, 비공개 저장, 전송 구간 보호와 사용량 제한 등 필요한 안전조치를 적용합니다.'],
  ['개인정보 문의', '개인정보 보호 담당자: 최석빈 · 문의: thinkfit99@gmail.com · 주소: 서울시 서초구 사임당로8길 13, 4층 402-331A호'],
];

const termsSections = [
  ['서비스의 목적', 'ThinkFit은 AI 스파링, 사람 간 토론, 상황별 시뮬레이션과 학습 리포트를 제공하는 사고력 훈련 서비스입니다. AI 결과는 학습 보조 자료이며 사실성·완전성이나 전문적 판단을 보장하지 않습니다.'],
  ['계정과 책임', '이용자는 정확한 계정 정보를 사용하고 로그인 수단을 안전하게 관리해야 합니다. 다른 사람의 계정을 사용하거나 서비스의 접근 제한을 우회해서는 안 됩니다.'],
  ['사람 간 토론 규칙', '참가자는 상대방의 동의와 존엄을 존중해야 하며 모욕, 협박, 혐오, 개인정보 노출, 불법 콘텐츠 공유를 해서는 안 됩니다. 음성방 입장 전 실시간 음성 전달과 자동 전사 방식을 확인해야 합니다.'],
  ['콘텐츠와 공개', '이용자는 자신이 작성하거나 발언한 콘텐츠에 필요한 권리를 보유해야 합니다. 토론 기록은 기본적으로 본인 계정에 저장되며, 보고서나 논증은 이용자가 별도로 공개 또는 공유한 경우에만 다른 사람에게 제공됩니다.'],
  ['금지 행위', '자동화된 대량 요청, API 비용 유발, 보안 취약점 악용, 토론방 정원·역할 우회, 평가 조작, 타인의 서비스 이용 방해를 금지합니다. 위반 시 이용을 제한할 수 있습니다.'],
  ['변경과 문의', '서비스 기능과 정책은 안전성 및 운영상 필요에 따라 변경될 수 있으며 중요한 변경은 서비스 화면을 통해 안내합니다. 서비스 문의: thinkfit99@gmail.com'],
];

const englishPrivacy = [
  ['Purpose', 'We process personal information to operate accounts, provide debate and simulation training, deliver and transcribe speech, create personalised questions and learning reports, maintain service security, and answer enquiries.'],
  ['Data processed', 'We process email, nickname and sign-in information; text, recorded speech and transcripts submitted during training; training settings, results and basic activity records. Resume, career, major and activity information is processed only when you choose personalised training. Do not submit information unnecessary for training.'],
  ['Retention and deletion', 'Account information and training records are retained until account deletion or a deletion request. Voice recordings are normally retained for 90 days and may be removed earlier under the storage policy. Data is securely deleted when no longer needed unless retention is required by law.'],
  ['External processing', 'We may use domestic or overseas specialist providers for authentication, data hosting, AI-assisted analysis, speech processing and real-time communications. We limit processing to what is necessary and provide any additional notice or consent required by applicable law.'],
  ['Your choices and rights', 'You may request access, correction, deletion or restriction of your information and withdraw consent. You may choose text training, revoke microphone access in your browser, and create or remove report-sharing links yourself.'],
  ['Security', 'We apply access controls, private storage, transmission safeguards and usage limits appropriate to the service.'],
  ['Contact', 'Privacy contact: Seokbin Choi · thinkfit99@gmail.com · 4F, 402-331A, 13 Saimdang-ro 8-gil, Seocho-gu, Seoul, Republic of Korea'],
];

const englishTerms = [
  ['Purpose', 'ThinkFit is a training service for AI sparring, live debate, simulations and learning reports. AI output is educational assistance and is not guaranteed to be complete, accurate or professional advice.'],
  ['Account responsibility', 'Keep your sign-in method secure and do not use another person’s account or bypass access controls.'],
  ['Live debate conduct', 'Respect every participant. Harassment, threats, hate, disclosure of personal information and unlawful content are prohibited. Voice debates use live audio delivery and automatic transcription.'],
  ['Content and sharing', 'You must have the right to use content you submit. Records are private to your account unless you deliberately publish an argument or create a report-sharing link.'],
  ['Prohibited use', 'Automated bulk requests, cost abuse, security exploitation, role or capacity bypass, evaluation manipulation and disruption of other users are prohibited.'],
  ['Contact', 'Service enquiries: thinkfit99@gmail.com'],
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
        <div><span><ShieldCheck size={16} /> THINKFIT TRUST CENTER</span><h1>{title}</h1><p>{isEnglish ? 'Effective 20 August 2026' : '시행일 2026년 8월 20일'}</p></div>
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
