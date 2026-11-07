import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.local',{recursive:true});
await build({entryPoints:['tests/ui-entry.tsx'],bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'browser-audio-stub',setup(b){b.onLoad({filter:/src\/lib\/useSound.ts$/},()=>({contents:'export function useSound(){return false}',loader:'ts'}))}}],outfile:'.local/ui-test.mjs'});
globalThis.location={search:'',hash:'#/'};
const {renderApp,refresh}=await import('../.local/ui-test.mjs');
test('homepage can render before bootstrap data arrives',()=>{const html=renderApp();assert.ok(html.includes('animate-pulse'));assert.ok(html.includes('Sandbox'))});
