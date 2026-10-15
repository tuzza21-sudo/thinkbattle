import { ChevronLeft, Coffee, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LoungeBusinessFooter } from './LoungeBusinessFooter';
import './LoungeLegal.css';

type LegalPageProps = { kind: 'privacy' | 'terms' };

const privacySections = [
  ['처리 목적', '사석 회원·게스트 식별과 계정 운영, 대화방 입장과 인원·연령대 안내, 캐릭터와의 텍스트·음성 대화 제공, 음성 전달과 전사, 캐릭터가 이전 대화를 기억하는 기능, 대화방 안전 관리(경고·발언 제한), 신고·분쟁 처리, 문의 대응을 위해 개인정보를 처리합니다.'],
  ['처리 항목', '이메일·닉네임·성별·로그인 정보(카카오·구글 로그인 시 해당 서비스가 제공하는 계정 정보), 게스트로 입장한 경우 임시 계정 정보, 가입 시 입력한 연령대·지역·자기소개(필수 항목)를 처리합니다. 대화 중에는 입력한 텍스트, 음성 발언과 전사문, 대화방 주제, 입장한 대화방과 이용 기록, 안전 관리를 위한 경고·제한 이력, 친구 목록·별점·차단 목록·쪽지, 최근 접속 시각을 처리합니다. 주민등록번호, 상세 주소, 연락처 등 대화에 불필요한 정보는 입력하지 마세요.'],
  ['대화방과 다른 참가자', '같은 대화방의 참가자에게는 닉네임, 프로필 사진, 성별별 인원수, 연령대 제한(해당하는 경우), 대화 내용이 보입니다. 이메일과 계정 정보는 다른 참가자에게 공개되지 않습니다. 대화방에서 말한 내용은 다른 참가자와 AI 캐릭터가 볼 수 있으니 민감한 개인정보는 말하지 마세요.'],
  ['프로필·친구·평가·쪽지', '선택해서 입력한 나이대·지역·자기소개는 같은 대화방에 있거나 있었던 회원과 친구로 담은 회원에게 프로필로 보입니다. 대화가 끝난 뒤 다음에 또 이야기하고 싶은 사람을 친구 목록에 담을 수 있고, 함께한 사람에게 1~5점의 별점을 남길 수 있습니다. 프로필에는 평균 별점과 평가한 사람 수만 보이며(3명 이상 모이면 평균 표시), 누가 남겼는지는 공개되지 않습니다. 최근 접속 시각과 지금 참여 중인 대화방(AI와의 1:1 대화 제외)은 나를 친구로 담은 회원에게 보이며 프로필 수정에서 끌 수 있습니다. 쪽지는 보낸 사람과 받는 사람만 볼 수 있고 30일 뒤 삭제됩니다. 차단하면 서로 쪽지를 보낼 수 없고 친구에서 빠집니다. 게스트는 이 기능을 쓸 수 없습니다.'],
  ['AI 캐릭터와 대화 기억', '캐릭터는 AI로 만든 가상의 인물이며 사람이 아닙니다. 대화 내용은 답변 생성을 위해 AI 서비스 제공자에게 전송됩니다. 1:1 대화에서는 캐릭터가 이후 대화에서 활용할 수 있도록 프로젝트·취향·결정 등 유용한 내용의 짧은 요약과 캐릭터와의 관계 상태를 이용자 계정에 연결해 저장할 수 있으며, 민감한 주제는 저장 전에 걸러냅니다. 한 캐릭터의 기억은 다른 캐릭터에게 공유되지 않습니다. 이 기록의 삭제를 원하시면 문의처로 요청해 주세요.'],
  ['음성', '마이크로 말하면 음성이 전사를 위해 AI 음성 인식 서비스로 전달되고, 캐릭터의 음성 답변은 합성 음성으로 만들어 재생합니다. 음성 대신 텍스트로 대화할 수 있으며 마이크 권한은 브라우저 설정에서 언제든 철회할 수 있습니다. 합성 음성은 실제 사람의 목소리가 아닙니다.'],
  ['라운지 프로필 사진', '선택한 사진은 브라우저에서 정사각형으로 줄여 비공개 저장소에 보관하며 외부 AI 서비스로 전송하지 않습니다. 이용자가 동의하고 적용한 사진만 저장하고, 대화방 참가자는 최대 2시간 유효한 이미지 링크를 통해 이를 볼 수 있습니다. 사진 첨부 없이도 가입할 수 있고 본인 사진이 아니어도 됩니다. 얼굴이 나온 사진은 알아볼 수 있으니 공개해도 괜찮은 사진만 올려 주세요.'],
  ['보유 및 파기', '계정 정보와 캐릭터 기억·관계 기록, 프로필 소개, 친구 목록, 별점, 차단 목록은 회원 탈퇴 또는 삭제 요청 시까지 보관합니다. 쪽지는 보낸 날부터 30일 뒤 삭제합니다. 대화방과 그 메시지는 신고 처리와 안전 관리를 위해 방이 종료된 뒤 30일 동안 보관하고 이후 자동으로 삭제됩니다. 운영자의 대화 열람 기록(열람자·시각·대상)은 1년간 보관합니다. 게스트 임시 계정은 별도 가입 없이 사용되며 이용 기록은 서비스 운영 범위에서 정리됩니다. 보유 목적이 끝난 정보는 복구하기 어려운 방법으로 지체 없이 파기하되, 관계 법령에 따라 보존할 필요가 있는 경우에는 해당 기간 동안 분리 보관합니다.'],
  ['외부 처리', '서비스 제공을 위해 인증과 데이터 보관(Supabase), AI 답변 생성·음성 전사·음성 합성(OpenAI), 소셜 로그인(카카오·구글), 서비스 호스팅 업무의 일부를 국내외 전문 서비스 제공자에게 위탁할 수 있습니다. 이 경우 필요한 범위의 정보만 처리하고 계약과 접근 통제를 통해 보호하며, 법령상 별도 공개 또는 동의가 필요한 사항은 해당 화면이나 정책을 통해 안내합니다.'],
  ['이용자의 권리', '이용자는 자신의 개인정보 열람·정정·삭제·처리정지 및 동의 철회를 요청할 수 있습니다. 프로필 사진은 언제든 바꾸거나 지울 수 있습니다.'],
  ['안전성 확보', '개인정보에 대한 접근 권한 제한, 비공개 저장, 전송 구간 보호와 사용량 제한 등 필요한 안전조치를 적용합니다.'],
  ['광고 성과 측정', '사석은 광고 성과를 측정하기 위해 메타(Meta Platforms)의 픽셀과 전환 API를 사용합니다. 방문한 화면, 가입 완료·첫 대화·일정 시간 이상 이어진 대화 같은 이용 행동, 광고 클릭 정보와 브라우저 식별값(쿠키), 가입한 회원의 경우 처음 방문한 경로(광고 캠페인 태그, 연결한 사이트, 첫 화면)와 암호화(해시)한 이메일과 계정 식별값이 메타로 전송됩니다. 대화 내용, 음성, 프로필 소개는 전송하지 않습니다. 브라우저의 "추적 안 함" 설정으로 거부할 수 있고, 메타의 광고 설정에서 맞춤 광고를 끌 수 있습니다.'],
  ['개인정보 문의', '개인정보 보호 담당자: 최석빈 · 문의: ask.saseok@gmail.com · 주소: 서울시 서초구 사임당로8길 13, 4층 402-331A호'],
];

