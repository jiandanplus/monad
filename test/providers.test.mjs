import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const file=new URL('../src/wallets.ts',import.meta.url);
test('wallet discovery exists',()=>assert.ok(existsSync(file),'wallet registry missing'));
if(existsSync(file)){
 const {createWalletRegistry}=await import(file);
 const provider=()=>({request:async()=>null});
 const announce=(target,id,p,name=id)=>target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:id,name,rdns:`org.${id}`,icon:'data:image/svg+xml,<svg/>'},provider:p}}));
 test('two discovered wallets require explicit choice and duplicate announcements deduplicate',()=>{
  const win=new EventTarget(),r=createWalletRegistry(win),a=provider(),b=provider();
  announce(win,'backpack',a);assert.equal(r.selectedId(),'backpack');
  announce(win,'metamask',b);assert.equal(r.selectedId(),null);assert.throws(()=>r.provider(),/选择钱包/);
  r.select('metamask');assert.equal(r.provider(),b);
  announce(win,'metamask',b);assert.equal(r.list().length,2);assert.equal(r.selectedId(),'metamask');
  r.destroy();
 });
 test('explicit choice survives later announcements, provider names remain text',()=>{
  const win=new EventTarget(),r=createWalletRegistry(win),a=provider(),b=provider();
  announce(win,'a',a,'<script>evil</script>');r.select('a');announce(win,'b',b);
  assert.equal(r.provider(),a);assert.equal(r.list()[0].name,'<script>evil</script>');r.destroy();
 });
 test('legacy providers are discoverable without overriding explicit selection',()=>{
  const a=provider(),b=provider(),win={ethereum:{...a,providers:[a,b]}};
  const r=createWalletRegistry(win);assert.equal(r.list().length,2);assert.throws(()=>r.provider());
  r.select(r.list()[1].id);assert.equal(r.provider(),b);r.destroy();
 });
 test('invalid provider announcements are ignored and no wallet gives clear instructions',()=>{
  const win=new EventTarget(),r=createWalletRegistry(win);
  win.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'x'},provider:{}}}));
  assert.equal(r.list().length,0);assert.throws(()=>r.provider(),/钱包/);r.destroy();
 });
}
