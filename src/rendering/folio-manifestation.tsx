import {createContext,useContext,type Component} from 'solid-js';
import type {BlockViewProps} from '../block-tree/types';
import {ChildBlocks} from './block-outlet';
/** A spatial occurrence supplies its own readers. Continuous occurrences expose canonical children. */
export const FolioReaders=createContext<{publication:Component<BlockViewProps>;original:Component<BlockViewProps>}>();
export function FolioPublication(props:BlockViewProps){
  const reader=useContext(FolioReaders);return reader?<reader.publication {...props}/>:<ChildBlocks parentKey={props.nodeKey}/>;
}
export function FolioOriginal(props:BlockViewProps){
  const reader=useContext(FolioReaders);return reader?<reader.original {...props}/>:null;
}
