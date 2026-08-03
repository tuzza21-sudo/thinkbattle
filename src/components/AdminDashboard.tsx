import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ClipboardList,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  addOrganizationStudent,
  createOrganizationGroup,
  createOrganizationTopic,
  deleteOrganizationTopic,
  getAdminDashboard,
  getMyOrganizations,
  getOrganizationStudentRecords,
  getOrganizationTopics,
  getOrganizationUserDirectory,
  removeOrganizationStudent,
} from '../lib/admin';
import type {
  AdminDashboard as DashboardData,
  OrganizationStudentRecord,
  OrganizationSummary,
  OrganizationTopic,
  OrganizationUser,
} from '../types';
import { generateOrganizationTopic } from '../lib/api';

type Section = 'info' | 'groups' | 'students' | 'topics';

const menu = [
  { id: 'info', label: '기관 정보', icon: Building2, desc: '대시보드 & 통계' },
  { id: 'groups', label: '반 관리', icon: ClipboardList, desc: '학급 & 그룹 편성' },
  { id: 'students', label: '학생 관리', icon: Users, desc: '학생 배정 & 토론 이력' },
  { id: 'topics', label: '주제 관리', icon: BookOpen, desc: 'AI 맞춤 토론 출제' },
] as const;

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [topics, setTopics] = useState<OrganizationTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('info');
  const [newGroupName, setNewGroupName] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [generatingTopic, setGeneratingTopic] = useState(false);
  const [managementError, setManagementError] = useState('');
  const [historyStudent, setHistoryStudent] = useState<{ id: string; nickname: string } | null>(null);
  const [studentRecords, setStudentRecords] = useState<OrganizationStudentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = async () => {
    if (!organizationId) return;
    setLoading(true);
    const [nextDashboard, nextUsers, nextTopics] = await Promise.all([
      getAdminDashboard(organizationId),
      getOrganizationUserDirectory(organizationId),
      getOrganizationTopics(organizationId),
    ]);
    setDashboard(nextDashboard);
    setUsers(nextUsers);
    setTopics(nextTopics);
    setLoading(false);
  };

  useEffect(() => {
    getMyOrganizations().then(items => {
      setOrganizations(items);
      setOrganizationId(items[0]?.id ?? '');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [organizationId]);

  const manage = async (action: () => Promise<void>) => {
    setManagementError('');
    try {
      await action();
      await refresh();
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
    }
  };

  const openStudentHistory = async (id: string, nickname: string) => {
    setHistoryStudent({ id, nickname });
    setHistoryLoading(true);
    setStudentRecords(await getOrganizationStudentRecords(organizationId, id));
    setHistoryLoading(false);
  };

  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return query
      ? users.filter(user => `${user.nickname} ${user.email}`.toLowerCase().includes(query))
      : users;
  }, [memberSearch, users]);

  const totals = useMemo(() => ({
    students: dashboard?.students.length ?? 0,
    groups: dashboard?.groups.length ?? 0,
    debates: dashboard?.students.reduce((sum, student) => sum + student.debateCount, 0) ?? 0,
    avgScore: dashboard?.students.length
      ? Math.round(dashboard.students.reduce((sum, s) => sum + s.averageScore, 0) / dashboard.students.length)
      : 0,
  }), [dashboard]);

  const generateAndCreateTopic = async () => {
    if (!topicTitle.trim()) return;
    setManagementError('');
    setGeneratingTopic(true);
    try {
      const generated = await generateOrganizationTopic(
        `${topicTitle.trim()}${topicDescription.trim() ? `\n기관 운영자 참고: ${topicDescription.trim()}` : ''}`
      );
      await createOrganizationTopic(organizationId, generated.title, generated.description, generated.briefing, generated.config);
      setTopicTitle('');
      setTopicDescription('');
      await refresh();
    } catch (error) {
      setManagementError(error instanceof Error ? error.message : 'AI 주제 생성에 실패했습니다.');
    } finally {
      setGeneratingTopic(false);
    }
  };

  if (!loading && !organizations.length) {
    return (
      <main className="app-container page-scroll" style={{ maxWidth: 1180, padding: '3rem 1.25rem' }}>
        <section className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <Building2 size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <h2 style={{ color: 'var(--text-light)', marginBottom: '0.5rem' }}>기관 관리자 권한이 없습니다</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>기관 계정으로 로그인되어 있는지 확인하세요.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>메인으로 돌아가기</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-container page-scroll" style={{ maxWidth: 1180, padding: '0 1.25rem 4rem' }}>
      {/* Top Header Navigation */}
      <div style={{ padding: '1.5rem 0 0' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ gap: '0.5rem' }}>
          <ArrowLeft size={16} /> ThinkFit
        </button>
      </div>

      {/* Hero Admin Header Section (Matches Main Page Design Token) */}
      <header style={{
        margin: '1.5rem 0 2rem',
        padding: '2rem',
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(15, 23, 42, 0.4) 100%)',
        border: '1px solid var(--border-color)',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem',
      }}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge" style={{ background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800 }}>
              B2B ADMIN
            </span>
            <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.9rem' }}>
              {dashboard?.organization.name || '기관 관리자 포털'}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-light)', fontWeight: 900 }}>
            기관 관리자 센터
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            학생 그룹 편성, 대시보드 통계 분석 및 AI 전용 토론 주제 출제를 한곳에서 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="input-field"
            value={organizationId}
            onChange={e => setOrganizationId(e.target.value)}
            style={{
              padding: '0.65rem 1rem',
              fontWeight: 700,
              background: 'var(--bg-card)',
              color: 'var(--text-light)',
              minWidth: 200,
            }}
          >
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <button
            className="icon-button"
            onClick={() => void refresh()}
            title="새로고침"
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      {loading ? (
        <section className="card" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
          <p style={{ fontSize: '1.05rem', margin: 0 }}>기관 데이터를 불러오는 중입니다...</p>
        </section>
      ) : !dashboard ? (
        <section className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          기관 데이터를 불러오지 못했습니다.
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Sidebar Menu (Enhanced Card Styling) */}
          <aside className="card" style={{
            padding: '0.85rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            position: 'sticky',
            top: '1.5rem',
          }}>
            <div style={{ padding: '0.5rem 0.75rem 0.75rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.05em' }}>
                ADMIN NAVIGATION
              </span>
            </div>
            {menu.map(item => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.8rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                    background: isActive
                      ? 'linear-gradient(90deg, rgba(37, 99, 235, 0.18) 0%, rgba(37, 99, 235, 0.05) 100%)'
                      : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: isActive ? 900 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                    boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.1)' : 'none',
                  }}
                >
                  <Icon size={19} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.98rem', lineHeight: 1.2 }}>{item.label}</span>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                      {item.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right Main Content Panel */}
          <div className="flex flex-col gap-6" style={{ minWidth: 0 }}>
            {/* SECTION 1: 기관 정보 */}
            {section === 'info' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: '0 0 0.4rem', color: 'var(--text-light)', fontSize: '1.5rem', fontWeight: 900 }}>
                    기관 정보 및 운영 통계
                  </h2>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    등록 학생 수, 개설 반 현황 및 세션 참여 누적 데이터를 한눈에 확인합니다.
                  </p>
                </div>

                {/* Metric Summary Cards */}
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  {[
                    { label: '등록 학생 수', value: `${totals.students}명`, desc: '현재 소속된 학생 회원의 총수', color: 'var(--primary)', icon: Users },
                    { label: '개설 반 그룹', value: `${totals.groups}개 반`, desc: '활성화된 수업/동아리 클래스', color: 'var(--accent-amber)', icon: ClipboardList },
                    { label: '누적 토론 회수', value: `${totals.debates}회`, desc: '학생들이 완료한 AI 토론 세션', color: 'var(--secondary)', icon: Sparkles },
                    { label: '평균 토론 점수', value: `${totals.avgScore}점`, desc: '기관 전체 평균 논증 평가 점수', color: 'var(--primary)', icon: GraduationCap },
                  ].map(m => {
                    const MIcon = m.icon;
                    return (
                      <article key={m.label} className="card" style={{
                        padding: '1.25rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <div className="flex justify-between items-center">
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>{m.label}</span>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'var(--bg-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <MIcon size={16} color={m.color} />
                          </div>
                        </div>
                        <strong style={{ fontSize: '1.8rem', color: 'var(--text-light)', fontWeight: 900, lineHeight: 1.1 }}>
                          {m.value}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.desc}</span>
                      </article>
                    );
                  })}
                </div>

                {/* Additional Org Summary Box */}
                <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Building2 size={18} color="var(--primary)" /> 소속 기관 정보
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>기관명</span>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--text-light)' }}>{dashboard.organization.name}</strong>
                    </div>
                    <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>내 관리자 역할</span>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--primary)', textTransform: 'uppercase' }}>{dashboard.organization.role}</strong>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* SECTION 2: 반 관리 */}
            {section === 'groups' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: '0 0 0.4rem', color: 'var(--text-light)', fontSize: '1.5rem', fontWeight: 900 }}>
                    반(그룹) 관리
                  </h2>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    새로운 학급이나 토론 그룹을 개설하고 소속 학생 수와 활동 토론 현황을 관리합니다.
                  </p>
                </div>

                {/* Create New Group Card */}
                <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={18} color="var(--primary)" /> 신규 반 개설
                  </h3>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (newGroupName.trim()) {
                        void manage(async () => {
                          await createOrganizationGroup(organizationId, newGroupName);
                          setNewGroupName('');
                        });
                      }
                    }}
                    style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}
                  >
                    <input
                      className="input-field"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="예: 중등 토론 A반, 1학년 2반"
                      required
                      style={{ flex: 1, minWidth: 220 }}
                    />
                    <button className="btn btn-primary" type="submit" style={{ padding: '0.75rem 1.5rem', fontWeight: 800 }}>
                      반 개설하기
                    </button>
                  </form>
                </section>

                {/* Existing Groups Grid */}
                <div>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--text-light)' }}>
                    개설된 반 목록 ({dashboard.groups.length})
                  </h3>
                  {!dashboard.groups.length ? (
                    <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      개설된 반이 없습니다. 위 양식에서 첫 번째 반을 신규 개설해 보세요.
                    </div>
                  ) : (
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                      {dashboard.groups.map(group => (
                        <article key={group.id} className="card" style={{
                          padding: '1.25rem',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem',
                        }}>
                          <div className="flex justify-between items-center">
                            <span className="badge" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', border: 'none' }}>
                              CLASS
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              평균 {group.averageScore}점
                            </span>
                          </div>
                          <strong style={{ fontSize: '1.2rem', color: 'var(--text-light)' }}>{group.name}</strong>
                          <div className="flex items-center gap-4" style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            <span>👨‍🎓 소속 학생 <strong>{group.studentCount}</strong>명</span>
                            <span>💬 토론 <strong>{group.debateCount}</strong>회</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* SECTION 3: 학생 관리 */}
            {section === 'students' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: '0 0 0.4rem', color: 'var(--text-light)', fontSize: '1.5rem', fontWeight: 900 }}>
                    학생 회원 배정 및 토론 관리
                  </h2>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    회원을 반에 배정하거나 학생들의 세션 참여 이력과 종합 성적 데이터를 조회합니다.
                  </p>
                </div>

                {/* Assign Students Control Card */}
                <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={18} color="var(--primary)" /> 회원 탐색 및 반 배정
                  </h3>
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div>
                      <label className="admin-label">1. 배정할 대상 반 선택</label>
                      <select
                        className="input-field"
                        value={targetGroupId}
                        onChange={e => setTargetGroupId(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">반을 선택하세요</option>
                        {dashboard.groups.map(group => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="admin-label">2. 회원 검색 (닉네임/이메일)</label>
                      <div className="admin-search">
                        <Search size={17} color="var(--text-muted)" />
                        <input
                          className="input-field"
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          placeholder="회원 닉네임 또는 이메일 검색"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Filtered User Selection Grid */}
                  {targetGroupId && (
                    <div style={{ marginTop: '1.25rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.6rem' }}>
                        클릭하여 선택한 반에 학생으로 추가:
                      </span>
                      <div className="admin-user-list">
                        {filteredUsers.map(user => (
                          <button
                            key={user.id}
                            className="btn btn-secondary"
                            onClick={() => void manage(() => addOrganizationStudent(organizationId, user.email, [targetGroupId]))}
                            style={{
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              padding: '0.75rem 1rem',
                              background: 'var(--bg-primary)',
                            }}
                          >
                            <UserPlus size={16} color="var(--primary)" />
                            <div>
                              <strong style={{ display: 'block', color: 'var(--text-light)', fontSize: '0.92rem' }}>{user.nickname}</strong>
                              <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{user.email}</small>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Enrolled Students Table / List */}
                <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--text-light)' }}>
                    등록된 학생 목록 및 성적 ({dashboard.students.length}명)
                  </h3>
                  {!dashboard.students.length ? (
                    <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '1.5rem 0' }}>
                      아직 등록된 학생이 없습니다.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {dashboard.students.map(student => (
                        <div
                          key={student.id}
                          style={{
                            padding: '1rem 1.25rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                          }}
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <strong style={{ fontSize: '1.05rem', color: 'var(--text-light)' }}>{student.nickname}</strong>
                              <span className="badge" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', border: 'none', fontSize: '0.75rem' }}>
                                {student.groups.join(', ') || '반 미배정'}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{student.email}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                              <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-light)', fontWeight: 800 }}>
                                {student.debateCount}회 완료 · 평균 {student.averageScore}점
                              </span>
                            </div>
                            <button
                              className="btn btn-secondary"
                              onClick={() => void openStudentHistory(student.id, student.nickname)}
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
                            >
                              이력 보기
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => void manage(() => removeOrganizationStudent(organizationId, student.id))}
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', color: 'var(--accent-pink)' }}
                              title="기관에서 제외"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* SECTION 4: 주제 관리 */}
            {section === 'topics' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: '0 0 0.4rem', color: 'var(--text-light)', fontSize: '1.5rem', fontWeight: 900 }}>
                    기관 전용 토론 주제 관리
                  </h2>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                    토론 제목과 사전 배경 맥락을 입력하면 AI가 배경지식, 최근 사례, 찬반 쟁점, 토론 전 질문 세트를 자동으로 완성해 드립니다.
                  </p>
                </div>

                {/* AI Topic Generation Form Card */}
                <section className="card" style={{ padding: '1.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (topicTitle.trim()) {
                        void manage(async () => {
                          await createOrganizationTopic(organizationId, topicTitle, topicDescription);
                          setTopicTitle('');
                          setTopicDescription('');
                        });
                      }
                    }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
                  >
                    <div>
                      <label className="admin-label" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-light)' }}>
                        토론 주제 (명제) <span style={{ color: 'var(--primary)' }}>*</span>
                      </label>
                      <input
                        className="input-field"
                        value={topicTitle}
                        onChange={e => setTopicTitle(e.target.value)}
                        placeholder="예: 교내 스마트폰 사용을 전면 제한해야 하는가"
                        required
                        style={{ width: '100%', padding: '0.8rem 1rem' }}
                      />
                    </div>

                    <div>
                      <label className="admin-label" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-light)' }}>
                        사전 배경지식 및 수업 맥락 <em>(AI 상세 생성에 반영)</em>
                      </label>
                      <textarea
                        className="input-textarea"
                        value={topicDescription}
                        onChange={e => setTopicDescription(e.target.value)}
                        placeholder="학생들이 이미 학습한 수업 사례, 다루고자 하는 구체적 관점, 타겟 학년이나 제약 사항을 자유롭게 입력하세요."
                        style={{ width: '100%', minHeight: 110, padding: '0.8rem 1rem' }}
                      />
                    </div>

                    <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={generatingTopic || !topicTitle.trim()}
                        onClick={() => void generateAndCreateTopic()}
                        style={{
                          padding: '0.85rem 1.6rem',
                          fontWeight: 900,
                          fontSize: '1rem',
                          background: 'linear-gradient(135deg, var(--primary) 0%, #1D4ED8 100%)',
                          boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                          gap: '0.5rem',
                        }}
                      >
                        <Sparkles size={18} />
                        {generatingTopic ? 'AI 브리핑 패키지 생성 중...' : 'AI로 상세 주제 생성 및 게시'}
                      </button>

                      <button
                        className="btn btn-secondary"
                        type="submit"
                        disabled={!topicTitle.trim()}
                        style={{ padding: '0.85rem 1.4rem' }}
                      >
                        입력한 내용만 즉시 게시
                      </button>
                    </div>
                  </form>
                </section>

                {/* Published Topics Grid */}
                <div>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--text-light)' }}>
                    게시된 기관 전용 주제 ({topics.length})
                  </h3>
                  {!topics.length ? (
                    <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      게시된 전용 주제가 없습니다. 위 양식에서 주제를 생성해 보세요.
                    </div>
                  ) : (
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                      {topics.map(topic => (
                        <article
                          key={topic.id}
                          className="card"
                          style={{
                            padding: '1.35rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderTop: '4px solid var(--primary)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <span className="badge" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', border: 'none' }}>
                              {topic.briefing ? 'AI 브리핑 포함' : '기본 주제'}
                            </span>
                            <button
                              className="icon-button"
                              onClick={() => void manage(() => deleteOrganizationTopic(organizationId, topic.id))}
                              style={{ color: 'var(--text-muted)' }}
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <h4 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-light)', lineHeight: 1.4 }}>
                            {topic.title}
                          </h4>

                          {topic.description && (
                            <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.6 }}>
                              {topic.description}
                            </p>
                          )}

                          <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {new Date(topic.createdAt).toLocaleDateString('ko-KR')}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700 }}>
                              {topic.config?.debateLevel ? `수준: ${topic.config.debateLevel}` : '기본 레벨'}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {managementError && (
              <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--accent-pink)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-pink)', fontSize: '0.9rem' }}>
                {managementError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student History Modal */}
      {historyStudent && (
        <div className="modal-overlay">
          <section className="modal-content" style={{ maxWidth: 620, padding: '2rem' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-light)' }}>
                {historyStudent.nickname} 학생의 토론 이력
              </h2>
              <button className="icon-button" onClick={() => setHistoryStudent(null)}>
                <X size={20} />
              </button>
            </div>

            {historyLoading ? (
              <p style={{ color: 'var(--text-muted)' }}>기록을 불러오는 중입니다...</p>
            ) : !studentRecords.length ? (
              <p style={{ color: 'var(--text-muted)', margin: '1.5rem 0' }}>완료된 토론 이력이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-3" style={{ maxHeight: 400, overflowY: 'auto', paddingRight: '0.5rem' }}>
                {studentRecords.map(record => (
                  <div
                    key={record.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ display: 'block', color: 'var(--text-light)', fontSize: '0.98rem' }}>{record.topic}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(record.completedAt).toLocaleDateString('ko-KR')} · 난이도: {record.debateLevel}
                      </span>
                    </div>
                    <span className="badge" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 800 }}>
                      {record.totalScore}점
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};
