import type {ContentRecord, ExistingBlockDto, JsonObject, RepositoryState, RepositoryOperation, PlacementRecord} from './types';
import type {GateDocument} from '../history/stage-c-gates/portable';

const positions = ['verso', 'recto'] as const;
const bag = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};

function leafPair<T>(id: string, children: T[], collapsed: unknown) {
  const defaults = bag(collapsed);
  return positions.map((placement, index) => ({
    type: 'leaf-block', id: id + '-' + placement, placement,
    collapsedByDefault: !!defaults[index ? 'right' : 'left'],
    children: index ? children.slice(1) : children.slice(0, 1),
  }));
}

export function migrateSpreadDto(input: ExistingBlockDto): ExistingBlockDto {
  if (input.type !== 'spread-block') return input;
  const metadata = bag(input.metadata), spread = bag(metadata.spread);
  if (spread.version === 3 || input.children?.some(block => block.type === 'leaf-block')) return input;
  const id = input.id ?? crypto.randomUUID();
  return {...input, id, metadata: {...metadata, spread: {...spread, version: 3}},
    children: leafPair(id, input.children ?? [], spread.collapsed)};
}

type Edge = GateDocument['root'];
function checkPair(sides: unknown[]) {
  if (sides.length !== 2 || !sides.includes('verso') || !sides.includes('recto')) {
    throw Error('Spread requires two owned Leaves, one verso and one recto');
  }
}

// Only import boundaries wrap legacy occupants. Authored mutations must supply the complete pair.
export function migrateSpreadWire(doc: Pick<GateDocument,'blocks'>) {
  const blocks = new Map(doc.blocks.map(block => [block.id, block]));
  const target = (edge: Edge) => edge.target.kind === 'local' ? blocks.get(edge.target.blockId) : undefined;
  const owned = new Set<string>();
  for (const block of doc.blocks) {
    if (block.type !== 'spread-block') continue;
    const edges = block.children ?? [], metadata = bag(block.properties.metadata), spread = bag(metadata.spread);
    if (spread.version !== 3 && !edges.some(edge => target(edge)?.type === 'leaf-block')) {
      block.children = leafPair(block.id, edges, spread.collapsed).map(leaf => {
        if (blocks.has(leaf.id)) throw Error('Legacy spread Leaf identity collision');
        const record = {id: leaf.id, type: leaf.type, children: leaf.children,
          properties: {placement: leaf.placement, collapsedByDefault: leaf.collapsedByDefault}};
        blocks.set(leaf.id, record);
        doc.blocks.push(record);
        return {placementId: 'placement-' + leaf.id, kind: 'owned', target: {kind: 'local', blockId: leaf.id}};
      });
      block.properties.metadata = {...metadata, spread: {...spread, version: 3}};
    }
    checkPair((block.children ?? []).map(edge => {
      const leaf = target(edge);
      return edge.kind === 'owned' && leaf?.type === 'leaf-block' && leaf.properties.placement;
    }));
  }
  for (const block of doc.blocks) {
    for (const edge of block.children ?? []) {
      const leaf = target(edge);
      if (leaf?.type !== 'leaf-block') continue;
      if (block.type !== 'spread-block' || edge.kind !== 'owned' || owned.has(leaf.id)) throw Error('Invalid Leaf owner');
      owned.add(leaf.id);
    }
    if (Object.values(block.relations?.owned ?? {}).some(edge => target(edge)?.type === 'leaf-block')) {
      throw Error('A Leaf requires a child placement');
    }
  }
  for (const block of doc.blocks) if (block.type === 'leaf-block' && !owned.has(block.id)) throw Error('Detached Leaf');
}

export function checkSpread(content: ContentRecord, placement: (key:string)=>PlacementRecord|undefined, record: (key:string)=>ContentRecord|undefined) {
  if (content.viewType !== 'spread-block') return;
  checkPair(content.children.map(key => {
    const edge = placement(key), leaf = edge && record(edge.contentKey);
    return edge?.kind === 'owned' && !edge.externalReference && !edge.resolvedReference &&
      leaf?.viewType === 'leaf-block' && leaf.payload.placement;
  }));
}

export function checkLeafChanges(state:RepositoryState,ops:Iterable<RepositoryOperation>,owner:(key:string)=>string|undefined,owned:(key:string)=>Iterable<string>){
  const records=new Map<string,ContentRecord|undefined>(),edges=new Map<string,PlacementRecord|undefined>();
  const parents=new Map<string,string|undefined>(),touched=new Set<string>();
  for(const op of ops){
    if(op.kind==='put-content'||op.kind==='remove-content'){
      const next=op.kind==='put-content'?op.record:undefined,key=next?.key??(op as {key:string}).key,prev=state.contents[key];records.set(key,next);
      if(prev?.viewType==='leaf-block')for(const placement of owned(key)){
        const container=owner(placement);if(container)touched.add(container);
      }
      if(prev?.viewType==='leaf-block'||next?.viewType==='leaf-block'||next?.viewType==='spread-block')touched.add(key);
      if(prev?.children!==next?.children){
        for(const k of prev?.children??[])if(!parents.has(k))parents.set(k,undefined);
        for(const k of next?.children??[])parents.set(k,key);
      }
    }else if(op.kind==='put-placement'||op.kind==='remove-placement'){
      const p=op.kind==='put-placement'?op.record:undefined,key=p?.key??(op as {key:string}).key;
      edges.set(key,p);if(state.placements[key])touched.add(state.placements[key].contentKey);if(p)touched.add(p.contentKey);
    }
  }
  const edge=(k:string)=>edges.has(k)?edges.get(k):state.placements[k],record=(k:string)=>records.has(k)?records.get(k):state.contents[k];
  for(const k of parents.keys()){const p=edge(k);if(p&&record(p.contentKey)?.viewType==='leaf-block')touched.add(p.contentKey);}
  for(const k of touched){
    const c=record(k);if(!c)continue;
    if(c.viewType==='leaf-block'){
      const keys=new Set(owned(k));for(const [key,p] of edges)if(p?.contentKey===k)keys.add(key);
      let owners=0;
      for(const key of keys){const p=edge(key);if(p?.contentKey!==k)continue;const parent=parents.has(key)?parents.get(key):owner(key);
        const container=parent&&record(parent);if(!container||container.viewType!=='spread-block'||!container.children.includes(key)||p.kind!=='owned')throw Error('Leaf requires an owning SpreadBlock');
        checkSpread(container,edge,record);owners++;
      }
      if(owners!==1)throw Error('Leaf requires exactly one owner');
    }
    checkSpread(c,edge,record);
  }
}
