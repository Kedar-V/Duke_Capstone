-- Seed deterministic teammate preferences (mutual wants + mutual avoids) with comments
-- Compatible with current schema and can be loaded with psql.
--
-- Usage:
--   psql -U postgres -d duke_capstone -f seed_teammate_preferences.sql
-- or
--   docker compose exec -T db psql -U postgres -d duke_capstone < seed_teammate_preferences.sql
--
-- Notes:
-- - This script stores comment-bearing payload in JSON text form inside `payload_ciphertext`.
-- - Backend read paths now support both encrypted Fernet payload and JSON payload for seed/dev data.

begin;

with active_students as (
  select
    u.id as user_id,
    lower(u.email) as email,
    u.cohort_id,
    s.id as student_id
  from users u
  join students s on lower(s.email) = lower(u.email)
  where u.deleted_at is null
    and u.role = 'student'
    and u.email is not null
    and s.id is not null
),
ordered as (
  select
    a.*,
    row_number() over (partition by a.cohort_id order by a.user_id) as rn,
    count(*) over (partition by a.cohort_id) as cohort_count
  from active_students a
),
want_seed as (
  -- Pair adjacent students (1<->2, 3<->4, ...) for mutual WANT
  select
    left_side.user_id,
    right_side.student_id as target_student_id,
    right_side.user_id as target_user_id,
    'want'::text as preference,
    format('Great teammate fit for project collaboration (%s ↔ %s).', left_side.user_id, right_side.user_id) as comment
  from ordered left_side
  join ordered right_side
    on right_side.cohort_id is not distinct from left_side.cohort_id
   and right_side.rn = case
     when mod(left_side.rn, 2) = 1 then left_side.rn + 1
     else left_side.rn - 1
   end
),
avoid_seed_base as (
  -- Create base avoid pairs using every 4-student block: (1<->3) and (2<->4)
  select
    a.user_id,
    b.student_id as target_student_id,
    b.user_id as target_user_id
  from ordered a
  join ordered b
    on b.cohort_id is not distinct from a.cohort_id
   and b.rn = case
     when mod(a.rn, 4) in (1, 2) then a.rn + 2
     else a.rn - 2
   end
  where a.cohort_count >= 4
),
avoid_seed as (
  select
    user_id,
    target_student_id,
    target_user_id,
    'avoid'::text as preference,
    format('Prefer to avoid same team this term due to scheduling/work-style mismatch (%s ↔ %s).', user_id, target_user_id) as comment
  from avoid_seed_base
),
seed_rows as (
  select * from want_seed
  union all
  select * from avoid_seed
),
seeded_users as (
  select distinct user_id from seed_rows
),
cleared as (
  delete from teammate_preferences tp
  using seeded_users su
  where tp.user_id = su.user_id
  returning tp.user_id
)
insert into teammate_preferences (
  user_id,
  student_id_hash,
  payload_ciphertext,
  student_id,
  preference,
  created_at
)
select
  sr.user_id,
  md5(sr.target_student_id::text) as student_id_hash,
  json_build_object(
    'student_id', sr.target_student_id,
    'preference', sr.preference,
    'comment', sr.comment,
    'avoid_reason', sr.comment
  )::text as payload_ciphertext,
  sr.target_student_id as student_id,
  sr.preference,
  now()
from seed_rows sr
;

-- Sanity checks
select
  count(*) as teammate_pref_rows,
  count(*) filter (where preference = 'want') as want_rows,
  count(*) filter (where preference = 'avoid') as avoid_rows
from teammate_preferences
where preference in ('want', 'avoid');

select
  user_id,
  count(*) filter (where preference = 'want') as wants,
  count(*) filter (where preference = 'avoid') as avoids
from teammate_preferences
where preference in ('want', 'avoid')
group by user_id
order by user_id
limit 15;

commit;
