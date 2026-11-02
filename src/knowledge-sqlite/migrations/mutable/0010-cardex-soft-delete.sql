-- Additive: references and canonical identity survive deletion/restoration.
ALTER TABLE Entity ADD COLUMN deletedUtc TEXT;
CREATE INDEX IX_Entity_Active_Name ON Entity(nameKey,guid) WHERE deletedUtc IS NULL;
CREATE INDEX IX_Entity_Deleted_Name ON Entity(nameKey,guid) WHERE deletedUtc IS NOT NULL;
CREATE INDEX IX_Entity_Created ON Entity(createdUtc,guid);
CREATE INDEX IX_Standoff_Entity_Document_Logical ON StandoffProperty(targetEntityGuid,resourceGuid,logicalGuid)
 WHERE typename='codex/entity-reference' AND isDeleted=0 AND resolution IN ('direct','resolved');
