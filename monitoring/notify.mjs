import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const title='Supabase monitor: database check failed';
export async function notify(report, api, runUrl) {
  let issues=[];
  for(let page=1;;page++) {
    const batch=await api('GET',`/issues?state=open&per_page=100&page=${page}`);
    issues.push(...batch.filter(i=>!i.pull_request && i.title===title && i.user?.login==='github-actions[bot]'));
    if(batch.length<100) break;
  }
  const failed=report.results.filter(r=>!r.ok);
  if(failed.length && !issues.length) {
    await api('POST','/issues',{title,body:`Database probes failed. No application records were read or modified.\n\n${failed.map(r=>`- ${r.ref}: ${r.failure} (HTTP ${r.status})`).join('\n')}\n\nRun: ${runUrl}\n\n@danal8 please review. This issue closes automatically after all probes recover.`});
    return 'opened';
  }
  if(!failed.length) for(const issue of issues) await api('PATCH',`/issues/${issue.number}`,{state:'closed',state_reason:'completed'});
  return failed.length?'already-open':'healthy';
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {GITHUB_TOKEN:token,GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:run}=process.env;
  if(!token || !/^[\w.-]+\/[\w.-]+$/.test(repo||'')) throw Error('Missing GitHub configuration');
  let report;
  try {report=JSON.parse(await readFile('supabase-monitor-report.json','utf8'));}
  catch {report={results:[{ref:'monitor',ok:false,failure:'probe-did-not-complete',status:0}]};}
  const api=async(method,path,body)=>{
    const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    if(!r.ok) throw Error(`Notification API failed: HTTP ${r.status}`);
    return r.json();
  };
  console.log(await notify(report,api,`https://github.com/${repo}/actions/runs/${run}`));
}
