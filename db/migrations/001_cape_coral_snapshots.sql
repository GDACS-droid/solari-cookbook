-- AcreBrief production snapshot state. Apply to an approved transactional
-- PostgreSQL database before enabling a Vercel cron route.
create table if not exists source_runs (
  run_id uuid primary key,
  source_id text not null,
  status text not null check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  schema_fingerprint text,
  records_observed integer not null default 0,
  transitions_emitted integer not null default 0,
  error_code text,
  error_message text
);

create table if not exists source_leases (
  source_id text primary key,
  lease_owner uuid not null,
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists source_snapshots (
  source_id text primary key,
  generation bigint not null,
  completed_at timestamptz not null,
  schema_fingerprint text not null,
  coverage text not null check (coverage in ('FULL', 'DELTA', 'WATCHLIST')),
  window_start timestamptz not null,
  window_end timestamptz not null
);

create table if not exists source_snapshot_items (
  source_id text not null references source_snapshots(source_id) on delete cascade,
  native_record_key text not null,
  parcel_id text,
  site_address text,
  source_event_at timestamptz,
  source_updated_at timestamptz,
  state jsonb not null,
  state_fingerprint text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (source_id, native_record_key)
);

create index if not exists snapshot_items_by_parcel
  on source_snapshot_items (parcel_id) where parcel_id is not null;

create table if not exists event_transitions (
  transition_id text primary key,
  source_id text not null,
  native_record_key text not null,
  parcel_id text,
  site_address text,
  event_type text not null,
  event_date timestamptz not null,
  event_clock_basis text not null check (event_clock_basis in ('SOURCE_EVENT', 'SOURCE_UPDATE', 'ACREBRIEF_DETECTION')),
  first_seen_at timestamptz not null,
  source_updated_at timestamptz,
  before_fingerprint text,
  after_fingerprint text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists transitions_by_event_date on event_transitions (event_date desc);
create index if not exists transitions_by_parcel on event_transitions (parcel_id, event_date desc) where parcel_id is not null;

create table if not exists pilot_requests (
  pilot_request_id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  source text not null default 'acrebrief-web',
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_pilot_request_per_email
  on pilot_requests (lower(email));

-- The SQL adapter must update source_snapshots, upsert items, and insert
-- event_transitions in one SERIALIZABLE transaction guarded by generation.
-- Lease acquisition must atomically replace only an expired lease; every
-- terminal path should release its owned lease, while expiry recovers crashes.
