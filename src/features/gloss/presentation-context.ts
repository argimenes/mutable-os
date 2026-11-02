import {createContext,useContext,type Accessor} from 'solid-js';
export interface GlossPresentationControls {active:Accessor<boolean>;narrow:Accessor<boolean>;references:Accessor<boolean>;toggle():void;toggleReferences():void}
export const GlossPresentationContext=createContext<GlossPresentationControls>();
export const useGlossPresentation=()=>useContext(GlossPresentationContext);
