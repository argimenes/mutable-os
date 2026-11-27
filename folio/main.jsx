import {onMount,onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import {CavernStartup,useCurrentCavern} from '../src/application/cavern-startup';
import {mountFolio} from '../experiments/folio/iii/viewer';

function Reader(){
  const cavern=useCurrentCavern();
  let host;
  async function settings(){
    const current=cavern.current();
    let folder='documents';
    let response=await fetch('/api/native/list?folder=documents');
    if(response.status===404){
      folder='.';
      response=await fetch('/api/native/list?folder=.');
    }
    const result=await response.json();
    if(!response.ok||!result.Success)throw Error(result.Error??'Could not list vault documents.');
    return {folder,files:result.Data.files.filter(f=>f.toLowerCase().endsWith('.ink')),
      cavernId:current.cavernGuid,session:current.session,vaultName:folder==='.'?current.name:current.name+'/'+folder};
  }
  onMount(()=>onCleanup(mountFolio(host,settings)));
  return <main id="folio" style={{height:'100dvh'}} ref={host}/>;
}

render(()=><CavernStartup>{()=><Reader/>}</CavernStartup>,document.getElementById('root'));
