import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Building2, ChevronLeft, ClipboardList, RefreshCw, Search, UserPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { addOrganizationStudent, createOrganizationGroup, createOrganizationTopic, deleteOrganizationTopic, getAdminDashboard, getMyOrganizations, getOrganizationStudentRecords, getOrganizationTopics, getOrganizationUserDirectory, removeOrganizationStudent } from '../lib/admin';
import type { AdminDashboard as DashboardData, OrganizationStudentRecord, OrganizationSummary, OrganizationTopic, OrganizationUser } from '../types';

type Section = 'info' | 'groups' | 'students' | 'topics';
const menu = [{ id: 'info', label: '기관 정보', icon: Building2 }, { id: 'groups', label: '반 관리', icon: ClipboardList }, { id: 'students', label: '학생 관리', icon: Users }, { id: 'topics', label: '주제 관리', icon: BookOpen }] as const;

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
  const [managementError, setManagementError] = useState('');
  const [historyStudent, setHistoryStudent] = useState<{ id: string; nickname: string } | null>(null);
  const [studentRecords, setStudentRecords] = useState<OrganizationStudentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refresh = async () => {
    if (!organizationId) return;
    setLoading(true);
    const [nextDashboard, nextUsers, nextTopics] = await Promise.all([getAdminDashboard(organizationId), getOrganizationUserDirectory(organizationId), getOrganizationTopics(organizationId)]);
    setDashboard(nextDashboard); setUsers(nextUsers); setTopics(nextTopics); setLoading(false);
  };
  useEffect(() => { getMyOrganizations().then(items => { setOrganizations(items); setOrganizationId(items[0]?.id ?? ''); setLoading(false); }); }, []);
  useEffect(() => { void refresh(); }, [organizationId]);
  const manage = async (action: () => Promise<void>) => { setManagementError(''); try { await action(); await refresh(); } catch (error) { setManagementError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'); } };
  const openStudentHistory = async (id: string, nickname: string) => { setHistoryStudent({ id, nickname }); setHistoryLoading(true); setStudentRecords(await getOrganizationStudentRecords(organizationId, id)); setHistoryLoading(false); };
  const filteredUsers = useMemo(() => { const query = memberSearch.trim().toLowerCase(); return query ? users.filter(user => `${user.nickname} ${user.email}`.toLowerCase().includes(query)) : users; }, [memberSearch, users]);
  const totals = useMemo(() => ({ students: dashboard?.students.length ?? 0, groups: dashboard?.groups.length ?? 0, debates: dashboard?.students.reduce((sum, student) => sum + student.debateCount, 0) ?? 0 }), [dashboard]);

  if (!loading && !organizations.length) return <main className="app-container page-scroll admin-shell"><section className="card admin-panel">기관 관리자 권한이 없습니다.</section></main>;
  return <main className="app-container page-scroll admin-shell" style={{ padding: '2rem 1.25rem 4rem', maxWidth: 1180 }}>
    <header className="admin-header"><div><button className="btn btn-secondary" onClick={() => navigate('/')}><ChevronLeft size={16} /> ThinkFit</button><p className="admin-eyebrow">{dashboard?.organization.name}</p><h1>기관 관리자</h1></div><div className="admin-header-actions"><select className="input-field" value={organizationId} onChange={event => setOrganizationId(event.target.value)}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select><button className="icon-button" onClick={() => void refresh()}><RefreshCw size={18} /></button></div></header>
    {loading ? <p className="admin-loading">불러오는 중입니다.</p> : !dashboard ? <section className="card admin-panel">기관 데이터를 불러오지 못했습니다.</section> : <div className="admin-workspace">
      <aside className="card admin-sidebar">{menu.map(item => { const Icon = item.icon; return <button key={item.id} className={`btn ${section === item.id ? 'active' : ''}`} onClick={() => setSection(item.id)}><Icon size={17} /> {item.label}</button>; })}</aside>
      <div className="admin-content">
        {section === 'info' && <><h2>기관 정보</h2><p className="admin-lead">기관 운영 현황과 학습 데이터를 한눈에 확인합니다.</p><div className="admin-metric-grid">{[['등록 학생', totals.students], ['개설 반', totals.groups], ['완료 토론', totals.debates]].map(([label, value]) => <article className="card admin-panel" key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}</div></>}
        {section === 'groups' && <><h2>반 관리</h2><p className="admin-lead">반을 개설하고 현재 반별 학생과 토론 현황을 확인합니다.</p><section className="card admin-panel"><label className="admin-label">새 반 이름</label><form className="admin-inline-form" onSubmit={event => { event.preventDefault(); if (newGroupName.trim()) void manage(async () => { await createOrganizationGroup(organizationId, newGroupName); setNewGroupName(''); }); }}><input className="input-field" value={newGroupName} onChange={event => setNewGroupName(event.target.value)} placeholder="예: 중등 A반" required /><button className="btn btn-primary" type="submit">반 개설</button></form></section><div className="admin-card-grid">{dashboard.groups.map(group => <article className="card admin-panel" key={group.id}><strong>{group.name}</strong><small>학생 {group.studentCount}명 · 토론 {group.debateCount}회</small></article>)}</div></>}
        {section === 'students' && <><h2>학생 관리</h2><p className="admin-lead">배정할 반을 고른 뒤 닉네임 또는 이메일로 회원을 찾아 클릭하세요.</p><section className="card admin-panel"><div className="admin-student-controls"><label><span className="admin-label">배정할 반</span><select className="input-field" value={targetGroupId} onChange={event => setTargetGroupId(event.target.value)}><option value="">반을 선택하세요</option>{dashboard.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label><span className="admin-label">회원 검색</span><span className="admin-search"><Search size={17} /><input className="input-field" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="닉네임 또는 이메일" /></span></label></div>{targetGroupId && <div className="admin-user-list">{filteredUsers.map(user => <button key={user.id} className="btn btn-secondary" onClick={() => void manage(() => addOrganizationStudent(organizationId, user.email, [targetGroupId]))}><UserPlus size={17} /><span><strong>{user.nickname}</strong><small>{user.email}</small></span></button>)}</div>}</section><section className="card admin-panel"><h3>학생 토론 기록 · 점수</h3>{dashboard.students.map(student => <article className="admin-student-row" key={student.id}><span><strong>{student.nickname}</strong><small>{student.email} · {student.groups.join(', ') || '미배정'}</small></span><span>{student.debateCount}회 · {student.averageScore}점 <button className="btn btn-secondary" onClick={() => void openStudentHistory(student.id, student.nickname)}>기록</button><button className="btn btn-secondary" onClick={() => void manage(() => removeOrganizationStudent(organizationId, student.id))}>제거</button></span></article>)}</section></>}
        {section === 'topics' && <><h2>주제 관리</h2><p className="admin-lead">기관 학생의 토론 시작 화면에 표시할 전용 주제를 만듭니다.</p><section className="card admin-panel"><form className="admin-topic-form" onSubmit={event => { event.preventDefault(); if (topicTitle.trim()) void manage(async () => { await createOrganizationTopic(organizationId, topicTitle, topicDescription); setTopicTitle(''); setTopicDescription(''); }); }}><label className="admin-label">토론 주제</label><input className="input-field" value={topicTitle} onChange={event => setTopicTitle(event.target.value)} placeholder="토론 주제를 입력하세요" required /><label className="admin-label">주제 안내 <em>(선택)</em></label><textarea className="input-textarea" value={topicDescription} onChange={event => setTopicDescription(event.target.value)} placeholder="수업 목표 또는 토론 안내" /><button className="btn btn-primary" type="submit">기관 주제 추가</button></form></section><div className="admin-card-grid">{topics.map(topic => <article className="card admin-panel" key={topic.id}><strong>{topic.title}</strong>{topic.description && <p>{topic.description}</p>}<button className="btn btn-secondary" onClick={() => void manage(() => deleteOrganizationTopic(organizationId, topic.id))}>삭제</button></article>)}</div></>}
        {managementError && <p className="form-error">{managementError}</p>}
      </div>
    </div>}
    {historyStudent && <div className="modal-overlay"><section className="modal-content admin-history-modal"><button className="icon-button" onClick={() => setHistoryStudent(null)}><X size={20} /></button><h2>{historyStudent.nickname} 학생의 토론 이력</h2>{historyLoading ? <p>불러오는 중입니다.</p> : studentRecords.length ? studentRecords.map(record => <article key={record.id}><strong>{record.topic}</strong><small>{new Date(record.completedAt).toLocaleDateString('ko-KR')} · {record.debateLevel} · {record.totalScore}점</small></article>) : <p>완료된 토론 이력이 없습니다.</p>}</section></div>}
  </main>;
};
