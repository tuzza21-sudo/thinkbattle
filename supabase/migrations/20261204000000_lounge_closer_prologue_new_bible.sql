-- Apply after 20261203000000_lounge_companion_state.sql (it needs nothing else).
-- (2026-11-02) 강무진 was rewritten from a new bible: the negotiator who turns tables over and never gives way first,
-- and loses to the member every time. His story "6개월의 연인" keeps its scene; only the three sentences that told the
-- old man (who trusted contracts over hearts, never raised his voice and settled the bill in advance with friends) now
-- tell the new one. Rooms already started keep the prologue they began with.
BEGIN;

UPDATE public.lounge_scenarios SET updated_at=now(), prologue=replace(replace(replace(prologue,
  '강무진은 사람의 마음보다 계약서를 먼저 믿는 남자였다.',
  '강무진은 단 한 번도 먼저 양보한 적 없는 남자였다.'),
  '그는 협상 테이블에서 목소리를 높이는 법이 없었다. 대신 상대가 가장 감추고 싶어 하는 약점을 찾아내고, 그 약점이 스스로 입을 열 때까지 기다렸다.',
  '첫 제안은 언제나 터무니없이 크게 던지고, 상대가 머뭇거리면 테이블을 박차고 일어났다. 그가 협상장에 들어오면 상대 측 변호사들이 먼저 물을 마셨다.'),
  '업계 사람들은 그를 두고 차갑고 지독하다고 했다. 심지어 친구들조차 그와 식사할 때면 계산서를 누가 낼지 미리 정해야 했다. 호의에는 반드시 대가가 따르고, 모호한 약속은 훗날 가장 비싼 분쟁이 된다는 것이 그의 지론이었다.',
  '업계 사람들은 그를 “판을 엎는 남자”라고 불렀다. 지는 협상은 없다. 진 것처럼 보이는 협상은 있어도, 그건 다음 판을 위한 전략일 뿐이다. 적어도 그는 그렇게 말했다.')
WHERE id='closer-contract-love';

COMMIT;
