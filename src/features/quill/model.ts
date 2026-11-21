/** Native, versioned composition data. Text and annotations live only in owned TextBlocks. */
export const QUILL_TYPE = 'mutable/svg-text-composition-block';
export const QUILL_APP = 'quill-application-block';
export const SOURCE_REFERENCE = 'codex/block-reference';
export interface QuillPath {
  id: string; kind: 'line' | 'sine'; x: number; y: number; width: number;
  amplitude?: number; cycles?: number;
}
export interface QuillComposition {
  version: 1;
  viewport: { width: number; height: number };
  sources: { role: string }[];
  paths: QuillPath[];
  flows: { id: string; sourceRole: string; pathIds: string[] }[];
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, any>, names: string[]) => Object.keys(v).every(k => names.includes(k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v);
const number = (v: unknown, min = -100000, max = 100000): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const unique = (items: string[]) => new Set(items).size === items.length;

/** Strict admission for this version. Future versions retain native children but are not activated. */
export function validQuill(value: unknown): value is QuillComposition {
  if (!object(value) || !keys(value, ['version','viewport','sources','paths','flows']) || value.version !== 1) return false;
  const { viewport, sources, paths, flows } = value;
  if (!object(viewport) || !keys(viewport,['width','height']) || !number(viewport.width,1) || !number(viewport.height,1)) return false;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 64 || !sources.every(s => object(s) && keys(s,['role']) && id(s.role)) || !unique(sources.map(s => s.role))) return false;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 256 || !paths.every(p => object(p) && keys(p,['id','kind','x','y','width','amplitude','cycles']) && id(p.id) && ['line','sine'].includes(p.kind) && number(p.x) && number(p.y) && number(p.width,1) && (p.kind === 'line' ? p.amplitude === undefined && p.cycles === undefined : number(p.amplitude,0) && number(p.cycles,0,100))) || !unique(paths.map(p => p.id))) return false;
  if (!Array.isArray(flows) || flows.length < 1 || flows.length > 64 || !flows.every(f => object(f) && keys(f,['id','sourceRole','pathIds']) && id(f.id) && sources.some(s => s.role === f.sourceRole) && Array.isArray(f.pathIds) && f.pathIds.length > 0 && f.pathIds.length <= 256 && unique(f.pathIds) && f.pathIds.every((p: unknown) => paths.some(path => path.id === p))) || !unique(flows.map(f => f.id)) || !unique(flows.map(f => f.sourceRole))) return false;
  return sources.every(s => flows.some(f => f.sourceRole === s.role));
}
export function defaultComposition(): QuillComposition {
  return { version: 1, viewport: {width:760,height:240}, sources:[{role:'body'}],
    paths:[{id:'baseline',kind:'line',x:20,y:40,width:720}], flows:[{id:'body',sourceRole:'body',pathIds:['baseline']}] };
}
export function sourceRole(property: unknown): string | undefined {
  if (!object(property) || property.type !== SOURCE_REFERENCE || !object(property.metadata) || !id(property.metadata.quillRole)) return;
  return property.metadata.quillRole;
}
