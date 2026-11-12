-- =============================================================================
-- もぐもGO マイグレーション 0008（ニックネームを見せる人を「公開の感想がある人」だけにする）
--
-- 目的: 0007 で感想に公開・非公開ができた。public_profiles（他人に見せるニックネーム）の条件が
--   「hidden でない感想がある人」のままだと、非公開の感想しか無い人のニックネームも、
--   user_id が分かれば引けてしまう。条件に is_public を足す（2026-11-12 レビューの指摘・オーナー承認）。
-- 適用: 0007 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--
-- 手で確かめる:
--   select pg_get_viewdef('public.public_profiles'::regclass);
--   → 中に「is_public」が入っていれば OK
-- =============================================================================

create or replace view public.public_profiles
  with (security_invoker = false, security_barrier = true) as
select p.user_id, p.nickname
from public.profiles p
where exists (
  select 1 from public.reviews r
  where r.user_id = p.user_id and r.hidden = false and r.is_public
);

revoke all on table public.public_profiles from public, anon, authenticated, service_role;
grant select on table public.public_profiles to authenticated;
grant select on table public.public_profiles to service_role;
