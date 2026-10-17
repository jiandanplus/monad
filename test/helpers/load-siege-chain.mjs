import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
export async function loadSiegeChain(){
 const result=await build({entryPoints:[new URL('../../src/siege/chain.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,packages:'external'});
 // Keep resolution inside the checkout so external viem resolves normally.
 const file=new URL(`../../.git/sdd/chain-test-${process.pid}.mjs`,import.meta.url);
 await writeFile(file,result.outputFiles[0].text);return import(file.href+`?v=${Date.now()}`);
}
