-- Επιτρέπει αποθήκευση ημιτελών περιστατικών: τα αθροίσματα εταιρειών δεν μπλοκάρουν πλέον.
create or replace function public.mc_validate_case() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
 c jsonb:=new.payload; l jsonb; f jsonb; k text; amount numeric;
 total_c bigint; recognized_c bigint; cost_sum bigint:=0; prop_sum bigint:=0; received_sum bigint:=0;
 target_c bigint; line_count integer; expected bigint; rownum integer:=0;
begin
 if jsonb_typeof(c) is distinct from 'object' then raise exception 'Invalid case'; end if;
 foreach k in array array['code','patient','doctor','incidentDate','date','type','notes','closedReason'] loop
  if jsonb_typeof(c->k) is distinct from 'string' then raise exception 'Missing field: %',k; end if;
 end loop;
 if length(trim(c->>'code')) not between 1 and 80 or length(trim(c->>'patient')) not between 1 and 200
  or length(trim(c->>'doctor')) not between 1 and 200 then raise exception 'Required case fields'; end if;
 if c->>'incidentDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((c->>'incidentDate')::date,'YYYY-MM-DD')<>c->>'incidentDate' then raise exception 'Invalid incident date';end if;
 if c->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((c->>'date')::date,'YYYY-MM-DD')<>c->>'date' then raise exception 'Invalid committee date';end if;
 if c->>'incidentDate'>c->>'date' then raise exception 'Incident date follows committee date';end if;
 if c->>'type' not in ('Plafond','Συγκεκριμένα υλικά','Άλλο') then raise exception 'Invalid cut type';end if;
 foreach k in array array['total','recognized'] loop
  if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'Missing amount: %',k;end if;
  amount:=(c->>k)::numeric;
  if amount<>trunc(amount) or amount<0 or amount>10000000000 then raise exception 'Invalid cents';end if;
 end loop;
 total_c:=(c->>'total')::bigint;recognized_c:=(c->>'recognized')::bigint;target_c:=total_c-recognized_c;
 if target_c<0 then raise exception 'Recognized amount exceeds cost';end if;
 if jsonb_typeof(c->'lines') is distinct from 'array' then raise exception 'Missing company lines';end if;
 line_count:=jsonb_array_length(c->'lines');
 if line_count>200 then raise exception 'Maximum 200 companies per case';end if;
 if line_count=0 and (total_c<>0 or recognized_c<>0) then raise exception 'Add company costs';end if;
 if (select count(distinct x->>'companyId') from jsonb_array_elements(c->'lines') x)<>line_count then raise exception 'Duplicate company';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(c->'lines') x)<>line_count then raise exception 'Duplicate line ID';end if;
 for l in select value from jsonb_array_elements(c->'lines') loop
  perform (l->>'id')::uuid;
  if not exists(select 1 from public.mc_companies where id=(l->>'companyId')::uuid) then raise exception 'Unknown company';end if;
  foreach k in array array['cost','proposed','requested','received'] loop
   if jsonb_typeof(l->k) is distinct from 'number' then raise exception 'Missing amount: %',k;end if;
   amount:=(l->>k)::numeric;
   if amount<>trunc(amount) or amount<0 or amount>10000000000 then raise exception 'Invalid cents';end if;
  end loop;
  foreach k in array array['stage','requestDate','receiveDate','creditNumber','notes'] loop
   if jsonb_typeof(l->k) is distinct from 'string' then raise exception 'Missing line field: %',k;end if;
  end loop;
  if l->>'stage' not in ('Προς αίτηση','Ζητήθηκε','Παραλήφθηκε') then raise exception 'Invalid tracking stage';end if;
  if (l->>'proposed')::bigint>(l->>'cost')::bigint or (l->>'requested')::bigint>(l->>'cost')::bigint or (l->>'received')::bigint>(l->>'requested')::bigint then raise exception 'Invalid credit amounts';end if;
  foreach k in array array['requestDate','receiveDate'] loop
   if l->>k<>'' and (l->>k !~ '^\d{4}-\d{2}-\d{2}$' or to_char((l->>k)::date,'YYYY-MM-DD')<>l->>k) then raise exception 'Invalid tracking date';end if;
  end loop;
  if l->>'stage'='Προς αίτηση' and ((l->>'received')::bigint<>0 or l->>'requestDate'<>'' or l->>'receiveDate'<>'' or l->>'creditNumber'<>'') then raise exception 'Unrequested credit cannot have tracking';end if;
  if l->>'stage'<>'Προς αίτηση' and l->>'requestDate'='' then raise exception 'Request date required';end if;
  if ((l->>'received')::bigint>0 or l->>'stage'='Παραλήφθηκε') and (l->>'receiveDate'='' or trim(l->>'creditNumber')='') then raise exception 'Receipt date and number required';end if;
  if l->>'requestDate'<>'' and l->>'requestDate'<c->>'date' then raise exception 'Request precedes committee';end if;
  if l->>'receiveDate'<>'' and l->>'receiveDate'<l->>'requestDate' then raise exception 'Receipt precedes request';end if;
  cost_sum:=cost_sum+(l->>'cost')::bigint;prop_sum:=prop_sum+(l->>'proposed')::bigint;received_sum:=received_sum+(l->>'received')::bigint;
 end loop;
 -- Largest remainder allocation in integer cents; ties follow the stored line order.
 if c->>'type'='Plafond' and total_c>0 and cost_sum=total_c and prop_sum=target_c then
  for l,expected in
   with parts as (
    select value,ordinality,
     floor((value->>'cost')::numeric*target_c/total_c)::bigint as base,
     mod((value->>'cost')::numeric*target_c,total_c) as remainder
    from jsonb_array_elements(c->'lines') with ordinality
   ), ranked as (
    select *,row_number() over(order by remainder desc,ordinality) as rank,
     target_c-sum(base) over() as extra from parts
   ) select value,base+case when rank<=extra then 1 else 0 end from ranked
  loop
   if (l->>'proposed')::bigint<>expected then raise exception 'Invalid Plafond allocation';end if;
  end loop;
 end if;
 if trim(c->>'closedReason')<>'' and (line_count=0 or received_sum=target_c) then raise exception 'No difference to close';end if;
 -- Only UUID-scoped PDF object references, never external/public URLs.
 for f in select c->'decision' union all select x->'credit' from jsonb_array_elements(c->'lines') x loop
  if f is not null and f<>'null'::jsonb then
   if jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(f->'name') is distinct from 'string'
    or coalesce(f->>'path','') !~ ('^'||new.id::text||'/[0-9a-f-]{36}\.pdf$') then raise exception 'Invalid PDF reference';end if;
  end if;
 end loop;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.version<>old.version then raise exception 'Το περιστατικό άλλαξε. Ανανεώστε πριν την αποθήκευση.';end if;
  new.history:=old.history||jsonb_build_array(jsonb_build_object('version',old.version,'payload',old.payload,'at',old.updated_at,'by',old.updated_by));
  new.version:=old.version+1;
 else new.version:=1;new.history:='[]'::jsonb;
 end if;
 new.payload:=c-'version'-'id';new.code:=trim(c->>'code');new.updated_at:=now();new.updated_by:=auth.uid();
 return new;
end $$;
