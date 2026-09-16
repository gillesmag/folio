-- Adopt Better Auth's organization schema without changing document destinations.
ALTER TABLE organization ADD COLUMN logo TEXT;
ALTER TABLE organization ADD COLUMN metadata TEXT;
ALTER TABLE organization ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0;
UPDATE organization SET createdAt = unixepoch() * 1000;
ALTER TABLE session ADD COLUMN activeOrganizationId TEXT;

CREATE TABLE member (
  id TEXT NOT NULL PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt INTEGER NOT NULL,
  UNIQUE (organizationId, userId)
);
CREATE INDEX member_user ON member(userId);
INSERT INTO member (id, organizationId, userId, role, createdAt)
SELECT 'member_' || lower(hex(randomblob(16))), id, creatorId, 'owner', createdAt
FROM organization;
INSERT INTO member (id, organizationId, userId, role, createdAt)
SELECT 'member_' || lower(hex(randomblob(16))), organizationId, userId, 'member', unixepoch() * 1000
FROM organization_member;

CREATE TABLE invitation (
  id TEXT NOT NULL PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  inviterId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX invitation_organization ON invitation(organizationId);
CREATE INDEX invitation_email ON invitation(email);
INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, createdAt, inviterId)
SELECT i.id, i.organizationId, i.email, 'member', 'pending',
  unixepoch(i.expiresAt) * 1000, unixepoch() * 1000, o.creatorId
FROM organization_invitation i JOIN organization o ON o.id = i.organizationId;

-- Remove the old trigger before dropping its table so document assignments survive.
DROP TRIGGER organization_member_departed;
DROP TABLE organization_member;
DROP TABLE organization_invitation;

-- Covers Better Auth's remove-member and leave endpoints atomically.
CREATE TRIGGER member_departed AFTER DELETE ON member
BEGIN
  UPDATE document SET organizationId = NULL
  WHERE ownerId = OLD.userId AND organizationId = OLD.organizationId;
END;
