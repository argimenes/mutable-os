import {createSignal,Show} from 'solid-js';
import {PDF_LIMITS} from '../../../src/pdf/model';

export function PdfActions(props){
  const [busy,setBusy]=createSignal(false),[message,setMessage]=createSignal('');
  let picker,dialog,input;
  async function open(file,url){
    if(busy()||(!file&&!url))return;
    setMessage('');
    if(file?.size>PDF_LIMITS.bytes){setMessage('Choose a PDF of 50 MiB or less.');return;}
    setBusy(true);
    try{
      const route='/api/folio/import-pdf'+(file?'?name='+encodeURIComponent(file.name):'');
      const response=await fetch(route,{method:'POST',headers:{'Content-Type':file?'application/pdf':'application/json'},
        body:file??JSON.stringify({url})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error??'PDF import failed.');
      await props.open(result);
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  }
  return <div class="folio-pdf-actions">
    <button disabled={busy()} onClick={()=>picker.click()}>Open PDF</button>
    <input ref={picker} hidden type="file" aria-label="Choose local PDF" accept=".pdf,application/pdf" onChange={e=>{
      const file=e.currentTarget.files?.[0];e.currentTarget.value='';void open(file);
    }}/>
    <button disabled={busy()} onClick={()=>{setMessage('');dialog.showModal();input.focus();}}>Import PDF from URL</button>
    <dialog ref={dialog} aria-label="Import PDF from URL">
      <form onSubmit={e=>{e.preventDefault();dialog.close();void open(undefined,input.value.trim());}}>
        <label>PDF URL<input ref={input} type="url" required placeholder="https://…" /></label>
        <div><button type="button" onClick={()=>dialog.close()}>Cancel</button><button type="submit">Import PDF</button></div>
      </form>
    </dialog>
    <Show when={busy()||message()}><output role="status">{busy()?'Opening PDF…':message()}</output></Show>
  </div>;
}
