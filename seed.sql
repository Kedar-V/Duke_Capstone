-- Dev seed data for local docker-compose Postgres
-- Safe to re-run (uses ON CONFLICT DO NOTHING)

begin;

insert into organizations (name, industry, company_size) values
  ('Blue Ridge SaaS', 'Software', '51-200'),
  ('Harbor Logistics', 'Logistics', '201-1000'),
  ('QuillPay', 'Finance', '51-200'),
  ('Solstice Utilities', 'Energy', '1000+'),
  ('Atlas Health', 'Healthcare', '201-1000'),
  ('Evergreen Capital', 'Finance', '201-1000'),
  ('Northwind', 'Retail', '201-1000'),
  ('CivicNow', 'Public Sector', '51-200'),
  ('BrightPath', 'Education', '201-1000'),
  ('GreenBridge', 'Climate', '51-200'),
  ('Medway Systems', 'Healthcare', '51-200'),
  ('MetroPulse', 'Public Sector', '201-1000')
on conflict (name) do nothing;

insert into domains (name) values
  ('AI/ML'),
  ('Analytics'),
  ('Data Engineering'),
  ('Product'),
  ('Web Dev')
on conflict (name) do nothing;

-- Tags (a subset used in the mock)
insert into tags (name) values
  ('Python'), ('NLP'), ('Topic Modeling'),
  ('SQL'), ('Tableau'), ('Data Modeling'),
  ('A/B Testing'), ('Mixpanel'), ('Roadmaps'),
  ('Kafka'), ('Spark'), ('AWS'),
  ('Dashboard'),
  ('Machine Learning'), ('Risk'), ('Pipelines'),
  ('Time Series'), ('Visualization'),
  ('LLM'), ('UX'), ('Prompting'),
  ('Analytics'), ('APIs'), ('Dashboards'),
  ('Product'),
  ('Data Engineering'), ('IoT'), ('Cloud'),
  ('Causal Inference'), ('R'), ('Policy'),
  ('Data Viz'), ('Storytelling'),
  ('Graph Analytics'), ('ML'),
  ('GIS')
on conflict (name) do nothing;

-- Skills (optional; keep small)
insert into skills (name) values
  ('Python'), ('TensorFlow'), ('SQL'), ('Kafka'), ('Spark'), ('AWS'), ('Tableau')
on conflict (name) do nothing;

-- Dev user (email: dev@duke.edu, password: devpassword)
insert into users (id, email, display_name, password_hash)
values (1, 'dev@duke.edu', 'Dev User', '$pbkdf2-sha256$29000$FGLM.T/nPKfUupeSUup9rw$4R2VIU4NV./x9ycRFD2aaIJ0DFJTYoAcZ0aEwvR7uiU')
on conflict (id) do nothing;

select setval('users_id_seq', greatest((select max(id) from users), 1));

insert into user_profiles (user_id, avg_match_score)
values (1, 86)
on conflict (user_id) do nothing;

insert into students (full_name, email, program) values
  ('Avery Patel', 'avery.patel@duke.edu', 'MIDS'),
  ('Jordan Lee', 'jordan.lee@duke.edu', 'MIDS'),
  ('Maya Chen', 'maya.chen@duke.edu', 'MIDS'),
  ('Riley Garcia', 'riley.garcia@duke.edu', 'MQM'),
  ('Noah Johnson', 'noah.johnson@duke.edu', 'MQM'),
  ('Sophia Nguyen', 'sophia.nguyen@duke.edu', 'MIDS'),
  ('Ethan Brooks', 'ethan.brooks@duke.edu', 'MIDS'),
  ('Olivia Davis', 'olivia.davis@duke.edu', 'MIDS'),
  ('Liam Turner', 'liam.turner@duke.edu', 'MQM'),
  ('Isabella Reed', 'isabella.reed@duke.edu', 'MIDS'),
  ('Caleb Wright', 'caleb.wright@duke.edu', 'MIDS'),
  ('Zoey Foster', 'zoey.foster@duke.edu', 'MIDS'),
  ('Lucas Kim', 'lucas.kim@duke.edu', 'MQM'),
  ('Nora Allen', 'nora.allen@duke.edu', 'MIDS'),
  ('Miles Carter', 'miles.carter@duke.edu', 'MIDS')
on conflict (email) do nothing;

-- Helper CTEs to map names to ids
with
  orgs as (select id, name from organizations),
  doms as (select id, name from domains)
