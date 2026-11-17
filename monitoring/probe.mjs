import {readFile, writeFile, appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function validate(projects) {
  if (!Array.isArray(projects) || !projects.length) throw new Error('Empty inventory');
  const refs = new Set();
  for (const p of projects) {
    if (!/^[a-z]{20}$/.test(p.ref) || !/^sb_publishable_[\w-]+$/.test(p.key) ||
        Boolean(p.table) === Boolean(p.rpc) || !/^[a-z_][a-z0-9_]*$/.test(p.rpc || p.table) || refs.has(p.ref)) throw new Error('Invalid inventory');
    refs.add(p.ref);
  }
}

export async function probe(p, {request = fetch, sleep = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  const started = Date.now();
  let failure = 'network';
  let status = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const endpoint = p.rpc ? `rpc/${p.rpc}` : `${p.table}?select=*&limit=0`;
      const res = await request(`https://${p.ref}.supabase.co/rest/v1/${endpoint}`, {
        method: 'GET', redirect: 'error', headers: {apikey: p.key, 'Cache-Control':'no-cache'},
        signal: AbortSignal.timeout(15000)
      });
      status = res.status;
      if (res.ok) {
        const body = await res.json();
        const valid = p.rpc ? body?.ok === true && Object.keys(body).length === 1 : Array.isArray(body) && body.length === 0;
        if (valid) return {ref:p.ref, ok:true, status, attempts:attempt, ms:Date.now()-started};
        failure = 'unexpected-response';
      } else {
        failure = status === 401 || status === 403 ? 'access-denied' : `http-${status}`;
        await res.body?.cancel();
      }
      if (status !== 429 && status < 500) break;
    } catch { failure = 'network-or-invalid-response'; }
    if (attempt < 3) await sleep(1000 * 2 ** (attempt-1));
  }
  return {ref:p.ref, ok:false, status, failure, ms:Date.now()-started};
}

export async function main() {
  const projects = JSON.parse(await readFile(new URL('./projects.json', import.meta.url)));
  validate(projects);
  const results = await Promise.all(projects.map(p => probe(p)));
  const report = {checkedAt:new Date().toISOString(), results};
  await writeFile('supabase-monitor-report.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    '| Project | Database probe | HTTP |\n|---|---|---|\n' + results.map(r=>`| ${r.ref} | ${r.ok?'OK':r.failure} | ${r.status} |`).join('\n')+'\n');
  if (results.some(r=>!r.ok)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