const termsSections = [
  ['서비스의 목적', '사석은 AI로 만든 가상의 캐릭터와 다른 이용자가 함께 대화하는 공간입니다. 이용자는 장소를 고르고 대화방을 열거나 참여해 캐릭터의 도움을 받으며 이야기를 나눌 수 있습니다. 캐릭터는 사람이 아니며, 캐릭터의 말은 대화 상대로서의 응답일 뿐 사실성·완전성이나 의료·법률·재무 등 전문적 판단을 보장하지 않습니다.'],
  ['계정과 책임', '이용자는 정확한 계정 정보를 사용하고 로그인 수단을 안전하게 관리해야 합니다. 게스트로 입장할 수 있지만 게스트의 캐릭터와의 관계와 기록은 계정에 이어지지 않을 수 있습니다. 다른 사람의 계정을 사용하거나 서비스의 접근 제한을 우회해서는 안 됩니다.'],
  ['대화방 이용 규칙', '참가자는 상대방의 동의와 존엄을 존중해야 하며 모욕, 협박, 성희롱, 혐오, 개인정보 노출, 불법 콘텐츠 공유를 해서는 안 됩니다. 방장은 대화방의 주제와 연령대 제한을 정할 수 있으며, 연령대 제한은 연령대 정보를 입력한 이용자에게 적용됩니다. 대화방의 정원은 6명이며 자리가 가득 차면 대기할 수 있습니다. 음성 대화는 실시간 전달과 자동 전사 방식으로 이루어집니다.'],
  ['베타 기간 이용 시간', '베타 기간에는 운영 비용과 안정성을 위해 하루 이용 시간을 제한할 수 있습니다. 제한은 캐릭터와의 1:1 대화와 함께하는 대화방에 따로 적용되며, 대화방 화면에 오늘 남은 시간이 표시됩니다. 시간을 다 쓰면 그날의 대화가 끝나고 다음 날(한국 시간 자정) 다시 이용할 수 있습니다. 제한 시간과 적용 대상은 서비스 운영 상황에 따라 바뀔 수 있습니다.'],
  ['친구·평가·쪽지', '별점은 함께 대화한 분에게만 남길 수 있으며, 허위 평가나 보복성 평가를 해서는 안 됩니다. 쪽지로 욕설, 협박, 성적 불쾌감을 주는 내용, 광고·스팸, 개인정보 요구를 보내서는 안 됩니다. 원치 않는 상대는 프로필에서 차단할 수 있으며, 규칙을 어긴 경우 기능 이용을 제한할 수 있습니다. 문의처로 신고해 주세요.'],
  ['안전 관리', '대화방의 대화는 안전을 위해 자동으로 점검될 수 있습니다. 신고 접수, 분쟁 처리, 안전 점검에 필요한 경우 운영자가 보관 기간(30일) 안의 대화방 대화 내용과 참가 기록을 열람할 수 있으며, 열람할 때마다 열람자와 시각, 대상이 기록됩니다. 규칙을 어긴 경우 경고하거나 일정 기간 발언을 제한할 수 있으며, 반복되거나 심각한 경우 이용을 제한할 수 있습니다.'],
  ['콘텐츠와 공개', '이용자는 자신이 입력하거나 발언한 내용에 필요한 권리를 보유해야 합니다. 대화방에서 말한 내용은 같은 방의 다른 참가자와 AI 캐릭터에게 보입니다. 프로필 사진은 같은 대화방의 다른 참가자에게 그대로 보입니다. 타인의 사진이나 초상권을 침해하는 이미지, 선정적이거나 불법적인 이미지를 올려서는 안 되며, 이를 올린 경우 사진을 지우거나 기능 이용을 제한할 수 있습니다.'],
  ['금지 행위', '자동화된 대량 요청, API 비용 유발, 보안 취약점 악용, 정원·연령대 제한 우회, 캐릭터를 조작해 부적절한 답을 이끌어내는 행위, 타인의 서비스 이용 방해를 금지합니다. 위반 시 이용을 제한할 수 있습니다.'],
  ['변경과 문의', '서비스는 테스트 오픈 중이며 기능과 정책은 안전성 및 운영상 필요에 따라 변경될 수 있습니다. 중요한 변경은 서비스 화면을 통해 안내합니다. 서비스 문의: ask.saseok@gmail.com'],
];

