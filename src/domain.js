export const TYPES=['Plafond','Συγκεκριμένα υλικά','Άλλο'];
export const STATUSES=['Νέο','Προς αίτηση','Αναμονή πιστωτικών','Μερικώς ολοκληρωμένο','Ολοκληρωμένο','Κλειστό με διαφορά'];
export const STAGES=['Προς αίτηση','Ζητήθηκε','Παραλήφθηκε','Απορρίφθηκε'];
export const money=n=>new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'}).format(n/100);
export const sum=(xs,fn)=>xs.reduce((a,x)=>a+fn(x),0);
export function cents(value){
 const raw=String(value??'').trim().replace(/[\s€]/g,'');
 if(!/^\d[\d.,]*$/.test(raw))throw Error('Γράψτε ένα έγκυρο θετικό ποσό.');
 const dots=(raw.match(/\./g)||[]).length,commas=(raw.match(/,/g)||[]).length;
 let integer=raw,fraction='';
 if(dots&&commas){
  const decimal=raw.lastIndexOf('.')>raw.lastIndexOf(',')?'.':',';
  const cut=raw.lastIndexOf(decimal);integer=raw.slice(0,cut);fraction=raw.slice(cut+1);
  const thousands=decimal==='.'?',':'.';
  if(!/^\d{1,3}([.,]\d{3})*$/.test(integer)||integer.includes(decimal)||!/^\d{1,2}$/.test(fraction))throw Error('Γράψτε ένα έγκυρο ποσό, π.χ. 1.399,78.');
  integer=integer.split(thousands).join('');
 }else if(dots||commas){
  const separator=dots?'.':',',parts=raw.split(separator);
  if(parts.length===2&&parts[1].length<=2){[integer,fraction]=parts;}
  else if(parts.slice(1).every(part=>part.length===3)&&/^\d{1,3}$/.test(parts[0]))integer=parts.join('');
  else if(parts.length>2&&parts.at(-1).length<=2&&parts.slice(1,-1).every(part=>part.length===3)&&/^\d{1,3}$/.test(parts[0])){fraction=parts.pop();integer=parts.join('');}
  else throw Error('Γράψτε ένα έγκυρο ποσό, π.χ. 1.399,78.');
 }
 if(!/^\d+$/.test(integer)||fraction&&!/^\d{1,2}$/.test(fraction))throw Error('Γράψτε ένα έγκυρο θετικό ποσό.');
 const n=Number(integer)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>10000000000)throw Error('Το ποσό υπερβαίνει το όριο.');return n;
}
export const decimal=n=>(n/100).toFixed(2);
export const today=()=>new Date().toLocaleDateString('sv-SE');
export function allocate(costs,target){
 if(costs.some(n=>!Number.isSafeInteger(n)||n<0)||!Number.isSafeInteger(target)||target<0)throw Error('Μη έγκυρα ποσά.');
 const total=sum(costs,n=>n);if(target>total)throw Error('Η περικοπή υπερβαίνει το κόστος.');if(!total)return costs.map(()=>0);
 const parts=costs.map((n,i)=>{const product=BigInt(n)*BigInt(target);return {i,n:Number(product/BigInt(total)),r:product%BigInt(total)};});
 let left=target-sum(parts,p=>p.n);[...parts].sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1).slice(0,left).forEach(p=>p.n++);return parts.map(p=>p.n);
}
// Ημιτελής κατανομή Plafond: όταν δεν έχουν καταχωριστεί ακόμη όλες οι εταιρείες,
// η πρόταση κάθε εταιρείας ισούται με κόστος × (C−P) / C, στρογγυλοποιημένη στο λεπτό.
export function partialShare(cost,target,total){
 if(!total)return 0;const p=BigInt(cost)*BigInt(target)*2n+BigInt(total);return Number(p/(BigInt(total)*2n));
}
export function status(c){
 if(c.closedReason?.trim())return 'Κλειστό με διαφορά';
 if(!c.lines.length)return 'Νέο';
 if(c.lines.some(l=>l.stage==='Απορρίφθηκε')&&c.lines.every(l=>['Παραλήφθηκε','Απορρίφθηκε'].includes(l.stage)))return 'Κλειστό με διαφορά';
 if(c.lines.every(l=>l.stage==='Παραλήφθηκε'&&l.received===l.requested)&&sum(c.lines,l=>l.received)===c.total-c.recognized)return 'Ολοκληρωμένο';
 if(c.lines.some(l=>l.received>0||l.stage==='Παραλήφθηκε'))return 'Μερικώς ολοκληρωμένο';
 if(c.lines.some(l=>l.stage==='Ζητήθηκε'))return 'Αναμονή πιστωτικών';
 return 'Προς αίτηση';
}
export const outstanding=l=>l.stage==='Απορρίφθηκε'?0:l.stage==='Προς αίτηση'?l.proposed:Math.max(0,l.requested-l.received);
export const rejected=l=>l.stage==='Απορρίφθηκε'?Math.max(0,l.requested-l.received):0;
export const waitingDays=(l,now=today())=>l.requestDate?Math.max(0,Math.round((Date.parse(now)-Date.parse(l.requestDate))/86400000)):0;
// Μη μπλοκαριστικές προειδοποιήσεις: επιτρέπεται αποθήκευση με ημιτελή αθροίσματα.
export function totalsWarnings(c){
 const w=[];if(!c.lines.length)return w;
 if(sum(c.lines,l=>l.cost)!==c.total)w.push('Το άθροισμα κόστους εταιρειών δεν ισούται με το συνολικό κόστος.');
 if(sum(c.lines,l=>l.proposed)!==c.total-c.recognized)w.push('Το άθροισμα προτεινόμενων πιστωτικών δεν ισούται με το ποσό προς κάλυψη.');
 return w;
}
export function validate(c){
 const errors=[];const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!c.code.trim()||!c.patient.trim()||!c.doctor.trim()||!validDate(c.incidentDate)||!validDate(c.date))errors.push('Συμπληρώστε κωδικό, ασθενή, ιατρό, ημερομηνία περιστατικού και ημερομηνία επιτροπής.');
 if(validDate(c.incidentDate)&&validDate(c.date)&&c.incidentDate>c.date)errors.push('Η ημερομηνία περιστατικού δεν μπορεί να είναι μετά την ημερομηνία επιτροπής.');
 if(!TYPES.includes(c.type))errors.push('Μη έγκυρος τύπος περικοπής.');
 if(!Number.isSafeInteger(c.total)||c.total<0||c.total>10000000000||!Number.isSafeInteger(c.recognized)||c.recognized<0||c.recognized>c.total)errors.push('Το αναγνωρισμένο ποσό πρέπει να είναι από 0 έως το συνολικό κόστος.');
 if(c.lines.length){
 if(new Set(c.lines.map(l=>l.companyId)).size!==c.lines.length)errors.push('Κάθε εταιρεία καταχωρείται μία φορά ανά περιστατικό.');
 let expected;try{if(c.type==='Plafond'&&!totalsWarnings(c).length)expected=allocate(c.lines.map(l=>l.cost),c.total-c.recognized);}catch{}
 c.lines.forEach((l,i)=>{
 const prefix=`Εταιρεία ${i+1}: `;
 if(!l.companyId)errors.push(prefix+'επιλέξτε εταιρεία.');
 if(!STAGES.includes(l.stage))errors.push(prefix+'μη έγκυρη κατάσταση.');
 if(['cost','proposed','requested','received'].some(k=>!Number.isSafeInteger(l[k])||l[k]<0||l[k]>10000000000))errors.push(prefix+'μη έγκυρο ποσό.');
 if(l.proposed>l.cost||l.requested>l.cost||l.received>l.requested)errors.push(prefix+'ελέγξτε ποσά (παραλαβή ≤ αίτημα ≤ κόστος).');
 if(expected&&l.proposed!==expected[i])errors.push(prefix+'μη έγκυρος υπολογισμός Plafond.');
 if(l.stage==='Προς αίτηση'&&(l.received||l.requestDate||l.receiveDate||l.creditNumber))errors.push(prefix+'η παραλαβή/αίτηση απαιτεί αλλαγή κατάστασης.');
 if(l.stage!=='Προς αίτηση'&&!validDate(l.requestDate))errors.push(prefix+'απαιτείται ημερομηνία αιτήματος.');
 if(l.receiveDate&&!validDate(l.receiveDate))errors.push(prefix+'μη έγκυρη ημερομηνία παραλαβής.');
 if((l.received>0||l.stage==='Παραλήφθηκε')&&!validDate(l.receiveDate))errors.push(prefix+'απαιτείται ημερομηνία παραλαβής.');
 if(l.requestDate&&l.requestDate<c.date)errors.push(prefix+'το αίτημα προηγείται της επιτροπής.');
 if(l.receiveDate&&l.receiveDate<l.requestDate)errors.push(prefix+'η παραλαβή προηγείται του αιτήματος.');
 });}
 else if(c.total!==0||c.recognized!==0)errors.push('Προσθέστε εταιρείες για να καταχωρίσετε κόστος.');
 if(c.closedReason?.trim()&&(sum(c.lines,l=>l.received)===c.total-c.recognized||!c.lines.length))errors.push('Κλείσιμο με διαφορά επιτρέπεται μόνο όταν υπάρχει διαφορά.');
 return [...new Set(errors)];
}
