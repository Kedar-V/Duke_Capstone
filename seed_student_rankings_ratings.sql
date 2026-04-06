-- Seed deterministic dummy student ratings + rankings for testing
-- Usage:
--   psql -U postgres -d duke_capstone -f seed_student_rankings_ratings.sql
-- or
--   docker compose exec -T db psql -U postgres -d duke_capstone < seed_student_rankings_ratings.sql

begin;

-- Active student users only
with active_students as (
  select
    u.id as user_id,
    u.cohort_id
  from users u
  where u.deleted_at is null
    and u.role = 'student'
),
published_projects as (
  select
    p.project_id,
    p.cohort_id
  from projects p
  where p.deleted_at is null
    and coalesce(lower(p.project_status), 'draft') = 'published'
),
student_project_pool as (
  -- Include all published projects; prioritize same-cohort first in ranking order
  select
    s.user_id,
    p.project_id,
    case
      when s.cohort_id is not null and p.cohort_id = s.cohort_id then 0
      else 1
    end as cohort_priority
  from active_students s
  join published_projects p on true
),
ranked_candidates as (
  select
    spp.user_id,
    spp.project_id,
    row_number() over (
      partition by spp.user_id
      order by spp.cohort_priority asc, md5(spp.user_id::text || '-' || spp.project_id::text)
    ) as rank_pos
  from student_project_pool spp
),
rating_candidates as (
  -- Seed ratings for up to 12 projects per student
  select
    rc.user_id,
    rc.project_id,
    (
      1 + (
        abs((('x' || substr(md5(rc.user_id::text || '-' || rc.project_id::text || '-rating'), 1, 8))::bit(32)::int)) % 10
      )
    )::int as rating_value
  from ranked_candidates rc
  where rc.rank_pos <= 12
)
insert into ratings (user_id, project_id, rating, created_at, updated_at)
select
  user_id,
  project_id,
  rating_value,
  now(),
  now()
from rating_candidates
on conflict (user_id, project_id)
do update set
  rating = excluded.rating,
  updated_at = now();

-- Ensure one ranking row per student and mark submitted only if 10 projects are available
with active_students as (
  select
    u.id as user_id,
    u.cohort_id
  from users u
  where u.deleted_at is null
    and u.role = 'student'
),
published_projects as (
  select
    p.project_id,
    p.cohort_id
  from projects p
  where p.deleted_at is null
    and coalesce(lower(p.project_status), 'draft') = 'published'
),
student_project_pool as (
  -- Include all published projects; prioritize same-cohort first in ranking order
  select
    s.user_id,
    p.project_id,
    case
      when s.cohort_id is not null and p.cohort_id = s.cohort_id then 0
      else 1
    end as cohort_priority
  from active_students s
  join published_projects p on true
),
ranked_candidates as (
  select
    spp.user_id,
    spp.project_id,
    row_number() over (
      partition by spp.user_id
      order by spp.cohort_priority asc, md5(spp.user_id::text || '-' || spp.project_id::text)
    ) as rank_pos
  from student_project_pool spp
),
ranking_counts as (
  select
    rc.user_id,
    count(*) filter (where rc.rank_pos <= 10) as top10_count
  from ranked_candidates rc
  group by rc.user_id
)
insert into rankings (user_id, created_at, updated_at, is_submitted, submitted_at)
select
  s.user_id,
  now(),
  now(),
  (coalesce(c.top10_count, 0) = 10) as is_submitted,
  case when coalesce(c.top10_count, 0) = 10 then now() else null end as submitted_at
from active_students s
left join ranking_counts c on c.user_id = s.user_id
on conflict (user_id)
do update set
  updated_at = now(),
  is_submitted = excluded.is_submitted,
  submitted_at = excluded.submitted_at;

-- Replace ranking items for the same seeded students with deterministic top-10 list
with active_students as (
  select
    u.id as user_id,
    u.cohort_id
  from users u
  where u.deleted_at is null
    and u.role = 'student'
)
delete from ranking_items ri
using rankings r, active_students s
where ri.ranking_id = r.id
  and r.user_id = s.user_id;

with active_students as (
  select
    u.id as user_id,
    u.cohort_id
  from users u
  where u.deleted_at is null
    and u.role = 'student'
),
published_projects as (
  select
    p.project_id,
    p.cohort_id
  from projects p
  where p.deleted_at is null
    and coalesce(lower(p.project_status), 'draft') = 'published'
),
student_project_pool as (
  -- Include all published projects; prioritize same-cohort first in ranking order
  select
    s.user_id,
    p.project_id,
    case
      when s.cohort_id is not null and p.cohort_id = s.cohort_id then 0
      else 1
    end as cohort_priority
  from active_students s
  join published_projects p on true
),
ranked_candidates as (
  select
    spp.user_id,
    spp.project_id,
    row_number() over (
      partition by spp.user_id
      order by spp.cohort_priority asc, md5(spp.user_id::text || '-' || spp.project_id::text)
    ) as rank_pos
  from student_project_pool spp
),
seeded_rankings as (
  select
    r.id as ranking_id,
    r.user_id
  from rankings r
  join active_students s on s.user_id = r.user_id
)
insert into ranking_items (ranking_id, project_id, rank, added_at)
select
  sr.ranking_id,
  rc.project_id,
  rc.rank_pos,
  now()
from seeded_rankings sr
join ranked_candidates rc
  on rc.user_id = sr.user_id
where rc.rank_pos <= 10
order by sr.ranking_id, rc.rank_pos;

-- Quick sanity output
-- 1) students with rankings + items
select
  count(*) as ranking_rows,
  count(*) filter (where is_submitted) as submitted_ranking_rows
from rankings r
join users u on u.id = r.user_id
where u.deleted_at is null
  and u.role = 'student';

-- 2) total ranking items + ratings seeded for active students
select
  (select count(*) from ranking_items ri
     join rankings r on r.id = ri.ranking_id
     join users u on u.id = r.user_id
     where u.deleted_at is null and u.role = 'student') as ranking_items_rows,
  (select count(*) from ratings rt
     join users u on u.id = rt.user_id
     where u.deleted_at is null and u.role = 'student') as ratings_rows;

commit;
