import type {ApplicationVaultDocument} from '../../feature-api/document-application';

export const documentNames = new Intl.Collator(undefined, {sensitivity:'base', numeric:true});
type FileRow = ApplicationVaultDocument | string;

export function filesByFolder(documents: readonly ApplicationVaultDocument[], candidates: readonly string[]) {
  const groups = new Map<string, FileRow[]>();
  function add(folder: string, row: FileRow) {
    const rows = groups.get(folder);
    if (rows) rows.push(row);
    else groups.set(folder, [row]);
  }
  for (const doc of documents) add(doc.location.folder, doc);
  for (const file of candidates) {
    const slash = file.lastIndexOf('/');
    add(slash < 0 ? '.' : file.slice(0, slash), file);
  }
  const filename = (row: FileRow) => typeof row === 'string' ? row.slice(row.lastIndexOf('/') + 1) : row.location.filename;
  const title = (row: FileRow) => typeof row === 'string' ? filename(row) : row.title || row.location.filename;
  for (const rows of groups.values()) rows.sort((a,b) =>
    documentNames.compare(title(a), title(b)) || documentNames.compare(filename(a), filename(b)));
  return groups;
}
