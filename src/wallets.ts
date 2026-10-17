import type {EIP1193Provider} from 'viem';
export type Provider=EIP1193Provider&{
 on?:(event:string,cb:()=>void)=>void;
 removeListener?:(event:string,cb:()=>void)=>void;
 providers?:Provider[];
 isMetaMask?:boolean;
 isBackpack?:boolean;
};
type WalletWindow={ethereum?:Provider,addEventListener?:(type:string,cb:EventListener)=>void,removeEventListener?:(type:string,cb:EventListener)=>void,dispatchEvent?:(event:Event)=>boolean};
type Wallet={id:string,name:string,provider:Provider};

export function createWalletRegistry(target:WalletWindow){
 const announced=new Map<string,Wallet>();
 const listeners=new Set<()=>void>();
 let selected:string|null=null,explicit=false,lastListKey='';
 function entries():Wallet[]{
  if(announced.size)return [...announced.values()];
  const legacy=target.ethereum?.providers??(target.ethereum?[target.ethereum]:[]);
  return [...new Set(legacy)].filter(p=>typeof p?.request==='function').map((p,i)=>({id:`legacy-${i}`,name:p.isBackpack?'Backpack':p.isMetaMask?'MetaMask':`浏览器钱包 ${i+1}`,provider:p}));
 }
 function reconcile(notify=true){
  const all=entries(),key=all.map(w=>w.id).join('|'),previous=selected;
  if(explicit&&!all.some(w=>w.id===selected)){selected=null;explicit=false;}
  if(!explicit)selected=all.length===1?all[0].id:null;
  const changed=key!==lastListKey||selected!==previous;
  lastListKey=key;
  if(changed&&notify)for(const cb of listeners)cb();
 }
 const receive:EventListener=(event)=>{
  const detail=(event as CustomEvent).detail;
  if(!detail||typeof detail.info?.uuid!=='string'||typeof detail.info?.name!=='string'||typeof detail.provider?.request!=='function')return;
  const id=detail.info.uuid.slice(0,128);
  if(!id||announced.has(id))return;
  // Metadata is only a display hint. Never render icons/HTML supplied by providers.
  announced.set(id,{id,name:detail.info.name.slice(0,80),provider:detail.provider});reconcile();
 };
 target.addEventListener?.('eip6963:announceProvider',receive);
 target.dispatchEvent?.(new Event('eip6963:requestProvider'));
 reconcile(false);
 return {
  list(){reconcile(false);return entries().map(({id,name})=>({id,name}));},
  selectedId(){reconcile(false);return selected;},
  select(id:string){
   if(!entries().some(w=>w.id===id))throw new Error('所选钱包已不可用，请刷新钱包列表。');
   selected=id;explicit=true;for(const cb of listeners)cb();
  },
  provider(){
   reconcile(false);const all=entries();
   if(!all.length)throw new Error('没有检测到钱包。请在安装钱包的浏览器或钱包内置浏览器打开此页面。');
   const entry=all.find(w=>w.id===selected);
   if(!entry)throw new Error('检测到多个钱包，请先选择钱包，再连接。');
   return entry.provider;
  },
  subscribe(cb:()=>void){listeners.add(cb);return ()=>{listeners.delete(cb);};},
  destroy(){target.removeEventListener?.('eip6963:announceProvider',receive);listeners.clear();}
 };
}
