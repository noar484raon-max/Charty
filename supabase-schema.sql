-- ============================================
-- Charty Database Schema
-- Supabase SQL Editor에서 이 파일 전체를 복사해서 실행하세요
-- ============================================

-- 1) 프로필 테이블 (Supabase Auth 유저와 연결)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  bio text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 새 유저 가입 시 자동으로 프로필 생성하는 트리거
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'user_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) 메모 테이블
create table if not exists memos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  asset_symbol text not null,
  asset_type text not null,
  content text not null,
  sentiment text check (sentiment in ('BULLISH', 'BEARISH', 'NEUTRAL')) default 'NEUTRAL',
  pin_price numeric,
  pin_timestamp bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3) 좋아요 테이블
create table if not exists likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  memo_id uuid references memos(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, memo_id)
);

-- 4) 댓글 테이블
create table if not exists comments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  memo_id uuid references memos(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- 5) 북마크 테이블
create table if not exists bookmarks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  memo_id uuid references memos(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, memo_id)
);

-- 6) 팔로우 테이블
create table if not exists follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references profiles(id) on delete cascade not null,
  following_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_id, following_id)
);

-- ============================================
-- Row Level Security (RLS) 정책
-- ============================================

alter table profiles enable row level security;
alter table memos enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;
alter table bookmarks enable row level security;
alter table follows enable row level security;

-- 프로필: 누구나 읽기 가능, 본인만 수정
create policy "Profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- 메모: 누구나 읽기, 로그인 유저 작성, 본인만 수정/삭제
create policy "Memos are viewable by everyone" on memos for select using (true);
create policy "Authenticated users can create memos" on memos for insert with check (auth.uid() = user_id);
create policy "Users can update own memos" on memos for update using (auth.uid() = user_id);
create policy "Users can delete own memos" on memos for delete using (auth.uid() = user_id);

-- 좋아요: 누구나 읽기, 로그인 유저 토글
create policy "Likes are viewable by everyone" on likes for select using (true);
create policy "Authenticated users can like" on likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike" on likes for delete using (auth.uid() = user_id);

-- 댓글: 누구나 읽기, 로그인 유저 작성, 본인만 삭제
create policy "Comments are viewable by everyone" on comments for select using (true);
create policy "Authenticated users can comment" on comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments" on comments for delete using (auth.uid() = user_id);

-- 북마크: 본인 것만 읽기/쓰기/삭제
create policy "Users can view own bookmarks" on bookmarks for select using (auth.uid() = user_id);
create policy "Users can bookmark" on bookmarks for insert with check (auth.uid() = user_id);
create policy "Users can remove bookmark" on bookmarks for delete using (auth.uid() = user_id);

-- 팔로우: 누구나 읽기, 로그인 유저 팔로우/언팔로우
create policy "Follows are viewable by everyone" on follows for select using (true);
create policy "Authenticated users can follow" on follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on follows for delete using (auth.uid() = follower_id);

-- ============================================
-- 유용한 뷰 (메모 + 작성자 + 카운트)
-- ============================================

create or replace view memo_feed as
select
  m.id,
  m.user_id,
  m.asset_symbol,
  m.asset_type,
  m.content,
  m.sentiment,
  m.pin_price,
  m.pin_timestamp,
  m.created_at,
  p.username as author_username,
  p.display_name as author_display_name,
  p.avatar_url as author_avatar_url,
  (select count(*) from likes l where l.memo_id = m.id) as like_count,
  (select count(*) from comments c where c.memo_id = m.id) as comment_count
from memos m
join profiles p on p.id = m.user_id
order by m.created_at desc;