const englishPrivacy = [
  ['Purpose', 'We process personal information to identify members and guests, operate accounts, let you enter rooms, deliver text and voice conversations with AI characters, transcribe speech, let characters remember earlier conversations, keep rooms safe (warnings and speaking restrictions), and answer enquiries.'],
  ['Data processed', 'We process email, nickname, gender and sign-in information (including account details provided by Kakao or Google if you use them), temporary account information if you enter as a guest, and the age group, region and introduction you enter at signup (required). During conversations we process the text you write, spoken words and transcripts, room topics, rooms you join, activity records, safety warnings or restrictions, your friends list, ratings, block list, notes, and your last-seen time. Do not share information unnecessary for conversation, such as ID numbers, detailed addresses or phone numbers.'],
  ['Rooms and other participants', 'Others in the same room can see your nickname, profile photo, headcount by gender, any age-group limit, and what you say. Your email and account details are not shown to other participants. What you say in a room is visible to other participants and the AI character, so do not share sensitive personal information.'],
  ['Profile, friends, ratings and notes', 'The age group, region and introduction you choose to add are shown on your profile to members who are or were in a room with you and to members you add as friends. After a conversation you can add people you want to talk with again to your friends list and give people you talked with 1 to 5 stars. A profile shows only the average and the number of ratings (the average appears from three ratings) and never who gave them. Your last-seen time and the room you are in (never a one-to-one conversation with an AI) are visible to members who added you as a friend, and you can turn this off in your profile. Notes are visible only to sender and recipient and are deleted after 30 days. Blocking stops notes both ways and removes the friendship. Guests cannot use these features.'],
  ['AI characters and memory', 'Characters are fictional people created by AI, not real people. Conversation content is sent to an AI provider to generate replies. In one-to-one conversations a character may store short summaries of useful details (such as projects, preferences and decisions) and a relationship state linked to your account for later conversations; sensitive topics are filtered before saving. One character’s memories are not shared with another. To have these records deleted, contact us.'],
  ['Voice', 'When you speak, your audio is sent to an AI speech recognition service for transcription, and a character’s spoken reply is produced as synthetic speech. You may use text instead of voice and revoke microphone access in your browser at any time. Synthetic voices are not real people’s voices.'],
  ['Lounge profile photos', 'Your selected photo is resized to a square in your browser and kept in private storage; it is not sent to any AI service. Only a photo you agree to and apply is saved, and room participants can see it through an image link valid for up to two hours. Adding a photo is optional and it does not have to be your own. A photo of a face can be recognized, so only upload a photo you are comfortable sharing.'],
  ['Retention and deletion', 'Account information, character memory and relationship records, your profile introduction, friends list, ratings and block list are retained until account deletion or a deletion request. Notes are deleted 30 days after they are sent. Rooms and their messages are kept for 30 days after a room ends, for handling reports and keeping the lounge safe, and then deleted automatically. Records of staff opening a conversation (who, when and for whom) are kept for one year. Guest accounts are temporary and cleaned up as part of service operation. Data is securely deleted when no longer needed unless retention is required by law.'],
  ['External processing', 'We may use domestic or overseas specialist providers for authentication and data hosting (Supabase), AI replies, speech transcription and synthesis (OpenAI), social sign-in (Kakao, Google) and service hosting. We limit processing to what is necessary and provide any additional notice or consent required by applicable law.'],
  ['Your choices and rights', 'You may request access, correction, deletion or restriction of your information and withdraw consent. You can change or remove your profile photo in your profile at any time.'],
  ['Security', 'We apply access controls, private storage, transmission safeguards and usage limits appropriate to the service.'],
  ['Ad measurement', 'To measure advertising, Saseok uses the Meta (Meta Platforms) pixel and conversions API. The screens you visit, actions such as completing registration, a first conversation and a conversation that lasts, ad click information and a browser identifier (cookie) and, for members, the route of their first visit (campaign tags, linking site, first page) and a hashed email address and account identifier are sent to Meta. Conversation content, voice and your profile introduction are not sent. You can opt out with your browser’s "Do Not Track" setting and turn off personalised ads in your Meta ad settings.'],
  ['Contact', 'Privacy contact: Seokbin Choi · ask.saseok@gmail.com · 4F, 402-331A, 13 Saimdang-ro 8-gil, Seocho-gu, Seoul, Republic of Korea'],
];

