// ============================================
// crcioffical.final - shd.js - TODAY-FETCH FINAL (Detail Date Filter - Header pe bharosa nahi)
// AJ KA DIN - Sare matches fetch karo - LIVE + UPCOMING - Kal/Parso NAHI
// 1. https://crex.com/schedule -> AJ ki date (Asia/Karachi) wale sare matches
// 2. Har match ka Detail: Match Info (Left) + Playing XI (Right) + Thumbnail (Vector + Jersey)
// 3. LIVE walo ka Goscorer API se LIVE score (j,k,p,q,s,b,y,z,c,rb,B)
// 4. UPCOMING walo ka COUNTDOWN + Playing XI (agar available)
// 5. Sab ko match-schedule.json (aj ke sare) + live-data.json (pehla LIVE, ya pehla UPCOMING) me SAVE
// TEST: LIVE bhi test hoga, UPCOMING bhi - Scoreboard-MASTER-AUTO.html me Arrow keys se switch
// ============================================
const fs = require('fs');
const puppeteer = require('puppeteer');
const https = require('https');

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function fetchJSON(url){
  return new Promise((res, rej)=>{
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r)=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{ res(JSON.parse(d)); }catch(e){ rej(e); } });
    }).on('error', rej);
  });
}
// Aj ki date - Asia/Karachi - 2026-11-08 jaisa: "8 Nov", "08 Nov", "8 November", "Nov 8"
function todayStrings(){
  const now = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Karachi'}));
  const day = now.getDate(); const dayPad = String(day).padStart(2,'0');
  const monthShort = now.toLocaleString('en-US',{month:'short', timeZone:'Asia/Karachi'}); // Nov
  const monthLong = now.toLocaleString('en-US',{month:'long', timeZone:'Asia/Karachi'}); // November
  const year = now.getFullYear();
  return { now, day, dayPad, monthShort, monthLong, year, patterns:[`${day} ${monthShort}`, `${dayPad} ${monthShort}`, `${day} ${monthLong}`, `${monthShort} ${day}`, `${monthShort} ${dayPad}`, `${day}/${monthShort}`, `${year}-${String(now.getMonth()+1).padStart(2,'0')}-${dayPad}`] };
}
function isToday(text, ts){
  const t = (text||'').toLowerCase();
  // Agar schedule card me "Today" likha hai to pakka aj ka
  if(t.includes('today')) return true;
  for(const p of ts.patterns){ if(t.includes(p.toLowerCase())) return true; }
  return false;
}
// Domestic filter - sirf International + main leagues? - AJ ke liye Domestic bhi rakhte hain, lekin user ke purane filter ko optional rakha
const DOMESTIC_SKIP = ['bangladesh-national-league','first-class-only','quaid-e-azam','ford-trophy','csa-pro','nepal-premier'];

