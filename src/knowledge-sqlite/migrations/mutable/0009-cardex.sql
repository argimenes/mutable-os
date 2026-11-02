-- Additive, Entity-local metadata. No new global text/annotation records.
ALTER TABLE Entity ADD COLUMN nameStrata TEXT CHECK(nameStrata IS NULL OR json_valid(nameStrata));
ALTER TABLE Entity ADD COLUMN descriptionDocument TEXT CHECK(descriptionDocument IS NULL OR json_valid(descriptionDocument));
ALTER TABLE Entity ADD COLUMN imageRef TEXT CHECK(imageRef IS NULL OR json_valid(imageRef));
