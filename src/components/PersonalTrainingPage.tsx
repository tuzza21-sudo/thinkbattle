import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, FileCheck2, LoaderCircle, Save, ShieldCheck, Sparkles, UserRoundPen, WandSparkles } from 'lucide-react';
import { simulationPersonas } from '../data/simulations';
import { extractTrainingProfileFromText, generateCustomSituationSimulation, generateProfileBasedSimulation } from '../lib/api';
import { createPersonalSimulationMission, emptyTrainingProfile, getTrainingProfile, saveTrainingProfile } from '../lib/personalTraining';
import type { AppUser, SimulationDifficulty, SimulationPersonaId, TrainingProfile, TrainingProfileType } from '../types';

interface PersonalTrainingPageProps {
  user: AppUser;
}

const profileTypeOptions: Array<{ value: TrainingProfileType; label: string }> = [
  { value: 'student', label: '학생' },
  { value: 'job_seeker', label: '취업준비생' },
  { value: 'professional', label: '경력자' },
  { value: 'sales', label: '영업 담당자' },
];

const difficultyOptions: Array<{ value: SimulationDifficulty; label: string; description: string }> = [
  { value: 1, label: '기초', description: '설명할 기회를 주는 현실적 압박' },
  { value: 2, label: '실전', description: '모호한 답변을 계속 파고드는 압박' },
  { value: 3, label: '고압', description: '모순·시간·결정을 동시에 압박' },
];