async function runToday(){
  const ts = todayStrings();
  console.log('📅 TODAY-FETCH - Aj ka din:', ts.now.toDateString(), '| Patterns:', ts.patterns.join(', '));
  console.log('📍 https://crex.com/schedule -> AJ ke SARE matches (LIVE + UPCOMING)');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log('\n[1/4] Opening https://crex.com/schedule ...');
  await page.goto('https://crex.com/schedule', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  // Scroll taake aj ke sare cards load hon
  for(let i=0;i<5;i++){ await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await sleep(1500); }
  await page.evaluate(()=>window.scrollTo(0,0)); await sleep(1000);

  // FIXED: Schedule me date HEADER me hai, card ke andar NAHI - isliye DOM order me chalo, header ko yaad rakho
  const allCards = await page.evaluate(() => {
    // Poora schedule DOM order me walk karo - date header mile to currentDate update karo, match mile to us date ke saath save karo
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    const seen = new Set(); const out=[]; let currentDate = '';
    let node;
    while(node = walker.nextNode()){
      const txt = (node.innerText||'').trim();
      // Date header? - "Sunday, 8 November" / "Sunday, 8 November, 2026" / "Today" - aur iske andar koi match link NAHI hai
      if(txt && /^(Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}\s+\w+/i.test(txt) && txt.length < 80 && !node.querySelector('a[href*="/cricket-live-score/"]')){
        currentDate = txt.replace(/\n/g,' ').trim();
        continue;
      }
      // Match link?
      if(node.tagName==='A'){
        const href=node.getAttribute('href'); if(!href||!href.includes('/cricket-live-score/')||seen.has(href)) continue; seen.add(href);
        let card=node; for(let i=0;i<4;i++){ if(card.parentElement) card=card.parentElement; }
        const cardTxt = card ? card.innerText : node.innerText;
        const isLive = cardTxt.includes('Live') || cardTxt.includes('LIVE');
        out.push({ detailUrl: href.startsWith('http')?href:'https://crex.com'+href, text: cardTxt.slice(0,600).replace(/\n/g,' | '), isLive, scheduleDate: currentDate });
      }
    }
    return out;
  });
  console.log(`   Total cards schedule me: ${allCards.length}`);

  // ULTIMATE FIX: Schedule header pe bharosa MAT karo - Crex ka header Angular me alag tarah render hota hai, isliye khali aata hai
  // Sahi tareeka: Sare 20 cards lo, har ek ka DETAIL page kholo, uski date se filter karo - detail ki date 100% sahi hoti hai
  console.log(`   📅 Sare ${allCards.length} cards ka DETAIL khol ke date check karenge - header pe bharosa nahi`);
  let finalCards = allCards; // pehle sare lo, baad me detail date se filter karenge
  console.log(`   📅 CHECK KARNE: ${finalCards.length} matches`);
  // Domestic skip - sirf agar user chahe to? - AJ ke liye Domestic bhi rakhte hain, lekin purana LIVE-ONLY filter optional:
  // finalCards = finalCards.filter(c=> !DOMESTIC_SKIP.some(s=>c.detailUrl.includes(s)));

  const allMatches = [];
  const globalPlayersMap = {};

  // Har match ka detail - ek ek karke
  for(let idx=0; idx<finalCards.length; idx++){
    const card = finalCards[idx];
    console.log(`\n[${idx+1}/${finalCards.length}] 🕐 CHECKING ${card.detailUrl} (LIVE/UPCOMING ka faisla API se hoga)`);
    try{
      await page.goto(card.detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2500);
      await page.evaluate(()=>window.scrollTo(0,500)); await sleep(1200);
      await page.evaluate(()=>{ const tabs=Array.from(document.querySelectorAll('.tab-link')); const mi=tabs.find(t=>t.textContent.trim()==='Match info'); if(mi) mi.click(); });
      await sleep(2000);
      await page.evaluate(()=>window.scrollTo(0,800)); await sleep(1200);
      try{ await page.waitForSelector('.s-format', { timeout: 6000 }); }catch(e){}

      const pack = await page.evaluate(() => {
        const getText=(sel)=>{ const el=document.querySelector(sel); return el?el.textContent.trim():''; };
        let sFormat=getText('.s-format');
        let sName=''; const sN=document.querySelector('.s-name'); if(sN) sName=sN.textContent.trim().replace(/\n/g,' ').replace(/\s+/g,' ');
        let sImg=''; const sI=document.querySelector('.s-img'); if(sI) sImg=sI.getAttribute('src')||'';
        let seriesId=''; if(sImg){ const mm=sImg.match(/Series\/([^\.]+)\.png/); if(mm) seriesId=mm[1]; }
        let dateStr='', venueStr='', broadcasterStr='';
        const allDivs=Array.from(document.querySelectorAll('div'));
        const dEl=allDivs.find(d=>/\w+, \d+ \w+, \d+:\d+ [AP]M/.test(d.textContent)&&d.children.length===0); if(dEl) dateStr=dEl.textContent.trim();
        const vEl=document.querySelector('.venue'); if(vEl) venueStr=vEl.textContent.trim();
        const bEl=document.querySelector('.match-broadcaster div'); if(bEl) broadcasterStr=bEl.textContent.trim();
        const teamsButtons=Array.from(document.querySelectorAll('.playingxi-button')).map(b=>b.textContent.trim());
        const headerTitle=getText('.playingxi-header-title');
        const extract=()=>{ const rows=Array.from(document.querySelectorAll('.playingxi-card-row')); return rows.map(row=>{ const link=row.querySelector('a'); const href=link?link.getAttribute('href'):''; let pid=''; if(href) pid=href.split('/').pop().split('-').pop(); const fullName=link?(link.getAttribute('title')||''):''; const shortName=row.querySelector('.p-name')?row.querySelector('.p-name').textContent.trim():''; const role=row.querySelector('.bat-ball-type div')?row.querySelector('.bat-ball-type div').textContent.trim():''; const imgs=Array.from(row.querySelectorAll('img')); let vector='',jersey=''; imgs.forEach(img=>{ const src=img.getAttribute('src')||''; if(src.includes('/players/org/')) vector=src.split('?')[0]; if(src.includes('/jersey/')) jersey=src.split('?')[0]; }); return { id:pid, fullName, shortName, role, vector, jersey, thumbnail: vector, profileUrl: href?'https://crex.com'+href:'' }; }); };
        return { sFormat, sName, sImg, seriesId, dateStr, venueStr, broadcasterStr, headerTitle, visiblePlayers: extract(), teamsButtons };
      });

      let otherTeam=[];
      if(pack.teamsButtons.length>=2){
        await page.evaluate(()=>{ const btns=Array.from(document.querySelectorAll('.playingxi-button')); const ns=btns.find(b=>!b.classList.contains('selected')); if(ns) ns.click(); });
        await sleep(1500);
        otherTeam = await page.evaluate(()=>{ const rows=Array.from(document.querySelectorAll('.playingxi-card-row')); return rows.map(row=>{ const link=row.querySelector('a'); const href=link?link.getAttribute('href'):''; let pid=href?href.split('/').pop().split('-').pop():''; const imgs=Array.from(row.querySelectorAll('img')); let vector='',jersey=''; imgs.forEach(img=>{ const src=img.getAttribute('src')||''; if(src.includes('/players/org/')) vector=src.split('?')[0]; if(src.includes('/jersey/')) jersey=src.split('?')[0]; }); return { id:pid, fullName:link?link.getAttribute('title'):'', shortName:row.querySelector('.p-name')?row.querySelector('.p-name').textContent.trim():'', role:row.querySelector('.bat-ball-type div')?row.querySelector('.bat-ball-type div').textContent.trim():'', vector, jersey, thumbnail: vector }; }); });
      }

      const apiKey=(card.detailUrl.match(/-([A-Z0-9]+)$/)||[])[1]||'';
      // FIXED: sName na mile to URL slug se team nikalo - sys-w-vs-syt-w -> SYS-W vs SYT-W
      let t1='',t2=''; const vs=pack.sName.match(/([A-Z]+)\s+vs\s+([A-Z]+)/i);
      if(vs){ t1=vs[1].toUpperCase(); t2=vs[2].toUpperCase(); }
      else if(pack.teamsButtons.length>=2){ t1=pack.teamsButtons[0]; t2=pack.teamsButtons[1]; }
      else {
        const slug = card.detailUrl.split('/').pop().replace(/-\d+[A-Z0-9]+$/,'');
        const m = slug.match(/^(.+?)-vs-(.+?)-\d+/i) || slug.match(/^(.+?)-vs-(.+?)$/i);
        if(m){ t1=m[1].replace(/-/g,' ').toUpperCase().replace(/\s+/g,'-'); t2=m[2].replace(/-/g,' ').toUpperCase().replace(/\s+/g,'-'); 
          // sName bhi fix karo taake scoreboard me khali na dikhe
          if(!pack.sName) pack.sName = t1+' vs '+t2;
        }
      }
      // Date bhi schedule header se lo agar detail page me na mile
      if(!pack.dateStr && card.scheduleDate) pack.dateStr = card.scheduleDate;
      const playersMap={};
      [...pack.visiblePlayers, ...otherTeam].forEach(p=>{ if(p.id && !playersMap[p.id]) playersMap[p.id]={ id:p.id, name:p.fullName, shortName:p.shortName, role:p.role, vector:p.vector, jersey:p.jersey, thumbnail:p.vector }; Object.assign(globalPlayersMap, playersMap); });

      // LIVE hai to Goscorer API - UPCOMING hai to skip (API me kuch nahi hoga)
      let apiData=null, liveObj={ isLive:false, scoreText:"", batsmen:[], bowler:null, commentary:"Match starts soon", ballByBall:[], raw:{} };
      if(card.isLive){
        const apiUrl=`https://api.goscorer.com/api/v3/getSV3?key=${apiKey}`;
        console.log(`   Goscorer: ${apiUrl}`);
        try{ apiData=await fetchJSON(apiUrl); console.log(`   API: j="${apiData.j}" k="${apiData.k}" B="${apiData.B}" p="${apiData.p}"`); }catch(e){ console.log(`   ❌ API fail - ${e.message}`); }
      } else {
        console.log(`   ⏸ UPCOMING - Goscorer skip, COUNTDOWN + XI hi kaafi`);
      }

      if(apiData && (apiData.j || apiData.k || apiData.B)){
        const parseScore=(s)=>{ if(!s) return { runs:0, wickets:0, overs:"0.0", raw:"" }; const paren=s.match(/\(([\d\.]+)/); const overs=paren?paren[1]:"0.0"; const main=s.split('(')[0]; const [r,w]=main.split('/').map(x=>parseInt(x)||0); return { runs:r||0, wickets:w||0, overs, raw:s }; };
        const parseRB=(s)=>{ if(!s) return { runs:0,balls:0,isStriker:false }; const st=s.includes('*'); const c=s.replace('*',''); const [r,b]=c.split('.'); return { runs:parseInt(r)||0, balls:parseInt(b)||0, isStriker:st }; };
        const batIds=(apiData.p||'').split('.').filter(Boolean);
        const bat1=parseRB(apiData.q), bat2=parseRB(apiData.s);
        const batsmen=batIds.map((id,idx)=>{ const st=idx===0?bat1:bat2; const p=playersMap[id]||{ id, name:id, shortName:id, vector:`https://cricketvectors.akamaized.net/players/org/${id}.png`, jersey:'' }; let jersey=p.jersey||''; [...pack.visiblePlayers, ...otherTeam].forEach(x=>{ if(x.id===id && x.jersey) jersey=x.jersey; }); return { id, name:p.name, shortName:p.shortName, role:p.role, vector:p.vector||`https://cricketvectors.akamaized.net/players/org/${id}.png`, jersey, thumbnail:p.vector||`https://cricketvectors.akamaized.net/players/org/${id}.png`, runs:st.runs, balls:st.balls, isStriker:st.isStriker }; });
        let bowler=null;
        // FIXED: Innings Break pe b="" hota hai - Bowler NULL, jhoota 0-23 (44) mat banao
        if(apiData.b && String(apiData.b).trim()!==''){
          const p=playersMap[apiData.b]||{ id:apiData.b, name:apiData.b, shortName:apiData.b, vector:`https://cricketvectors.akamaized.net/players/org/${apiData.b}.png`, jersey:'' };
          let jersey=p.jersey||''; [...pack.visiblePlayers, ...otherTeam].forEach(x=>{ if(x.id===apiData.b && x.jersey) jersey=x.jersey; });
          let overs="0.0", runs=0, wkts=0, ballsB=0; const yP=(apiData.y||'').split('.'); const zP=(apiData.z||'').split('.');
          const ballsToOvers=(b)=> Math.floor(b/6)+"."+(b%6);
          if(yP[0]===apiData.b){ runs=parseInt(yP[1])||0; ballsB=parseInt(yP[2])||0; overs=ballsToOvers(ballsB); wkts=parseInt(yP[3])||0; }
          else if(zP[0]===apiData.b){ runs=parseInt(zP[1])||0; ballsB=parseInt(zP[2])||0; overs=ballsToOvers(ballsB); wkts=parseInt(zP[3])||0; }
          else if(apiData.c){ const cP=apiData.c.split('.'); overs=cP[0]; runs=parseInt(cP[1])||0; wkts=parseInt(cP[2])||0; }
          bowler={ id:apiData.b, name:p.name, shortName:p.shortName, vector:p.vector, jersey, thumbnail:p.vector, overs, runs, wickets:wkts, figures:`${wkts}-${runs} (${overs})` };
        }
        const score=parseScore(apiData.j), score2=parseScore(apiData.k);
        // FIXED: B="B" (single) = koi ball nahi, "Ball in Progress" dikhao. B="Innings Break" = wahi dikhao.
        let cleanB = apiData.B || '';
        if(cleanB.trim()==='B' || cleanB.trim()==='b') cleanB = 'Ball in Progress';
        liveObj={ isLive:true, score, score2, scoreText:`${score.runs}/${score.wickets} (${score.overs})`, batsmen, bowler, commentary:cleanB, ballByBall:apiData.rb||[], raw:{ j:apiData.j, k:apiData.k, p:apiData.p, q:apiData.q, s:apiData.s, b:apiData.b, y:apiData.y, z:apiData.z, c:apiData.c, B:cleanB } };
        console.log(`   ✅ LIVE: ${liveObj.scoreText} - ${batsmen.map(b=>`${b.shortName} ${b.runs}(${b.balls})${b.isStriker?'*':''}`).join(', ')} - ${bowler?bowler.shortName+' '+bowler.figures:''}`);
      } else if(card.isLive){
        console.log('   ⏸ LIVE badge tha lekin API me live nahi - COUNTDOWN mode');
      }

      const matchObj={
        updatedAt:new Date().toISOString(),
        matchId:apiKey, apiKey, apiUrl:`https://api.goscorer.com/api/v3/getSV3?key=${apiKey}`,
        matchNumber:pack.sFormat, series:pack.sName, seriesId:pack.seriesId, seriesImg:pack.sImg,
        format:pack.sFormat.includes('ODI')?'ODI':pack.sFormat.includes('T20')?'T20':pack.sFormat.includes('Test')?'Test':pack.sFormat,
        date:pack.dateStr, venue:pack.venueStr, broadcaster:pack.broadcasterStr, detailUrl:card.detailUrl,
        isLive: card.isLive, status: card.isLive ? 'LIVE' : 'UPCOMING',
        // FIXED FLAGS: Desh hai to flagcdn, Team hai (SYS-W, SYT-W) to Teams/<API-code>.png - API se lo!
        // API: a="50.8W" + speech_names {50:"Sydney Sixers", 8W:"Sydney Thunder"} -> Teams/50.png, Teams/8W.png
        team1:{ code:t1, name: (apiData && apiData.speech_names && apiData.a) ? (apiData.speech_names[String(apiData.a).split('.')[0]] || t1) : t1,
                apiCode: (apiData && apiData.a) ? String(apiData.a).split('.')[0] : '',
                flag: (apiData && apiData.a) ? ('https://cricketvectors.akamaized.net/Teams/' + String(apiData.a).split('.')[0] + '.png') : (`https://flagcdn.com/w80/${t1.toLowerCase().replace(/-w$/,'').replace(/-u19$/,'')}.png`) },
        team2:{ code:t2, name: (apiData && apiData.speech_names && apiData.a) ? (apiData.speech_names[String(apiData.a).split('.')[1]] || t2) : t2,
                apiCode: (apiData && apiData.a) ? String(apiData.a).split('.')[1] : '',
                flag: (apiData && apiData.a) ? ('https://cricketvectors.akamaized.net/Teams/' + String(apiData.a).split('.')[1] + '.png') : (`https://flagcdn.com/w80/${t2.toLowerCase().replace(/-w$/,'').replace(/-u19$/,'')}.png`) },
        players:{ [pack.teamsButtons[0]||t1]:pack.visiblePlayers, [pack.teamsButtons[1]||t2]:otherTeam },
        live: liveObj,
        scrapedAt:new Date().toISOString()
      };
      // DETAIL DATE FILTER - Sirf aj wale rakho, baaki skip
      const detailDate = (pack.dateStr||'') + ' ' + (card.scheduleDate||'');
      const isTodayMatch = isToday(detailDate, ts);
      if(!isTodayMatch){
        console.log(`   ⏭️ SKIP - Aj ka nahi hai: ${detailDate} | ${matchObj.team1.code} vs ${matchObj.team2.code}`);
        continue; // for-loop ka next match
      }
      console.log(`   ✅ AJ KA HAI: ${detailDate}`);
      allMatches.push(matchObj);
    }catch(e){
      console.log(`   ❌ Is match me error: ${e.message}`);
    }
  }

  // SAVE - match-schedule.json = AJ KE SARE, live-data.json = pehla LIVE (nahi to pehla UPCOMING)
  const liveFirst = allMatches.find(m=>m.live.isLive) || allMatches[0];
  console.log(`\n[4/4] SAVE - match-schedule.json: ${allMatches.length} matches (AJ KE - Detail date se filter) | live-data.json: ${liveFirst?liveFirst.series+' '+liveFirst.matchNumber+' '+(liveFirst.live.scoreText||'UPCOMING'):'none'}`);
  fs.writeFileSync('match-schedule.json', JSON.stringify({ updatedAt:new Date().toISOString(), total:allMatches.length, filter:'TODAY ONLY - '+ts.now.toDateString(), source:'https://crex.com/schedule', matches: allMatches }, null, 2));
  if(liveFirst) fs.writeFileSync('live-data.json', JSON.stringify(liveFirst, null, 2));
  fs.writeFileSync('players.json', JSON.stringify({ updatedAt:new Date().toISOString(), total:Object.keys(globalPlayersMap).length, playersMap: globalPlayersMap }, null, 2));
  console.log(`✅ DONE TODAY:`);
  allMatches.forEach((m,i)=> console.log(`   ${i+1}. ${m.live.isLive?'🔴 LIVE':'🟡 UPCOMING'} ${m.team1.code} vs ${m.team2.code} - ${m.series} ${m.matchNumber} - ${m.live.scoreText||'COUNTDOWN'} - ${m.date}`));
  console.log(`\n🧪 TEST:`);
  console.log(`   1. Scoreboard-BOSS-FINAL-CLEAN.html kholo - pehla LIVE dikhega`);
  console.log(`   2. Arrow Right/Left dabao - aj ke sare matches switch honge (LIVE + UPCOMING)`);
  console.log(`   3. UPCOMING pe COUNTDOWN + Playing XI dikhega, LIVE pe LIVE score + 4/6/OUT animation`);

  await browser.close();
}
runToday().catch(console.error);
