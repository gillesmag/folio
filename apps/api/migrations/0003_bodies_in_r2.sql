-- Document bodies (source, rendered HTML, render metadata) moved to R2 under
-- docs/<id>/<version>.json. The row keeps only the index fields.
alter table "document" drop column "source";
alter table "document" drop column "html";
alter table "document" drop column "meta";
