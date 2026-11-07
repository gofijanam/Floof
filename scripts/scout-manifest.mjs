import {readFile,writeFile} from 'node:fs/promises';
import {scoutTree} from '../server/scout-merkle.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/scout-manifest.mjs input.json output.json');
const {program,epoch,leaves}=JSON.parse(await readFile(input,'utf8'));
const manifest=await scoutTree(program,epoch,leaves);
await writeFile(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({root:manifest.root,budgetLamports:manifest.budgetLamports,recipients:leaves.length,note:'Manifest only. Fund this exact root on Devnet before publishing claims.'}));
