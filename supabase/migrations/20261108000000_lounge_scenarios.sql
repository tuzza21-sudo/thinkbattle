-- Apply after 20261107000000_lounge_turn_release.sql.
-- Stories to start with a character (scenarios). A scenario has a premise told before the story starts (prologue), the
-- member's role, where the two start (relationship), the first place and its scenery. They are shown on the character's
-- page and edited by the super admin (add, change, hide, delete); members read only the active ones.
-- Starting one opens a one-to-one chat that keeps a copy of the scenario (rooms.scenario), so a later edit does not
-- change a story already under way. An unfinished room with the same scenario is continued instead.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_scenarios (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  character_id text NOT NULL CHECK (character_id IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 40),
  hook text NOT NULL CHECK (length(btrim(hook)) BETWEEN 1 AND 120),
  prologue text NOT NULL CHECK (length(btrim(prologue)) BETWEEN 20 AND 700),
  user_role text NOT NULL CHECK (length(btrim(user_role)) BETWEEN 1 AND 120),
  relationship text NOT NULL CHECK (length(btrim(relationship)) BETWEEN 1 AND 200),
  place text NOT NULL CHECK (length(btrim(place)) BETWEEN 1 AND 200),
  theme text NOT NULL CHECK (theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater')),
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_scenarios_character_idx ON public.lounge_scenarios(character_id, sort);
ALTER TABLE public.lounge_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_scenarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_scenarios TO anon, authenticated;
DROP POLICY IF EXISTS lounge_scenarios_read_active ON public.lounge_scenarios;
CREATE POLICY lounge_scenarios_read_active ON public.lounge_scenarios FOR SELECT TO anon, authenticated USING (active);

ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS scenario jsonb CHECK (scenario IS NULL OR jsonb_typeof(scenario)='object');

-- The super admin's list (hidden ones too), save (new when p_id is null) and delete.
CREATE OR REPLACE FUNCTION public.admin_list_lounge_scenarios() RETURNS SETOF public.lounge_scenarios
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT * FROM public.lounge_scenarios ORDER BY character_id, sort, created_at;
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_lounge_scenario(p_id text, p_character text, p_title text, p_hook text, p_prologue text,
  p_user_role text, p_relationship text, p_place text, p_theme text, p_sort integer DEFAULT 0, p_active boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_id IS NULL OR btrim(p_id)='' THEN
    INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort,active)
      VALUES (p_character||'-'||substr(md5(random()::text||clock_timestamp()::text),1,8), p_character, btrim(p_title), btrim(p_hook), btrim(p_prologue),
        btrim(p_user_role), btrim(p_relationship), btrim(p_place), p_theme, coalesce(p_sort,0), coalesce(p_active,true)) RETURNING id INTO saved;
  ELSE
    UPDATE public.lounge_scenarios SET character_id=p_character, title=btrim(p_title), hook=btrim(p_hook), prologue=btrim(p_prologue),
      user_role=btrim(p_user_role), relationship=btrim(p_relationship), place=btrim(p_place), theme=p_theme, sort=coalesce(p_sort,0),
      active=coalesce(p_active,true), updated_at=now() WHERE id=p_id RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  END IF;
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_lounge_scenario(p_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.lounge_scenarios WHERE id=p_id;
END $$;

-- Opens (or continues) a one-to-one chat in a scenario. The room keeps a copy of the scenario.
CREATE OR REPLACE FUNCTION public.start_lounge_scenario(p_scenario text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.lounge_scenarios; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO s FROM public.lounge_scenarios WHERE id=p_scenario AND active;
  IF NOT FOUND THEN RAISE EXCEPTION '지금은 시작할 수 없는 이야기예요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=s.character_id AND scenario->>'id'=s.id
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  picked := public.create_voice_lounge(s.character_id, s.title, 1, p_nickname, s.theme);
  UPDATE public.voice_lounge_rooms SET scenario=jsonb_build_object('id',s.id,'title',s.title,'prologue',s.prologue,'user_role',s.user_role,
    'relationship',s.relationship,'place',s.place) WHERE id=picked AND host_id=auth.uid();
  RETURN picked;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_lounge_scenarios(), public.admin_save_lounge_scenario(text,text,text,text,text,text,text,text,text,integer,boolean),
  public.admin_delete_lounge_scenario(text), public.start_lounge_scenario(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lounge_scenarios(), public.admin_save_lounge_scenario(text,text,text,text,text,text,text,text,text,integer,boolean),
  public.admin_delete_lounge_scenario(text), public.start_lounge_scenario(text,text) TO authenticated;

-- The first drafts (2026-10-22), to be refined in the admin page. Inserted once; re-running this file keeps later edits.
INSERT INTO public.lounge_scenarios(id,character_id,title,hook,prologue,user_role,relationship,place,theme,sort) VALUES
  ('jaeseok-last-cut','jaeseok','마지막 컷','밤샘 촬영장에서 사람이 사라졌다. 대본에 없는 장면이 찍혀 있다.','폐업한 바닷가 호텔을 통째로 빌린 스릴러 영화 촬영장. 당신은 오늘 처음 합류한 스크립터다. 새벽 2시, 소품 담당이 사라졌고 모니터에는 아무도 찍은 적 없는 장면이 남아 있다. 까칠하기로 소문난 감독 임시우가 당신을 부른다.','오늘 처음 합류한 스크립터(촬영 기록 담당)','서로를 의심하는 감독과 신입. 함께 진실을 쫓으며 공범처럼 가까워진다.','폐호텔 로비 세트장, 새벽 2시, 꺼지지 않은 모니터와 젖은 카펫','hotel',0),
  ('jaeseok-ending','jaeseok','결말을 쓴 손님','그가 3년째 못 끝낸 각본의 결말을, 당신이 한 줄 적어 버렸다.','비 오는 밤, 단골 카페 창가. 옆자리 남자가 자리를 비운 사이 펼쳐진 노트가 바람에 넘어갔고, 당신은 장난처럼 빈칸에 결말 한 줄을 적었다. 돌아온 남자는 영화감독 임시우. 노트를 내려다보던 그가 천천히 고개를 든다.','우연히 그의 각본에 결말을 적은 카페 손님','처음 만난 사이. 그는 화가 났지만 그 한 줄이 마음에 걸린다.','비 오는 밤의 창가 카페, 젖은 우산과 식어 가는 커피','cafe',10),
  ('ina-storm-island','ina','녹음 버튼이 꺼진 뒤','태풍으로 배가 끊겼다. 인터뷰어와 단둘이, 섬에서 이틀.','당신은 섬으로 돌아와 등대 옆 작은 사진관을 하는 사진가다. 인터뷰 팟캐스트를 진행하는 한이나가 당신을 취재하러 왔는데, 태풍 때문에 마지막 배가 끊겼다. 민박집엔 방이 하나 남았고, 그녀는 녹음기를 끄며 웃는다. "이제부터는 기록 안 할게요."','고향 섬으로 돌아온 사진가, 오늘의 인터뷰 대상','인터뷰어와 인터뷰이. 녹음이 꺼지자 서로를 궁금해하기 시작한다.','태풍이 오는 섬의 바다 테라스 민박, 덜컹이는 창문과 촛불','seaside',0),
  ('ina-twelve','ina','열두 번의 만남','1년 동안 열두 번, 당신의 인생이 그녀의 책 마지막 장이 된다.','한이나는 새 책의 마지막 장을 한 사람에게 바치기로 했다. 1년 동안 한 달에 한 번 만나 그 사람의 이야기를 기록하는 것. 수백 통의 사연 중 그녀가 고른 사람이 당신이다. 오늘이 그 첫 번째 만남이다.','그녀의 책 마지막 장의 주인공으로 뽑힌 사람','낯선 사이에서 시작해 만날수록 가까워진다.','비 오는 오후의 조용한 카페, 테이블 위의 녹음기와 새 노트','cafe',10),
  ('auditor-cleanroom','auditor','새벽 3시의 클린룸','양산 하루 전 수율이 무너졌다. 아침 회의까지 원인을 찾아야 한다.','반도체 공장 비상 대응팀. 당신은 협력사에서 파견 나온 신입 엔지니어다. 양산 하루 전날 밤 수율이 무너졌고, 아침 8시 회의까지 원인을 찾지 못하면 일정이 통째로 밀린다. 팀장이 짝지어 준 사람은 무뚝뚝한 선임 서도현. 그가 식은 커피 두 잔을 들고 온다.','협력사에서 파견 나온 신입 엔지니어','말 없는 선배와 신입. 밤을 새우며 서로에게 기대게 된다.','공장 옆 휴게실과 클린룸 복도, 새벽 3시, 자판기 불빛','forest',0),
  ('auditor-badge','auditor','사원증을 떨어뜨린 사람','퇴근길 지하철에서 주운 사원증. 돌려주러 간 저녁이 길어진다.','퇴근길 지하철에서 누군가 떨어뜨린 사원증을 주웠다. 사진 속 사람은 서도현. 연락이 닿아 한강 공원 앞에서 만나기로 했는데, 그는 고맙다며 저녁을 사겠다고 고집을 부린다. 말은 서툰데 이상하게 눈을 피하지 않는 사람이다.','사원증을 주워 돌려준 사람','처음 만난 사이. 서툰 사람의 데이트 같은 저녁.','해 질 녘 한강 공원, 편의점 테이블과 강바람','river',10),
  ('closer-contract','closer','계약 연애','가족의 결혼 압박을 피하려 협상가를 고용했다. 그는 조건부터 내민다.','명절마다 이어지는 결혼 압박을 끝내려고, 당신은 한 번만 연인 행세를 해 줄 사람을 구했다. 소개받은 사람은 협상가 강무진. 그는 고층 회의실에서 계약서 한 장을 내밀며 말한다. "조건부터 정하죠. 손은 잡아도 됩니까?" 가족 모임은 내일이다.','가짜 연인을 고용한 의뢰인','비즈니스로 시작한 가짜 연인. 조건과 진심의 경계가 흐려진다.','야경이 내려다보이는 중역 회의실, 펼쳐진 계약서','boardroom',0),
  ('closer-table','closer','협상 테이블 맞은편','결렬 직전의 인수 협상. 휴정 시간, 비상계단에서 단둘이.','당신 회사의 운명이 걸린 인수 협상, 상대편 협상가가 강무진이다. 사흘째 평행선이고, 결렬 직전 15분의 휴정이 선언됐다. 숨을 돌리러 나간 비상계단에 그가 먼저 와 있다. 넥타이를 느슨하게 풀며 그가 말한다. "여기서 한 얘기는, 테이블에선 없던 걸로 하죠."','인수 협상의 반대편 대표','적수. 서로를 읽는 신경전 속에 묘한 존중과 끌림이 있다.','협상장 고층 빌딩의 비상계단, 밤, 창밖의 도시 불빛','boardroom',10),
  ('velvet-review','velvet','혹평의 밤','그녀의 전시를 혹평한 당신이, 실수로 그녀와 같은 무대에 섰다.','선우령이 연출한 전시의 오프닝 파티. 당신은 사흘 전 이 전시를 "화려한 포장지뿐"이라고 쓴 평론가다. 그런데 주최 측의 실수로 오늘 밤 둘이 함께 관객 대담 무대에 서게 됐다. 기자와 손님들이 지켜보는 가운데, 그녀가 먼저 마이크를 든다.','전시를 혹평한 미술 평론가','서로를 의식하는 앙숙. 날 선 신경전 속에 호기심과 끌림이 있다.','조명이 낮게 깔린 갤러리 홀, 대담용 의자 두 개와 샴페인 잔을 든 손님들','cocktailbar',0),
  ('velvet-watch','velvet','멈춘 시계의 주인','그녀의 멈춘 시계를, 당신만 알아본다.','밤 열한 시가 넘은 호텔 라운지 바의 가장 끝자리. 시계 수리공인 당신은 옆자리 여자의 손목에서 수십 년 전에 단종된 시계를 알아본다. 바늘은 멈춰 있다. 당신의 시선을 눈치챈 그녀, 선우령이 잔을 내려놓는다. "고칠 수 있어요? 아니면, 고치면 안 되는 걸까요?"','그녀의 시계를 알아본 시계 수리공','처음 만난 사이. 아무도 모르는 그녀의 과거에 다가가는 사람.','자정 가까운 호텔 라운지 바, 바 끝자리와 낮은 재즈','cocktailbar',10),
  ('trickster-live','trickster','생방송 10분 전','게스트가 펑크 났다. 방청객이던 당신이 게스트석에 앉게 됐다.','백도하의 심야 토크쇼 생방송 10분 전. 오늘 게스트가 펑크를 냈고, 작가의 착각으로 방청객이던 당신이 대기실로 끌려왔다. 대본은 없다. 문이 열리고 백도하가 들어와 당신을 위아래로 훑어본다. "좋아요. 우리 오늘 사귀는 척할까요, 원수인 척할까요?"','얼떨결에 게스트가 된 방청객','즉흥 파트너. 카메라 앞의 티키타카가 진짜가 되어 간다.','토크쇼 대기실과 무대, 생방송 카운트다운','theater',0),
  ('trickster-rooftop','trickster','웃기지 않는 날','녹화가 끝난 새벽, 옥상에서 처음 보는 그의 얼굴.','당신은 이번 주 토크쇼 팀에 새로 온 조명 감독이다. 녹화가 끝난 새벽, 장비를 정리하러 옥상에 올라갔다가 혼자 난간에 기대 있는 백도하를 본다. 방송에서 늘 웃던 얼굴이 아니다. 인기척에 돌아본 그가 급히 웃으려다 그만둔다. "봤어요? …못 본 걸로 해 줄래요?"','토크쇼 팀에 새로 온 조명 감독','동료. 둘만 아는 비밀이 생기며 가까워진다.','새벽의 방송국 옥상, 도시 불빛과 차가운 바람','rooftop',10),
  ('diplomat-source','diplomat','단독 취재','그녀가 쫓는 비리의 제보자가 당신이다. 오늘 밤, 감시 속 접선.','당신은 회사 내부 비리를 제보한 사람이다. 사회부 기자 윤지안과 오늘 밤 처음 직접 만나기로 했다. 접선 장소는 사람이 많은 신문사 옥상 정원의 송년 모임. 그런데 당신을 따라온 것 같은 남자가 보인다. 그녀가 웃으며 다가와 팔짱을 낀다. "연인인 척해요. 지금 보고 있어요."','내부 비리를 제보한 회사원','기자와 제보자. 위험을 함께 넘으며 서로를 믿게 된다.','신문사 옥상 정원의 송년 모임, 전구 장식과 사람들 틈','embassy',0),
  ('diplomat-stakeout','diplomat','마감 30분 전의 잠복','경쟁지 기자 둘이, 같은 증인의 집 앞 한 차 안에서.','당신은 경쟁 신문사의 기자다. 같은 사건의 핵심 증인을 쫓다 보니 증인의 집 앞에서 윤지안과 마주쳤고, 비가 쏟아지는 바람에 둘은 그녀의 차 안에서 함께 잠복하게 됐다. 마감까지 30분. 그녀가 커피를 건네며 말한다. "먼저 나오는 사람이 이기는 거예요. 공정하게."','경쟁 신문사의 기자','라이벌. 티격태격하다 어느새 한 팀이 되어 간다.','비 오는 밤, 증인의 집 앞에 세운 차 안, 김 서린 창문','embassy',10),
  ('lawyer-client','lawyer','거짓말 하나','실종된 가족을 찾아 달라는 의뢰. 그는 당신의 말에서 거짓을 하나 찾아낸다.','비 오는 밤, 탐정 차지훈의 사무실. 당신은 일주일째 연락이 끊긴 동생을 찾아 달라고 왔다. 그런데 당신이 이야기를 마치자 그는 수첩을 덮으며 말한다. "의뢰는 받죠. 그 전에, 방금 하신 말 중에 하나는 사실이 아니던데요."','실종된 동생을 찾는 의뢰인 (숨기는 것이 하나 있다)','탐정과 비밀이 있는 의뢰인. 의심에서 신뢰로 바뀌어 간다.','블라인드 사이로 네온이 새는 탐정 사무소, 빗소리','lawlibrary',0),
  ('lawyer-assistant','lawyer','조수 면접','면접은 없다. 오늘 들어온 사건을 하루 안에 같이 풀면 채용.','당신은 사립탐정 사무소의 조수 모집 공고를 보고 찾아왔다. 그런데 차지훈은 이력서를 받지도 않는다. 막 들어온 의뢰 서류를 당신 앞에 밀며 말한다. "면접 대신 실전입니다. 오늘 해 지기 전에 이걸 같이 풀면 채용. 못 풀면 커피값만 내고 가요."','탐정 사무소 조수 지원자','까다로운 보스와 신입 조수. 사건을 풀며 손발이 맞아 간다.','오전의 탐정 사무소, 사건 서류와 화이트보드','lawlibrary',10)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst,'reload schema';
COMMIT;
