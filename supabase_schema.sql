-- Supabase SQL Schema for ThinkFit Debate Records

-- 1. Create the debate_records table
CREATE TABLE IF NOT EXISTS public.debate_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- auth.users 참조가 필요한 경우 하단 주석 참고
    topic TEXT NOT NULL,
    time_limit INTEGER DEFAULT 0,
    game_mode TEXT DEFAULT 'debate',
    user_position TEXT DEFAULT 'affirmative',
    debate_level TEXT DEFAULT 'beginner',
    debate_focus TEXT DEFAULT 'fact',
    arguments JSONB DEFAULT '[]'::jsonb,
    final_report JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- (선택) 만약 Supabase Auth를 사용 중이라면 user_id에 외래키 조건을 걸 수 있습니다.
-- ALTER TABLE public.debate_records 
-- ADD CONSTRAINT debate_records_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.debate_records ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- 유저는 자신의 기록만 조회할 수 있음
CREATE POLICY "Users can view their own debate records"
ON public.debate_records FOR SELECT
USING (auth.uid() = user_id);

-- 유저는 자신의 기록만 생성할 수 있음
CREATE POLICY "Users can insert their own debate records"
ON public.debate_records FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 유저는 자신의 기록만 수정할 수 있음 (영어 리프레이징 등 저장 시)
CREATE POLICY "Users can update their own debate records"
ON public.debate_records FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 유저는 자신의 기록만 삭제할 수 있음
CREATE POLICY "Users can delete their own debate records"
ON public.debate_records FOR DELETE
USING (auth.uid() = user_id);

-- 4. 성능 향상을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_debate_records_user_id ON public.debate_records(user_id);
CREATE INDEX IF NOT EXISTS idx_debate_records_created_at ON public.debate_records(created_at DESC);
