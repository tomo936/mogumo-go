-- 0016 ゲストも「自分だけ」（非公開）の感想なら書ける（2026-11-18 オーナー決定）
--   公開（is_public = true）にできるのは Google をつないだ人だけ。通報はゲスト不可のまま（0013 の review_reports_insert_not_guest）。
--   非公開の感想の写真は本人だけが読める（0007 の review_photos_select）ので、ゲストの写真も許す。
--   何度流しても同じ結果。0013 のあとに流す。

drop policy if exists reviews_insert_not_guest on public.reviews;
create policy reviews_insert_not_guest
  on public.reviews as restrictive for insert
  to authenticated
  with check (not public.is_guest() or not is_public);

drop policy if exists reviews_update_not_guest on public.reviews;
create policy reviews_update_not_guest
  on public.reviews as restrictive for update
  to authenticated
  using (true)
  with check (not public.is_guest() or not is_public);

drop policy if exists review_photos_insert_not_guest on storage.objects;