insert into projects (
  title, description, duration_weeks,
  domain_id, organization_id,
  difficulty, modality,
  min_hours_per_week, max_hours_per_week,
  is_active
)
values
  (
    'NLP for Customer Support Insights',
    'Analyze support tickets and build a topic model to surface churn risk signals for service leaders.',
    8,
    (select id from doms where name='AI/ML'),
    (select id from orgs where name='Blue Ridge SaaS'),
    'Advanced', 'Remote', 10, 12, true
  ),
  (
    'Supply Chain Risk Scorecard',
    'Design a multi-factor scorecard that blends macroeconomic and vendor data to predict disruption risk.',
    10,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='Harbor Logistics'),
    'Intermediate', 'Hybrid', 8, 10, true
  ),
  (
    'Product Growth Experimentation Lab',
    'Run a funnel analysis and prioritize experiments to lift trial-to-paid conversion for a fintech app.',
    6,
    (select id from doms where name='Product'),
    (select id from orgs where name='QuillPay'),
    'Introductory', 'Remote', 6, 8, true
  ),
  (
    'Real-Time Energy Forecast Pipeline',
    'Build a streaming pipeline for hourly energy demand forecasting and alerting.',
    12,
    (select id from doms where name='Data Engineering'),
    (select id from orgs where name='Solstice Utilities'),
    'Advanced', 'In-person', 12, 15, true
  ),
  (
    'Customer Churn Early Warning',
    'Detect churn signals from support logs and usage data to inform retention.',
    8,
    (select id from doms where name='AI/ML'),
    (select id from orgs where name='Atlas Health'),
    'Intermediate', 'Remote', 8, 10, true
  ),
  (
    'ESG Signal Scoring',
    'Score ESG disclosures and build a monitoring dashboard for investors.',
    10,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='Evergreen Capital'),
    'Advanced', 'Hybrid', 10, 12, true
  ),
  (
    'Retail Demand Forecasting',
    'Forecast weekly demand by category and improve inventory planning.',
    8,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='Northwind'),
    'Intermediate', 'Remote', 8, 10, true
  ),
  (
    'Conversational FAQ Assistant',
    'Design a conversational assistant to resolve common service requests.',
    6,
    (select id from doms where name='Product'),
    (select id from orgs where name='CivicNow'),
    'Introductory', 'Remote', 6, 8, true
  ),
  (
    'Supply Chain Risk Radar',
    'Blend vendor and macro data to predict disruption risk.',
    10,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='Harbor Logistics'),
    'Advanced', 'Hybrid', 10, 12, true
  ),
  (
    'Personalized Learning Journeys',
    'Improve student engagement with personalized learning recommendations.',
    8,
    (select id from doms where name='Product'),
    (select id from orgs where name='BrightPath'),
    'Intermediate', 'Hybrid', 8, 10, true
  ),
  (
    'Energy Usage Optimization',
    'Optimize energy usage patterns with real-time telemetry data.',
    12,
    (select id from doms where name='Data Engineering'),
    (select id from orgs where name='Solstice Utilities'),
    'Advanced', 'In-person', 12, 15, true
  ),
  (
    'Climate Grant Impact Modeling',
    'Measure the impact of climate grants across communities.',
    10,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='GreenBridge'),
    'Intermediate', 'Remote', 8, 10, true
  ),
  (
    'Hospital Readmission Insights',
    'Analyze readmission patterns and build an executive dashboard.',
    6,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='Medway Systems'),
    'Introductory', 'Remote', 6, 8, true
  ),
  (
    'Fraud Pattern Discovery',
    'Detect fraud rings with graph analytics and anomaly detection.',
    10,
    (select id from doms where name='AI/ML'),
    (select id from orgs where name='QuillPay'),
    'Advanced', 'Remote', 10, 12, true
  ),
  (
    'Urban Mobility Equity',
    'Map mobility gaps and propose equitable transit solutions.',
    8,
    (select id from doms where name='Analytics'),
    (select id from orgs where name='MetroPulse'),
    'Intermediate', 'Hybrid', 8, 10, true
  )
on conflict do nothing;

-- Link tags to projects by title
with
  p as (select id, title from projects),
  t as (select id, name from tags)
insert into project_tags (project_id, tag_id)
select p.id, t.id
from (
  values
    ('NLP for Customer Support Insights', array['Python','NLP','Topic Modeling']),
    ('Supply Chain Risk Scorecard', array['SQL','Tableau','Data Modeling']),
    ('Product Growth Experimentation Lab', array['A/B Testing','Mixpanel','Roadmaps']),
    ('Real-Time Energy Forecast Pipeline', array['Kafka','Spark','AWS']),
    ('Customer Churn Early Warning', array['Python','NLP','Dashboard']),
    ('ESG Signal Scoring', array['Machine Learning','Risk','Pipelines']),
    ('Retail Demand Forecasting', array['Time Series','SQL','Visualization']),
    ('Conversational FAQ Assistant', array['LLM','UX','Prompting']),
    ('Supply Chain Risk Radar', array['Analytics','APIs','Dashboards']),
    ('Personalized Learning Journeys', array['Product','A/B Testing','SQL']),
    ('Energy Usage Optimization', array['Data Engineering','IoT','Cloud']),
    ('Climate Grant Impact Modeling', array['Causal Inference','R','Policy']),
    ('Hospital Readmission Insights', array['Data Viz','SQL','Storytelling']),
    ('Fraud Pattern Discovery', array['Graph Analytics','Python','ML']),
    ('Urban Mobility Equity', array['GIS','Policy','Dashboards'])
) as x(title, tag_names)
join p on p.title = x.title
join lateral unnest(x.tag_names) as tn(name) on true
join t on t.name = tn.name
on conflict do nothing;

commit;
