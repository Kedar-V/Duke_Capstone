begin;

-- Legacy cleanup steps (project_id-based schema)
-- Use only if you need to reset ranking_items to match the current schema.

alter table ranking_items add column if not exists project_id bigint;

-- No legacy mapping now → wipe rows
delete from ranking_items;

alter table ranking_items drop constraint if exists ranking_items_pkey;
alter table ranking_items drop constraint if exists ranking_items_project_id_fkey;

alter table ranking_items
  add constraint ranking_items_project_id_fkey
  foreign key (project_id) references projects(project_id) on delete cascade;

alter table ranking_items
  add primary key (ranking_id, project_id);

commit;