export const PersonalTrainingPage = ({ user }: PersonalTrainingPageProps) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TrainingProfile>(() => emptyTrainingProfile(user.id));
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileSituation, setProfileSituation] = useState('');
  const [profileDifficulty, setProfileDifficulty] = useState<SimulationDifficulty>(2);
  const [customDifficulty, setCustomDifficulty] = useState<SimulationDifficulty>(2);
  const [customSituation, setCustomSituation] = useState('');
  const [customUserRole, setCustomUserRole] = useState('');
  const [customObjective, setCustomObjective] = useState('');
  const [customCounterpartRole, setCustomCounterpartRole] = useState('');
  const [customPersonaId, setCustomPersonaId] = useState<SimulationPersonaId>('pressure_interviewer');

  useEffect(() => {
    let active = true;
    getTrainingProfile(user.id)
      .then(savedProfile => {
        if (active && savedProfile) setProfile(savedProfile);
      })
      .catch(nextError => {
        if (active) setError(nextError instanceof Error ? nextError.message : '훈련 프로필을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setIsLoadingProfile(false);
      });
    return () => { active = false; };
  }, [user.id]);

  const updateProfile = <Key extends keyof TrainingProfile>(key: Key, value: TrainingProfile[Key]) => {
    setProfile(current => ({ ...current, [key]: value }));
  };

  const showError = (nextError: unknown, fallback: string) => {
    setMessage(null);
    setError(nextError instanceof Error ? nextError.message : fallback);
  };

  const handleExtract = async () => {
    if (profile.sourceText.trim().length < 40) {
      setError('이력서·경력기술서·활동 내용을 40자 이상 입력해 주세요.');
      return;
    }
    setIsExtracting(true);
    setError(null);
    setMessage(null);
    try {
      const extracted = await extractTrainingProfileFromText(profile.profileType, profile.sourceText);
      setProfile(current => ({
        ...current,
        ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => typeof value === 'string' && value.trim())),
      }));
      setMessage('AI가 내용을 항목별로 정리했습니다. 잘못 추출된 내용이 없는지 확인한 뒤 저장해 주세요.');
    } catch (nextError) {
      showError(nextError, '프로필 내용을 정리하지 못했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveTrainingProfile(profile);
      setProfile(saved);
      setMessage('개인 훈련 프로필을 저장했습니다.');
    } catch (nextError) {
      showError(nextError, '훈련 프로필을 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateFromProfile = async () => {
    if (!profile.sourceText.trim() && !profile.experiences.trim() && !profile.activities.trim()) {
      setError('맞춤 질문에 사용할 경력·프로젝트·활동 정보를 먼저 입력해 주세요.');
      return;
    }
    setIsGeneratingProfile(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveTrainingProfile(profile);
      setProfile(saved);
      const mission = await generateProfileBasedSimulation(saved, profileSituation, profileDifficulty);
      const missionId = await createPersonalSimulationMission(user.id, 'profile', mission);
      navigate(`/simulation/${missionId}`);
    } catch (nextError) {
      showError(nextError, '프로필 기반 시나리오를 만들지 못했습니다.');
    } finally {
      setIsGeneratingProfile(false);
    }
  };

  const handleGenerateCustom = async () => {
    if (!customSituation.trim() || !customUserRole.trim() || !customObjective.trim() || !customCounterpartRole.trim()) {
      setError('직접 준비하는 상황의 네 가지 항목을 모두 입력해 주세요.');
      return;
    }
    setIsGeneratingCustom(true);
    setError(null);
    setMessage(null);
    try {
      const mission = await generateCustomSituationSimulation({
        situation: customSituation,
        userRole: customUserRole,
        objective: customObjective,
        counterpartRole: customCounterpartRole,
        personaId: customPersonaId,
        difficulty: customDifficulty,
      });
      const missionId = await createPersonalSimulationMission(user.id, 'custom', mission);
      navigate(`/simulation/${missionId}`);
    } catch (nextError) {
      showError(nextError, '직접 입력한 상황으로 시나리오를 만들지 못했습니다.');
    } finally {
      setIsGeneratingCustom(false);
    }
  };

  const selectedPersona = simulationPersonas.find(persona => persona.id === customPersonaId) ?? simulationPersonas[0];

  return (
    <div className="personal-training-page">
      <header className="simulation-header">
        <button type="button" className="simulation-back" onClick={() => navigate('/simulation')}><ArrowLeft size={18} /> 상황극 목록</button>
        <div className="simulation-brand"><img src="/brand/thinkfit-mark.svg" alt="" /><span>ThinkFit</span> Personal Lab</div>
        <div className="simulation-user">{user.nickname}님의 맞춤 훈련</div>
      </header>

      <main className="personal-training-shell">
        <section className="personal-training-hero">
          <div><span><WandSparkles size={16} /> PERSONAL PRESSURE LAB</span><h1>내 경험과 실제 상황으로<br />압박훈련을 만드세요</h1><p>입력한 사실만 사용해 질문을 만들고, 기존 실전 페르소나가 대화를 이어갑니다.</p></div>
          <div className="personal-training-privacy"><ShieldCheck size={24} /><strong>내 프로필은 나만 접근할 수 있습니다.</strong><p>연락처·주소·생년월일은 입력 전에 제거하세요. AI가 정리한 내용은 저장 전에 직접 수정할 수 있습니다.</p></div>
        </section>

        {error && <div className="personal-training-alert error">{error}</div>}
        {message && <div className="personal-training-alert success">{message}</div>}

        <section className="personal-profile-card">
          <header><div><span>STEP 1</span><h2><FileCheck2 size={21} /> 개인 훈련 프로필</h2><p>이력서·경력기술서 또는 학생 활동을 붙여넣고 AI로 정리한 뒤 직접 확인하세요.</p></div><button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoadingProfile}>{isSaving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} 저장</button></header>

          {isLoadingProfile ? <div className="personal-training-loading"><LoaderCircle className="spin" size={20} /> 저장된 프로필을 불러오는 중입니다.</div> : (
            <div className="personal-profile-form">
              <label><span>사용자 유형</span><select value={profile.profileType} onChange={event => updateProfile('profileType', event.target.value as TrainingProfileType)}>{profileTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span>목표 직무</span><input value={profile.targetRole} onChange={event => updateProfile('targetRole', event.target.value)} placeholder="예: B2B 영업, 서비스 기획, 건축 PM" maxLength={120} /></label>
              <label><span>관심 산업</span><input value={profile.targetIndustry} onChange={event => updateProfile('targetIndustry', event.target.value)} placeholder="예: SaaS, 건설, 금융, 반도체" maxLength={120} /></label>
              <label><span>전공</span><input value={profile.major} onChange={event => updateProfile('major', event.target.value)} placeholder="전공·복수전공·집중 분야" maxLength={160} /></label>
              <label className="wide"><span>학력·교육</span><textarea value={profile.education} onChange={event => updateProfile('education', event.target.value)} placeholder="학교명보다 훈련에 필요한 전공, 수강과목, 교육 내용을 중심으로 적어주세요." maxLength={1500} /></label>
              <label className="wide source"><span>이력서·경력기술서·주요 활동 원문</span><textarea value={profile.sourceText} onChange={event => updateProfile('sourceText', event.target.value)} placeholder="연락처와 주소 등 개인정보를 제거한 뒤 내용을 붙여넣으세요. 학생은 전공 프로젝트, 동아리, 공모전, 연구, 봉사활동을 입력할 수 있습니다." maxLength={14000} /><small>{profile.sourceText.length.toLocaleString()} / 14,000자</small><button type="button" onClick={() => void handleExtract()} disabled={isExtracting}>{isExtracting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} AI로 항목 정리</button></label>
              <label className="wide"><span>경력 요약</span><textarea value={profile.careerSummary} onChange={event => updateProfile('careerSummary', event.target.value)} placeholder="전체 경력의 방향과 핵심 역할" maxLength={2000} /></label>
              <label className="wide"><span>주요 경력·프로젝트·성과</span><textarea value={profile.experiences} onChange={event => updateProfile('experiences', event.target.value)} placeholder="상황, 본인의 역할, 실제 행동, 결과를 구분해 적어주세요." maxLength={5000} /></label>
              <label className="wide"><span>특별활동</span><textarea value={profile.activities} onChange={event => updateProfile('activities', event.target.value)} placeholder="동아리, 공모전, 학생회, 연구, 봉사, 사이드 프로젝트" maxLength={3000} /></label>
              <label><span>강점</span><textarea value={profile.strengths} onChange={event => updateProfile('strengths', event.target.value)} placeholder="근거가 있는 강점" maxLength={1200} /></label>
              <label><span>보완하고 싶은 점</span><textarea value={profile.improvementAreas} onChange={event => updateProfile('improvementAreas', event.target.value)} placeholder="압박받으면 어려운 부분" maxLength={1200} /></label>
            </div>
          )}
        </section>

        <section className="personal-scenario-grid">
          <article className="personal-scenario-card profile-mode">
            <header><span><Sparkles size={17} /> PROFILE-BASED</span><h2>내 프로필로 새 시나리오 생성</h2><p>AI가 입력된 경력과 활동에서 검증할 지점을 골라 맞춤 압박 질문을 만듭니다.</p></header>
            <label><span>준비하고 싶은 상황</span><textarea value={profileSituation} onChange={event => setProfileSituation(event.target.value)} placeholder="예: 카카오 서비스 기획 1차 면접, 공백기 설명, 영업 실적 검증. 비워두면 프로필에서 자동 선택합니다." maxLength={1200} /></label>
            <DifficultyPicker value={profileDifficulty} onChange={setProfileDifficulty} />
            <button type="button" className="personal-generate-button" onClick={() => void handleGenerateFromProfile()} disabled={isGeneratingProfile || isLoadingProfile}>{isGeneratingProfile ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />} 맞춤 시나리오 만들기</button>
          </article>

          <article className="personal-scenario-card custom-mode">
            <header><span><UserRoundPen size={17} /> BUILD YOUR OWN</span><h2>내가 준비하는 상황 직접 입력</h2><p>곧 있을 회의·면접·협상 상황을 입력하면 AI가 압박훈련용 장면과 첫 질문으로 구성합니다.</p></header>
            <label><span>실제 준비 상황</span><textarea value={customSituation} onChange={event => setCustomSituation(event.target.value)} placeholder="예: 팀장에게 두 프로젝트의 일정 충돌을 보고하고 우선순위를 결정받아야 한다." maxLength={3000} /></label>
            <div className="personal-inline-fields"><label><span>나의 역할</span><input value={customUserRole} onChange={event => setCustomUserRole(event.target.value)} placeholder="예: 입사 2년 차 PM" maxLength={160} /></label><label><span>상대 역할</span><input value={customCounterpartRole} onChange={event => setCustomCounterpartRole(event.target.value)} placeholder="예: 결과 중심의 본부장" maxLength={160} /></label></div>
            <label><span>이번 훈련의 목표</span><textarea value={customObjective} onChange={event => setCustomObjective(event.target.value)} placeholder="예: 변명처럼 들리지 않게 제약을 설명하고 우선순위 결정을 받는다." maxLength={1200} /></label>
            <label><span>상대 성격</span><select value={customPersonaId} onChange={event => setCustomPersonaId(event.target.value as SimulationPersonaId)}>{simulationPersonas.map(persona => <option key={persona.id} value={persona.id}>{persona.name} · {persona.gender} · {persona.age}세 · {persona.role}</option>)}</select></label>
            <div className="personal-selected-persona"><img src={selectedPersona.imageUrl} alt={`${selectedPersona.name}, ${selectedPersona.gender} ${selectedPersona.age}세`} /><div><strong>{selectedPersona.name} · {selectedPersona.gender} · {selectedPersona.age}세</strong><span>{selectedPersona.tagline}</span></div></div>
            <DifficultyPicker value={customDifficulty} onChange={setCustomDifficulty} />
            <button type="button" className="personal-generate-button" onClick={() => void handleGenerateCustom()} disabled={isGeneratingCustom}>{isGeneratingCustom ? <LoaderCircle className="spin" size={18} /> : <BriefcaseBusiness size={18} />} 직접 입력한 상황으로 시작</button>
          </article>
        </section>
      </main>
    </div>
  );
};

const DifficultyPicker = ({ value, onChange }: { value: SimulationDifficulty; onChange: (value: SimulationDifficulty) => void }) => (
  <fieldset className="personal-difficulty"><legend>압박 강도</legend><div>{difficultyOptions.map(option => <button type="button" key={option.value} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></fieldset>
);