const englishTerms = [
  ['Purpose', '사석 (Off the record) is a space where you talk with fictional AI characters and other users. You choose a place, then open or join a room and talk with a character’s help. Characters are not real people, and what they say is conversation, not guaranteed to be complete or accurate, or professional medical, legal or financial advice.'],
  ['Account responsibility', 'Keep your sign-in method secure and do not use another person’s account or bypass access controls. You may enter as a guest, but a guest’s relationship with characters and records may not carry over to an account.'],
  ['Room conduct', 'Respect every participant. Harassment, threats, sexual harassment, hate, disclosure of personal information and unlawful content are prohibited. A room owner may set the topic and age-group limits, which apply to users who have provided an age group. A room seats up to six people, and you may wait in line when it is full. Voice conversation uses live audio delivery and automatic transcription.'],
  ['Friends, ratings and notes', 'You may rate only people you talked with, and must not give false or retaliatory ratings. Notes must not contain abuse, threats, sexual harassment, advertising or spam, or requests for personal information. You can block anyone from their profile, and we may restrict these features if rules are broken. Please report problems to the contact address.'],
  ['Safety', 'Conversations in rooms may be checked automatically for safety. When needed to handle a report, a dispute or a safety check, our staff may read the room conversations and participation records that are still kept (within 30 days); each time, who opened it, when and for whom is recorded. If rules are broken we may warn you or restrict your speaking for a time, and restrict use if it repeats or is serious.'],
  ['Content and visibility', 'You must have the right to use what you submit. What you say in a room is visible to the other participants and the AI character. Your profile photo is shown as it is to others in the same room. Do not upload another person’s photo, images that infringe rights, or sexual or unlawful images; such a photo may be removed and your use of features restricted.'],
  ['Beta usage time', 'During the beta we may limit daily usage time to keep costs and the service stable. The limit applies separately to 1:1 talks with a character and to shared rooms, and the room shows how much time is left today. When it runs out, that day’s conversation ends and you can come back the next day (midnight Korean time). The limits and who they apply to may change as we operate the service.'],
  ['Prohibited use', 'Automated bulk requests, cost abuse, security exploitation, bypassing capacity or age-group limits, manipulating characters to produce inappropriate replies and disrupting other users are prohibited.'],
  ['Changes and contact', 'The service is in a test opening and may change as needed for safety and operation. Important changes are announced in the service. Service enquiries: ask.saseok@gmail.com'],
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
  const jump = (index: number) => document.getElementById(`legal-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="lounge-legal page-scroll">
      <header className="lounge-legal-top">
        <button type="button" className="lounge-legal-back" onClick={() => navigate(-1)} aria-label={isEnglish ? 'Go back' : '뒤로 가기'}><ChevronLeft size={20} /></button>
        <Link to="/lounge" className="lounge-legal-brand"><Coffee size={22} /><strong>사석<span>{isEnglish ? 'Real talk, off the record' : '진짜 대화는 사석에서 · Off the record'}</span></strong></Link>
      </header>
      <div className="lounge-legal-body">
        <section className="lounge-legal-hero">
          <span className="lounge-legal-kicker"><ShieldCheck size={15} /> {isEnglish ? 'SASEOK TRUST CENTER' : '사석 TRUST CENTER'}</span>
          <h1>{title}</h1>
          <p>{isEnglish ? 'Effective 12 October 2026' : '시행일 2026년 10월 12일'}</p>
          <nav className="lounge-legal-tabs" aria-label={isEnglish ? 'Documents' : '문서 선택'}>
            <Link to="/terms" aria-current={kind === 'terms' ? 'page' : undefined}>{isEnglish ? 'Terms of service' : '이용약관'}</Link>
            <Link to="/privacy" aria-current={kind === 'privacy' ? 'page' : undefined}>{isEnglish ? 'Privacy notice' : '개인정보 처리 안내'}</Link>
          </nav>
        </section>
        <section className="lounge-legal-intro">
          <strong>{isEnglish ? 'Please understand how your conversation data is used before you join.' : '대화를 시작하기 전에 대화 데이터가 어떻게 처리되는지 확인해 주세요.'}</strong>
          <p>{isEnglish ? 'This notice describes the current product behaviour and will be updated when data handling changes.' : '이 문서는 현재 서비스 동작을 기준으로 작성되며, 데이터 처리 방식이 달라지면 함께 갱신됩니다.'}</p>
        </section>
        <div className="lounge-legal-layout">
          <nav className="lounge-legal-toc" aria-label={isEnglish ? 'Contents' : '목차'}>
            <b>{isEnglish ? 'Contents' : '목차'}</b>
            <ol>{sections.map(([heading], index) => <li key={heading}><button type="button" onClick={() => jump(index)}><span>{String(index + 1).padStart(2, '0')}</span>{heading}</button></li>)}</ol>
          </nav>
          <div className="lounge-legal-sections">
            {sections.map(([heading, content], index) => <section id={`legal-section-${index}`} key={heading}><span className="num">{String(index + 1).padStart(2, '0')}</span><div><h2>{heading}</h2><p>{content}</p></div></section>)}
          </div>
        </div>
      </div>
      <LoungeBusinessFooter />
    </main>
  );
};
