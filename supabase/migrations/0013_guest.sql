-- =============================================================================
-- もぐもGO マイグレーション 0013（ゲストで始める A3）
--
-- 決まり（設計 docs/superpowers/specs/2026-11-17-guest-login-design.md）:
--   - ゲスト = Supabase の匿名ログイン。JWT の is_anonymous が true。役割は authenticated のまま。
--   - ゲストも遊ぶことは全部できる。感想の投稿（写真の保存を含む）と通報だけはできない（Google をつないでから）。
--   - いまある決まり（permissive policy）はそのままにして、「制限の決まり（restrictive policy）」を足す。
--     restrictive は、ほかの決まりで許されていても、これを満たさないと断る。
-- 適用: 0012 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--
-- 手で確かめる: ゲストでログインした iPhone で、お店のシートの「✎ 感想」が「Google をつないでね」になる。
--   SQL で見る: select policyname, permissive from pg_policies where policyname like '%not_guest%';  → 4 行・RESTRICTIVE
-- =============================================================================

-- ゲストか（JWT の is_anonymous。無いときはゲストでない扱い）
create or replace function public.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

revoke all on function public.is_guest() from public, anon;
grant execute on function public.is_guest() to authenticated, service_role;

drop policy if exists reviews_insert_not_guest on public.reviews;
create policy reviews_insert_not_guest
  on public.reviews as restrictive for insert
  to authenticated
  with check (not public.is_guest());

drop policy if exists reviews_update_not_guest on public.reviews;
create policy reviews_update_not_guest
  on public.reviews as restrictive for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

drop policy if exists review_reports_insert_not_guest on public.review_reports;
create policy review_reports_insert_not_guest
  on public.review_reports as restrictive for insert
  to authenticated
  with check (not public.is_guest());

drop policy if exists review_photos_insert_not_guest on storage.objects;
create policy review_photos_insert_not_guest
  on storage.objects as restrictive for insert
  to authenticated
  with check (bucket_id <> 'review-photos' or not public.is_guest());
