begin;

-- -- Add org_name column if missing
-- alter table cart_items add column if not exists org_name text;

-- -- If old data exists with project_id, wipe it (no mapping now)
-- delete from cart_items;

-- -- Drop old project_id if it exists
-- alter table cart_items drop column if exists project_id;

-- -- Add FK + PK
-- alter table cart_items
--   add constraint fk_cart_items_org
--   foreign key (org_name) references client_intake_forms(org_name) on delete cascade;

-- alter table cart_items
--   drop constraint if exists cart_items_pkey;

-- alter table cart_items
--   add primary key (cart_id, org_name);

alter table ranking_items add column if not exists org_name text;

-- No legacy mapping now → wipe rows
delete from ranking_items;

alter table ranking_items drop column if exists project_id;

alter table ranking_items
  add constraint fk_ranking_items_org
  foreign key (org_name) references client_intake_forms(org_name) on delete cascade;

alter table ranking_items
  drop constraint if exists ranking_items_pkey;

alter table ranking_items
  add primary key (ranking_id, org_name);

commit;