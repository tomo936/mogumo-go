-- =============================================================================
-- もぐもGO マイグレーション 0007（感想の 公開／非公開）
--
-- 目的（設計 docs/superpowers/specs/2026-11-12-zukan-b-reviews-design.md「公開と非公開」）:
--   1. reviews に is_public（既定 true＝公開）を足す。
--   2. 他人に見えるのは「hidden でない かつ 公開」の感想だけにする（本人は自分の分を全部見られる）。
--   3. 写真も同じ決まりにする（非公開の感想の写真は他人が開けない）。
--   4. 通報できるのは、他人に見えている感想だけにする。
--   5. 本人が is_public を書けるように列の GRANT を足す。
-- 適用: 0006 のあとに、Supabase SQL Editor に全体を貼って Run する（何度流しても同じ結果）。
--   流したあと置き直す関数は無い。
--
-- 手で確かめる（開発用 mogumo-go-dev の SQL Editor）:
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'reviews' and column_name = 'is_public';
--   → is_public / boolean / true が 1 行
-- =============================================================================

alter table public.reviews
  add column if not exists is_public boolean not null default true;

-- 2. 読む: 他人の分は「hidden でない かつ 公開」、本人の分は全部
drop policy if exists reviews_select_visible_or_own on public.reviews;
create policy reviews_select_visible_or_own
  on public.reviews for select
  to authenticated
  using ((hidden = false and is_public) or (select auth.uid()) = user_id);

-- 3. 写真: 本人のフォルダか、他人に見えている感想の写真だけ
drop policy if exists review_photos_select on storage.objects;
create policy review_photos_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'review-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.reviews r
        where r.photo_path = storage.objects.name
          and r.hidden = false
          and r.is_public
      )
    )
  );

-- 4. 通報: 他人に見えている感想だけ
drop policy if exists review_reports_insert_own on public.review_reports;
create policy review_reports_insert_own
  on public.review_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and exists (
      select 1
      from public.reviews r
      where r.review_id = review_reports.review_id
        and r.hidden = false
        and r.is_public
    )
  );

-- 5. 本人が書ける列に is_public を足す（ほかの列はそのまま）
grant insert (checkin_id, shop_id, stars, body, photo_path, is_public) on table public.reviews to authenticated;
grant update (stars, body, photo_path, is_public) on table public.reviews to authenticated;
