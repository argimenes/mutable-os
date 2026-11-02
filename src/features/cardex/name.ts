import type {ReactiveEditor} from '../../reactive-editor/editor';
/** Explicit local edit: preserve unaffected Cells and rebase their annotations through native commands. */
export function makeNameSingleLine(editor:ReactiveEditor,key:string){
 const node=editor.node(key);if(!node||node.viewType!=='standoff-editor-block')throw Error('Name editor is unavailable.');
 const cells=node.inlineContent.map(k=>String(editor.node(k)?.payload.text??'')),edits:Array<{start:number;end:number;text:string}>=[];
 for(let i=0;i<cells.length;i++){if(!/^[\r\n]$/.test(cells[i]))continue;const start=i;while(i+1<cells.length&&/^[\r\n]$/.test(cells[i+1]))i++;const end=i+1;edits.push({start,end,text:start===0||end===cells.length?'':' '});}
 if(!edits.length)return false;
 editor.commands.structuralTransaction('Make Name single-line',()=>{for(const edit of edits.reverse())editor.commands.replaceInlineRange(key,edit.start,edit.end,edit.text);});
 return true;
}
