alter table pilot_requests
  add column if not exists company text check (company is null or char_length(company) <= 120),
  add column if not exists workflow text check (workflow is null or char_length(workflow) <= 500),
  add column if not exists follow_up_consent boolean not null default false,
  add column if not exists consent_at timestamptz;

create table if not exists pilot_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists pilot_requests_by_created_at
  on pilot_requests (created_at desc);
