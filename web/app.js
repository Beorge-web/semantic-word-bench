'use strict';
const q = selector => document.querySelector(selector);
let suite, run, selected, busy=false;
const words = {
  ru:{round:'Раунд',prompt:'Скопировать промпт',promptText:'Текст промпта',attempts:'Попытки',best:'Лучший ранг',cycle:'Средний цикл',word:'Слово',submit:'Проверить',giveUp:'Сдаться',attempt:'Попытка',rank:'Ранг',result:'Результат',rules:'Ранг 1 означает победу. Чем меньше ранг, тем ближе слово. Повторы и неизвестные слова расходуют попытку.',instruction:'Один раунд на один новый чат. После завершения верни управление оператору.',pending:'Не начат',active:'В процессе',solved:'Разгадано',exhausted:'Лимит попыток',abandoned:'Сдано',unknown_word:'Слова нет в словаре',invalid_format:'Введи одно слово нужного языка',duplicate:'Повтор',valid:'Принято',win:'Слово найдено',copied:'Промпт скопирован',placeholder:'Введи русское слово',seconds:'с'},
  en:{round:'Round',prompt:'Copy prompt',promptText:'Prompt text',attempts:'Attempts',best:'Best rank',cycle:'Mean cycle',word:'Word',submit:'Guess',giveUp:'Give up',attempt:'Attempt',rank:'Rank',result:'Result',rules:'Rank 1 means a win. Lower is closer. Repeated and unknown words consume an attempt.',instruction:'Use a fresh chat for this round. Return control to the operator when finished.',pending:'Not started',active:'In progress',solved:'Solved',exhausted:'Attempt limit',abandoned:'Given up',unknown_word:'Word not in dictionary',invalid_format:'Enter one word in the assigned language',duplicate:'Repeated',valid:'Accepted',win:'Word found',copied:'Prompt copied',placeholder:'Enter an English word',seconds:'s'},
};
const finished = row => ['solved','exhausted','abandoned'].includes(row.status);
const format = (value,digits=1) => value===null||value===undefined?'—':Number(value).toLocaleString('ru-RU',{maximumFractionDigits:digits});
const current = () => run.rounds[selected];
const tr = () => words[current().language];
async function api(path, body) {
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||String(response.status));
  return result;
}
function error(message){q('#error').textContent=message;q('#error').hidden=!message;}
async function attempt(action){
  if(busy)return;
  busy=true;error('');
  try{await action();}catch(problem){error(problem.message);}finally{busy=false;renderDisabled();}
}
function row(cells){const element=document.createElement('tr');cells.forEach((value,index)=>{const cell=document.createElement('td');cell.textContent=value;if(index>1)cell.className='numeric';element.append(cell);});return element;}
function renderDisabled(){if(!run)return;const done=finished(current());q('#word').disabled=q('#submit-guess').disabled=busy||done;q('#abandon').disabled=busy||done;}
function syncURL(){const url=new URL(location.href);url.searchParams.set('run',run.id);url.searchParams.set('round',selected);history.replaceState(null,'',url);}
async function loadPrompt(){
  const path=`/api/runs/${run.id}/prompt/${selected}`;
  q('#prompt-link').href=path;
  const result=await api(path);q('#prompt-text').textContent=result.prompt;
}
function renderRound(){
  const round=current(), t=tr();
  document.documentElement.lang=round.language;
  q('#round-label').firstChild.textContent=t.round;
  q('#play-tab').textContent=round.language==='en'?'Game':'Игра';q('#results-tab').textContent=round.language==='en'?'Results':'Результаты';
  q('#new-link').textContent=round.language==='en'?'New run':'Новый запуск';
  for(const option of q('#round-select').options)option.textContent=`${option.value} · ${t[run.rounds[option.value].status]}`;
  q('#round-select').value=selected;
  q('#round-title').textContent=`${t.round} ${selected}`;q('#status').textContent=t[round.status];
  q('#copy-prompt').textContent=t.prompt;q('#prompt-link').textContent=t.promptText;
  q('#attempt-caption').textContent=t.attempts;q('#best-caption').textContent=t.best;q('#clock-caption').textContent=t.cycle;
  q('#attempts').textContent=`${round.events.length} / ${suite.max_guesses}`;q('#best').textContent=format(round.best_rank,0);
  const cycles=round.events.filter(event=>event.cycle_ms!==null).map(event=>event.cycle_ms);
  q('#cycle').textContent=cycles.length?`${format(cycles.reduce((a,b)=>a+b,0)/cycles.length/1000)} ${t.seconds}`:'—';
  q('#rules').textContent=t.rules;q('#round-instruction').textContent=t.instruction;
  q('#word-label').textContent=t.word;q('#word').placeholder=t.placeholder;q('#submit-guess').textContent=t.submit;q('#abandon').textContent=t.giveUp;
  q('#col-attempt').textContent=t.attempt;q('#col-word').textContent=t.word;q('#col-rank').textContent=t.rank;q('#col-note').textContent=t.result;q('#prompt-summary').textContent=t.promptText;
  q('#history').replaceChildren(...[...round.events].reverse().map(event=>{
    const element=row([event.attempt,event.word,format(event.rank,0),event.error?t[event.error]:event.duplicate?t.duplicate:event.rank===1?t.win:t.valid]);
    element.lastChild.className=event.rank===1?'win':'';return element;
  }));
  const last=round.events.at(-1);q('#feedback').hidden=!last;
  q('#feedback').textContent=last?(last.error?t[last.error]:`${last.word}: ${t.rank.toLowerCase()} ${format(last.rank,0)}${last.duplicate?' · '+t.duplicate:''}`):'';
  q('#feedback').classList.toggle('error',Boolean(last?.error));
  renderDisabled();syncURL();
}
function renderResults(){
  const summary=run.summary;
  q('#completion').textContent=summary.complete?'Запуск завершён. Результат можно сравнивать.':`Запуск продолжается. Завершено ${summary.finished_rounds} из 20. PAR2 пока предварительный, оставшиеся раунды считаются неудачами.`;
  const groups=[['Все задания',summary.all],['Русские слова',summary.by_language.ru],['English words',summary.by_language.en]];
  q('#metrics').replaceChildren(...groups.map(([label,s])=>row([label,`${s.solved} / ${s.rounds}`,format(s.par2,2),format(s.solved_guesses_mean,2),s.cycle_mean_ms===null?'—':`${format(s.cycle_mean_ms/1000)} с`])));
  q('#quality-notes').textContent=`Неизвестные слова и ошибки формата: ${summary.all.invalid}. Повторы: ${summary.all.duplicates}. Вмешательства человека: ${summary.interventions}.`;
  q('#round-results').replaceChildren(...Object.values(run.rounds).map(round=>row([round.id,words.ru[round.status],round.events.length,format(round.best_rank,0)])));
  q('#fingerprints').textContent=`Набор ${run.suite_fingerprint}\nПротокол ${run.protocol_fingerprint}`;
  q('#finish').disabled=summary.complete;
}
function renderRun(){
  q('#setup').hidden=true;q('#workspace').hidden=false;
  q('#run-label').textContent=run.metadata.model;
  q('#run-context').textContent=`${run.metadata.provider} · ${run.metadata.effort} · ${run.metadata.track} · повтор ${run.metadata.repetition}`;
  q('#round-select').replaceChildren(...Object.values(run.rounds).map(round=>{const option=document.createElement('option');option.value=round.id;option.textContent=`${round.id} · ${words.ru[round.status]}`;return option;}));
  renderRound();renderResults();
}
function tab(name){for(const key of ['play','results']){q('#'+key+'-panel').hidden=key!==name;q('#'+key+'-tab').setAttribute('aria-selected',String(key===name));}}
q('#new-run').addEventListener('submit',event=>{event.preventDefault();attempt(async()=>{const body=Object.fromEntries(new FormData(event.target));body.repetition=Number(body.repetition);run=await api('/api/runs',body);selected=Object.keys(run.rounds)[0];renderRun();await loadPrompt();});});
q('#guess-form').addEventListener('submit',event=>{event.preventDefault();attempt(async()=>{run=await api(`/api/runs/${run.id}/guess`,{round_id:selected,word:q('#word').value,request_id:crypto.randomUUID()});q('#word').value='';renderRun();q('#word').focus();});});
q('#round-select').addEventListener('change',()=>attempt(async()=>{selected=q('#round-select').value;q('#word').value='';renderRound();await loadPrompt();}));
q('#copy-prompt').addEventListener('click',()=>attempt(async()=>{await navigator.clipboard.writeText(q('#prompt-text').textContent);q('#copy-prompt').textContent=tr().copied;}));
q('#abandon').addEventListener('click',()=>attempt(async()=>{run=await api(`/api/runs/${run.id}/abandon`,{round_id:selected});renderRun();}));
q('#play-tab').addEventListener('click',()=>tab('play'));q('#results-tab').addEventListener('click',()=>tab('results'));
q('#finish').addEventListener('click',()=>{if(confirm('Завершить все оставшиеся раунды как неудачи?'))attempt(async()=>{run=await api(`/api/runs/${run.id}/finish`,{});renderRun();});});
q('#intervention-form').addEventListener('submit',event=>{event.preventDefault();attempt(async()=>{run=await api(`/api/runs/${run.id}/intervention`,{note:q('#intervention').value});q('#intervention').value='';renderRun();});});
q('#new-link').addEventListener('click',()=>{location.href='/';});
q('#export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`wordbench-${run.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
attempt(async()=>{
  suite=await api('/api/suite');
  q('#suite-description').textContent=`10 русских и 10 английских слов. По ${suite.rounds[0].vocabulary_size.toLocaleString('ru-RU')} слов в каждом словаре. ${suite.max_guesses} попыток на раунд.`;
  const params=new URLSearchParams(location.search), id=params.get('run');
  if(id){run=await api(`/api/runs/${id}`);selected=params.get('round');if(!run.rounds[selected])selected=Object.keys(run.rounds)[0];renderRun();await loadPrompt();}
});
