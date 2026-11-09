import {isAuthoredBlock} from './identity';
import {decodeBlockTree} from './codecs';
import {clone} from './clone';
import type {BlockFragment} from './clipboard';
import type {ExistingBlockDto} from './types';

/** Host-private assembly of newly authored composition and prepared native
 * leaves. Slots and fragments are never accepted from a wire response. This
 * intentionally does not implement subtree cloning or dependency discovery. */
export function composePreparedLeaves(dto:ExistingBlockDto, leaves:ReadonlyMap<string,BlockFragment>, maxNodes:number):BlockFragment {
 const decoded=decodeBlockTree(dto), state=decoded.state, remaining=new Map(leaves);
 if(Object.values(state.contents).filter(isAuthoredBlock).length>maxNodes)throw Error('Native composition descendant budget exceeded');
 for(const [key,slot] of Object.entries(state.contents)){
  const fragment=remaining.get(String(slot.payload.id));if(!fragment)continue;
  const root=fragment.state.placements[fragment.roots[0]],leaf=root&&fragment.state.contents[root.contentKey];
  if(fragment.roots.length!==1||Object.keys(fragment.state.contents).length!==1||Object.keys(fragment.state.placements).length!==1||!leaf||root.kind!=='owned'||root.externalReference||root.resolvedReference||root.resourceRegistration||leaf.children.length||leaf.inlineContent.length||Object.keys(leaf.ownedRelations).length||Object.keys(leaf.opaqueRelations).length||leaf.definitionOwnerKey||Object.keys(fragment.linkedAnnotations??{}).length||fragment.copyIdentities?.length||slot.children.length||Object.keys(slot.ownedRelations).length)throw Error('Prepared native leaf required');
  state.contents[key]={...clone(leaf),key};
  remaining.delete(String(slot.payload.id));
 }
 if(remaining.size)throw Error('Prepared native leaf slot missing');
 return {state,roots:[decoded.rootPlacementKey]};
}
