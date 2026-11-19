import { PARTS } from './data/parts.js';
import { SYN } from './data/synonyms.js';

export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
/* busca una pieza por cualquier nombre: devuelve [{id, term}] ordenado */
export function searchParts(q){
  const n = norm(q).trim(); if(!n) return [];
  const out = [];
  for(const [id,terms] of Object.entries(SYN)){
    let best = 0, term = '';
    const nameN = norm(PARTS[id].nombre);
    if(nameN.includes(n)){ best = 100; term = PARTS[id].nombre; }
    for(const t of terms){ const tn = norm(t);
      if(tn===n){ if(90>best){best=90;term=t;} }
      else if(tn.startsWith(n) && n.length>=3){ if(70>best){best=70;term=t;} }
      else if(n.includes(tn) && tn.length>=4){ if(50+tn.length>best){best=50+tn.length;term=t;} }
      else if(tn.includes(n) && n.length>=3){ if(40>best){best=40;term=t;} } }
    if(best) out.push({id,term,score:best});
  }
  return out.sort((a,b)=>b.score-a.score);
}
/* modelos donde aparece una pieza */
