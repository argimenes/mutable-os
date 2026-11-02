/** Resolved label only. Canonical names and editable text must remain unchanged. */
export const displayEntityName=(name,deletedUtc)=>name+(deletedUtc?' [deleted]':'');
