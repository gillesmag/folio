-- Personal documents have no organization. Existing documents stay Personal.
CREATE TABLE organization (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  creatorId TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  CHECK (length(trim(name)) BETWEEN 1 AND 80),
  CHECK (slug <> 'personal' AND length(slug) BETWEEN 2 AND 48)
);

-- The creator is always a member, derived from organization.creatorId.
CREATE TABLE organization_member (
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  PRIMARY KEY (organizationId, userId)
);
CREATE INDEX organization_member_user ON organization_member(userId);

CREATE TABLE organization_invitation (
  id TEXT PRIMARY KEY NOT NULL,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  expiresAt TEXT NOT NULL,
  UNIQUE (organizationId, email)
);
CREATE INDEX organization_invitation_email ON organization_invitation(email);

ALTER TABLE document ADD COLUMN organizationId TEXT REFERENCES organization(id) ON DELETE SET NULL;
CREATE INDEX document_organization_updated ON document(organizationId, updatedAt DESC);

-- A departing member keeps their documents, now in Personal.
CREATE TRIGGER organization_member_departed AFTER DELETE ON organization_member
BEGIN
  UPDATE document SET organizationId = NULL
  WHERE ownerId = OLD.userId AND organizationId = OLD.organizationId;
END;
