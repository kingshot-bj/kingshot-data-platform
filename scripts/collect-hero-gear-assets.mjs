#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SOURCES = [
  { id: 'kingshot-guide-data-center', url: 'https://www.kingshotguide.org/data-center/hero-gear-kingshot', host: 'www.kingshotguide.org' },
  { id: 'kingshot-guide-visual-reference', url: 'https://www.kingshotguide.org/guide/kingshot-grow-your-heroes', host: 'www.kingshotguide.org' },
  { id: 'kingshot-packs-calculator', url: 'https://kingshotpacks.com/hero-gear-calculator', host: 'kingshotpacks.com' },
];
const TROOPS = ['infantry','cavalry','archer'];
const SLOTS = ['helmet','gloves','chest','boots'];
const QUALITIES = ['gray','green','blue','purple','gold','red'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function argValue(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i+1] ? process.argv[i+1] : fallback; }
function hasArg(name) { return process.argv.includes(name); }
function normalizeUrl(raw, base) {
  if (!raw) return null; const value = raw.trim().replace(/^['\"]|['\"]$/g, '');
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null;
  try { const u = new URL(value, base); return ['http:','https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
function decodeHtml(v) { return v.replace(/&amp;/g,'&').replace(/&quot;/g,'\"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function extractImageUrls(html, pageUrl) {
  const found = new Set(); const add = (raw) => { const u = normalizeUrl(decodeHtml(raw), pageUrl); if (u) found.add(u); };
  let m; const img = /<img\\b[^>]*(?:src|data-src|data-lazy-src|data-original)=[\"']([^\"']+)[\"'][^>]*>/gi;
  while ((m = img.exec(html))) add(m[1]);
  const srcset = /(?:srcset|data-srcset)=[\"']([^\"']+)[\"']/gi;
  while ((m = srcset.exec(html))) for (const item of m[1].split(',')) add(item.trim().split(/\\s+/)[0]);
  const og = /<meta\\b[^>]*(?:property|name)=[\"']og:image[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/gi;
  while ((m = og.exec(html))) add(m[1]);
  return [...found];
}
function extractHints(html, imageUrl) {
  const lower = imageUrl.toLowerCase(); const hints = new Set();
  const aliases = {
    infantry:['infantry','shield','inf'], cavalry:['cavalry','lancer','horse','cav'], archer:['archer','marksman','bow'],
    helmet:['helmet','helm','greaves'], gloves:['gloves','glove','gauntlet','bracers'], chest:['chest','breastplate','shroud','leatherwear'], boots:['boots','boot','riders'],
    gray:['gray','grey','common'], green:['green','uncommon'], blue:['blue','rare'], purple:['purple','epic','legendary'], gold:['gold','mythic'], red:['red','champion']
  };
  for (const [key, words] of Object.entries(aliases)) if (words.some((w) => lower.includes(w))) hints.add(key);
  const idx = html.toLowerCase().indexOf(imageUrl.toLowerCase());
  if (idx >= 0) { const nearby = html.slice(Math.max(0,idx-500), Math.min(html.length,idx+800)).toLowerCase(); for (const [key,words] of Object.entries(aliases)) if (words.some((w)=>nearby.includes(w))) hints.add(key); }
  return [...hints];
}
function fileExtension(url, type) { const ext = path.extname(new URL(url).pathname).toLowerCase(); if (['.png','.jpg','.jpeg','.webp','.gif','.svg'].includes(ext)) return ext; if (type.includes('png')) return '.png'; if (type.includes('webp')) return '.webp'; if (type.includes('gif')) return '.gif'; if (type.includes('svg')) return '.svg'; return '.jpg'; }
function stableName(url, index, ext) { return String(index).padStart(4,'0') + '-' + createHash('sha1').update(url).digest('hex').slice(0,12) + ext; }
async function fetchText(url) { const r = await fetch(url,{headers:{'user-agent':'EagleEye-HeroGearAssetCollector/1.0','accept':'text/html,application/xhtml+xml'}}); if(!r.ok) throw new Error('HTTP '+r.status+' for '+url); return r.text(); }
async function fetchBinary(url) { const r=await fetch(url,{headers:{'user-agent':'EagleEye-HeroGearAssetCollector/1.0','accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}}); if(!r.ok) throw new Error('HTTP '+r.status+' for '+url); return {bytes:Buffer.from(await r.arrayBuffer()),contentType:r.headers.get('content-type')||''}; }
function buildExpectedMatrix() { const rows=[]; for(const troop of TROOPS) for(const slot of SLOTS) for(const quality of QUALITIES) rows.push({key:troop+'/'+slot+'/'+quality,troop,slot,quality,status:'missing',asset_file:null,source_url:null,verified:false}); return rows; }
async function main() {
  const outDir=path.resolve(argValue('--out','artifacts/hero-gear-assets')); const selected=argValue('--source','all');
  await fs.mkdir(path.join(outDir,'images'),{recursive:true});
  const sources=SOURCES.filter(s=>selected==='all'||s.id.includes(selected)); if(!sources.length) throw new Error('Unknown source: '+selected);
  const candidates=[]; const errors=[];
  for(const source of sources){
    console.log('[source] '+source.id); let html; try{html=await fetchText(source.url);}catch(error){errors.push({source:source.id,url:source.url,error:String(error.message||error)});continue;}
    const urls=extractImageUrls(html,source.url); console.log('  found '+urls.length+' image URL candidates');
    for(const imageUrl of urls){ const candidate={source_id:source.id,source_page:source.url,image_url:imageUrl,host:new URL(imageUrl).hostname,hints:extractHints(html,imageUrl),downloaded:false,asset_file:null,content_type:null,bytes:null,error:null};
      if(!hasArg('--metadata-only')){ try{await sleep(150); const got=await fetchBinary(imageUrl); const ext=fileExtension(imageUrl,got.contentType); const filename=stableName(imageUrl,candidates.length+1,ext); await fs.writeFile(path.join(outDir,'images',filename),got.bytes); candidate.downloaded=true; candidate.asset_file='images/'+filename; candidate.content_type=got.contentType; candidate.bytes=got.bytes.length;}catch(error){candidate.error=String(error.message||error);} }
      candidates.push(candidate);
    }
  }
  const expected=buildExpectedMatrix(); const byHint=new Map();
  for(const c of candidates) for(const troop of TROOPS) if(c.hints.includes(troop)) for(const slot of SLOTS) if(c.hints.includes(slot)) for(const quality of QUALITIES) if(c.hints.includes(quality)){const key=troop+'/'+slot+'/'+quality;if(!byHint.has(key))byHint.set(key,[]);byHint.get(key).push(c);}
  for(const row of expected){const matches=byHint.get(row.key)||[]; if(matches.length===1&&matches[0].downloaded){row.status='candidate';row.asset_file=matches[0].asset_file;row.source_url=matches[0].image_url;}else if(matches.length>1)row.status='multiple_candidates';}
  const manifest={generated_at:new Date().toISOString(),mode:hasArg('--metadata-only')?'metadata-only':'download',sources:sources.map(({id,url})=>({id,url})),expected_count:expected.length,candidate_count:candidates.length,downloaded_count:candidates.filter(x=>x.downloaded).length,expected,candidates,errors,notes:['Candidate mappings are hints only and are not production-verified.','Check third-party image usage rights before shipping assets.','The collector does not infer identity from pixels.']};
  await fs.writeFile(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\\n');
  const summary={expected:expected.length,candidate:expected.filter(x=>x.status==='candidate').length,multiple_candidates:expected.filter(x=>x.status==='multiple_candidates').length,missing:expected.filter(x=>x.status==='missing').length,downloaded:candidates.filter(x=>x.downloaded).length,errors:errors.length+candidates.filter(x=>x.error).length};
  await fs.writeFile(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\\n'); console.log(JSON.stringify(summary,null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});