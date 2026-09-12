-- Better Auth rate-limit counters (rateLimit.storage = "database").
create table "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" integer not null
);
