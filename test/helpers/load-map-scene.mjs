import {readFile} from 'node:fs/promises';
import {transpileModule,ModuleKind} from 'typescript';
export async function loadMapScene(){
 const source=await readFile(new URL('../../src/map-preview/scene.ts',import.meta.url),'utf8');
 const output=transpileModule(source,{compilerOptions:{target:99,module:ModuleKind.ESNext}}).outputText
  .replaceAll("'./world.mjs'",JSON.stringify(new URL('../../src/map-preview/world.mjs',import.meta.url).href))
  .replaceAll("'./live-world.mjs'",JSON.stringify(new URL('../../src/map-preview/live-world.mjs',import.meta.url).href));
 return (await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)).MapScene;
}
