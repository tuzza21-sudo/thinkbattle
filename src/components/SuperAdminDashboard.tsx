import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Building2,
  ChevronLeft,
  CircleCheck,
  FileText,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  addSuperAdminOrganizationOwner,
  createSuperAdminOrganization,
  getSuperAdminDashboard,
} from '../lib/superAdmin';
import type { SuperAdminDashboard as DashboardData, SuperAdminRecord } from '../types';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';

export const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SuperAdminRecord | null>(null);
  const [query, setQuery] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerOrganizationId, setOwnerOrganizationId] = useState('');
  const [additionalOwnerEmail, setAdditionalOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setData(await getSuperAdminDashboard());
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void getSuperAdminDashboard().then(nextData => {
      if (cancelled) return;
      setData(nextData);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const organizations = data?.organizations ?? [];
  const records = useMemo(
    () => (data?.records ?? []).filter(record =>
      `${record.nickname} ${record.email} ${record.topic}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [data, query],
  );

  const handleCreateOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!organizationName.trim() || !ownerEmail.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      await createSuperAdminOrganization(organizationName, ownerEmail);
      setNotice({ type: 'success', message: `${organizationName.trim()} 기관 게시판과 소유자 권한을 설정했습니다.` });
      setOrganizationName('');
      setOwnerEmail('');
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleAddOwner = async (event: FormEvent) => {
    event.preventDefault();
    if (!ownerOrganizationId || !additionalOwnerEmail.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      await addSuperAdminOrganizationOwner(ownerOrganizationId, additionalOwnerEmail);
      const organization = organizations.find(item => item.id === ownerOrganizationId);
      setNotice({ type: 'success', message: `${organization?.name ?? '기관'}의 소유자를 추가했습니다.` });
      setAdditionalOwnerEmail('');
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="app-container page-scroll admin-shell super-admin-shell" style={{ padding: '2rem 1.25rem 4rem', maxWidth: 1180 }}>
      <header className="admin-header">
        <div>
          <button className="btn btn-secondary" style={{ padding: '.45rem .7rem', marginBottom: '.7rem' }} onClick={() => navigate('/')}>
            <ChevronLeft size={16} /> ThinkFit
          </button>
          <h1><ShieldCheck color="var(--primary)" style={{ verticalAlign: 'middle' }} /> 슈퍼 관리자</h1>
          <p className="admin-lead" style={{ margin: '.4rem 0 0' }}>전체 활동과 기관 게시판을 관리합니다.</p>
        </div>
        <button className="icon-button" onClick={() => void load()} title="새로고침" aria-label="새로고침">
          <RefreshCw size={18} />
        </button>
      </header>

      {loading ? (
        <p className="super-admin-loading">권한과 관리 정보를 확인하는 중입니다.</p>
      ) : !data ? (
        <section className="card super-admin-empty">
          <LockKeyhole size={36} color="var(--secondary)" />
          <h2>접근 권한이 없습니다</h2>
          <p>서버에서 슈퍼 관리자 이메일을 확인하지 못했습니다.</p>
        </section>
      ) : (
        <>
          <section className="admin-metric-grid">
            <Metric icon={<Users />} label="전체 회원" value={`${data.totalUsers}명`} />
            <Metric icon={<FileText />} label="전체 토론 기록" value={`${data.totalRecords}건`} />
            <Metric icon={<ShieldCheck />} label="활동 회원" value={`${data.activeUsers}명`} />
            <Metric icon={<Building2 />} label="기관 게시판" value={`${organizations.length}개`} />
          </section>

          <section className="card admin-panel super-admin-organization-section">
            <div className="super-admin-section-heading">
              <div>
                <span className="admin-eyebrow">기관 온보딩</span>
                <h2>기관 게시판 개설 및 소유자 지정</h2>
              </div>
              <div className="super-admin-flow" aria-label="기관 개설 순서">
                <span>1. 계정 가입</span><b>→</b><span>2. 기관 개설</span><b>→</b><span>3. 소유자 로그인</span>
              </div>
            </div>
            <p className="admin-lead">
              소유자로 지정할 이메일은 ThinkFit 회원가입을 먼저 완료해야 합니다. 지정된 계정은 새로고침하거나 다시 로그인하면 기관 전용 게시판과 기관 관리자 화면을 사용할 수 있습니다.
            </p>

            {notice && (
              <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
                {notice.type === 'success' && <CircleCheck size={18} />}{notice.message}
              </div>
            )}

            <div className="super-admin-form-grid">
              <form className="super-admin-form-card" onSubmit={handleCreateOrganization}>
                <div className="super-admin-form-title"><Building2 size={20} /><strong>새 기관 만들기</strong></div>
                <label className="admin-label" htmlFor="organization-name">기관명</label>
                <input id="organization-name" className="input-field" value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="예: 연세토론동아리" maxLength={80} required />
                <label className="admin-label" htmlFor="organization-owner-email">대표 소유자 이메일</label>
                <input id="organization-owner-email" className="input-field" type="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} placeholder="예: yonsei@naver.com" required />
                <button className="btn btn-primary" type="submit" disabled={saving || !organizationName.trim() || !ownerEmail.trim()}>
                  <Building2 size={17} /> 기관 게시판 개설
                </button>
              </form>

              <form className="super-admin-form-card" onSubmit={handleAddOwner}>
                <div className="super-admin-form-title"><UserPlus size={20} /><strong>기존 기관 소유자 추가</strong></div>
                <label className="admin-label" htmlFor="owner-organization">기관 선택</label>
                <select id="owner-organization" className="input-field" value={ownerOrganizationId} onChange={event => setOwnerOrganizationId(event.target.value)} required>
                  <option value="">기관을 선택하세요</option>
                  {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
                <label className="admin-label" htmlFor="additional-owner-email">추가 소유자 이메일</label>
                <input id="additional-owner-email" className="input-field" type="email" value={additionalOwnerEmail} onChange={event => setAdditionalOwnerEmail(event.target.value)} placeholder="가입한 회원 이메일" required />
                <button className="btn btn-secondary" type="submit" disabled={saving || !ownerOrganizationId || !additionalOwnerEmail.trim()}>
                  <UserPlus size={17} /> 소유자 권한 추가
                </button>
              </form>
            </div>

            <div className="super-admin-organization-list">
              {organizations.map(organization => (
                <article className="super-admin-organization-card" key={organization.id}>
                  <div>
                    <strong>{organization.name}</strong>
                    <small>회원 {organization.memberCount}명 · {new Date(organization.createdAt).toLocaleDateString('ko-KR')} 개설</small>
                  </div>
                  <div className="super-admin-owner-list">
                    <span>소유자</span>
                    {organization.owners.length ? organization.owners.map(owner => (
                      <small key={owner.userId}>{owner.nickname} · {owner.email}</small>
                    )) : <small>지정된 소유자 없음</small>}
                  </div>
                </article>
              ))}
              {!organizations.length && <p className="super-admin-list-empty">아직 개설된 기관이 없습니다.</p>}
            </div>
          </section>

          <section className="card admin-panel">
            <div className="super-admin-section-heading">
              <h2>전체 활동 기록</h2>
              <input className="input-field super-admin-search" placeholder="회원명 · 이메일 · 토론 주제 검색" value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <div className="super-admin-table-wrap">
              <table className="super-admin-table">
                <thead><tr>{['회원', '이메일', '토론 주제', '수준', '점수', '완료일', ''].map(label => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{records.map(record => (
                  <tr key={record.id}>
                    <td>{record.nickname}</td><td>{record.email}</td><td>{record.topic}</td>
                    <td>{record.debateLevel === 'beginner' ? '초급' : record.debateLevel === 'intermediate' ? '중급' : '고급'}</td>
                    <td>{record.totalScore}점</td><td>{new Date(record.completedAt).toLocaleString('ko-KR')}</td>
                    <td><button className="btn btn-secondary" style={{ padding: '.4rem .6rem' }} onClick={() => setSelected(record)}>보고서</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!records.length && <p className="super-admin-list-empty">표시할 토론 기록이 없습니다.</p>}
          </section>
        </>
      )}

      {selected && (
        <div role="dialog" aria-modal="true" className="super-admin-modal-backdrop">
          <article className="card super-admin-report-modal">
            <div className="super-admin-section-heading">
              <div><h2>{selected.topic}</h2><p>{selected.nickname} · {selected.email}</p></div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="닫기">×</button>
            </div>
            <section><h3>AI 총평</h3><p>{selected.report?.overallFeedback || '저장된 총평이 없습니다.'}</p></section>
            <section><h3>세부 역량</h3>{selected.report?.categories?.map(category => <article key={category.name}><strong>{category.name} · {category.score}/{category.maxScore}</strong><p>{category.feedback}</p></article>)}</section>
            <section><h3>토론 발언 기록</h3>{selected.arguments?.map(argument => <article className={argument.isAi ? 'ai' : ''} key={argument.id}><strong>{argument.isAi ? 'AI' : selected.nickname}{argument.roundTitle ? ` · ${argument.roundTitle}` : ''}</strong><p>{argument.content}</p></article>)}</section>
          </article>
        </div>
      )}
    </main>
  );
};

const Metric = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <article className="card admin-panel super-admin-metric">
    <span>{icon}</span><small>{label}</small><strong>{value}</strong>
  </article>
);
