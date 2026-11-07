/**
 * The super admin as the server knows the account (2026-11-07): the email account and the Kakao account of the same person
 * (see is_super_admin() in supabase/migrations/20261029000000_super_admin_kakao_account.sql). The server uses it to leave
 * the admin's voice calls without a limit; the database (lounge_call_exempt) says the same for the minutes in calls.
 */
export const loungeSuperAdminEmail = 'piorne@naver.com';
export const loungeSuperAdminIds = ['d8771e72-7ae4-4402-b8cc-dc52e13bebff'] as const;
export const isLoungeSuperAdmin = (user: { id: string; email?: string | null }) =>
  loungeSuperAdminIds.includes(user.id.toLowerCase() as typeof loungeSuperAdminIds[number]) || (user.email ?? '').toLowerCase() === loungeSuperAdminEmail;
