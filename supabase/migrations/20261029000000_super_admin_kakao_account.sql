-- Apply after 20261028000000_user_first_touch.sql.
-- The developer's Kakao login (piorne@naver.com on Kakao) is a separate auth user whose sign-in email is empty, because the
-- same address already belongs to the email account. The email comparison therefore never matched it. It is now recognised by
-- its own account id, which the member cannot change (unlike the profile data Kakao hands over, which they can edit).
BEGIN;
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'piorne@naver.com'
    OR auth.uid() = 'd8771e72-7ae4-4402-b8cc-dc52e13bebff'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.ensure_developer_b2b_access()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE developer_org_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT organization_id INTO developer_org_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid() AND role = 'owner'
  LIMIT 1;

  IF developer_org_id IS NULL THEN
    INSERT INTO public.organizations (name) VALUES ('ThinkFit 개발자 테스트 기관')
    RETURNING id INTO developer_org_id;
    INSERT INTO public.organization_memberships (organization_id, user_id, role)
    VALUES (developer_org_id, auth.uid(), 'owner');
    INSERT INTO public.organization_groups (organization_id, name)
    VALUES (developer_org_id, '테스트 그룹');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
COMMIT;
