const { app, BrowserWindow } = require('electron');
const fs=require('fs'); const path=require('path');
const ROOT='/home/agentuser/pr-work/bhands-fork';
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu'); app.commandLine.appendSwitch('in-process-gpu');
// 预设列表：0-5 原 shader + 6 安魂 + 7/8 音域回响 + 9-17 新预设
const PRESETS=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];
const SIZES=[[1920,1080],[1280,800]];
app.whenReady().then(async () => {
  const out=[];
  for (const [w,h] of SIZES) {
    const win = new BrowserWindow({ width:w, height:h, show:false, webPreferences:{ sandbox:false, nodeIntegration:false, contextIsolation:false, offscreen:true }});
    for (let tries=0;tries<4;tries++){
      try { await win.loadURL('file://' + path.join(ROOT,'public','index.html')); break; }
      catch(e){ await new Promise(r=>setTimeout(r,3000)); if(tries===3) console.error('LOADFAIL', w); }
    }
    await new Promise(r=>setTimeout(r,9000));
    await win.webContents.executeJavaScript(`(document.querySelector('.splash-enter')||document.getElementById('splash')).click(),1`).catch(()=>{});
    await new Promise(r=>setTimeout(r,2000));
    for (const p of PRESETS) {
      const issues = await win.webContents.executeJavaScript(`(async () => {
        const fx = window.fxState||window.FX||null;
        // 尝试切换预设
        try { setPreset(${p},{instant:true}); } catch(e){ res.err=String(e).slice(0,60); }
        await new Promise(r=>setTimeout(r,1500));
        const res = { preset:${p}, viewport:[innerWidth,innerHeight], issues:[] };
        // 溢出元素
        const ov=[...document.querySelectorAll('body *')].filter(el=>{
          if(el.closest('#splash')) return false;
          const b=el.getBoundingClientRect(); const cs=getComputedStyle(el);
          return b.width>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&(b.right>innerWidth+6||b.left<-6||b.bottom>innerHeight+6||b.top<-6);
        });
        res.issues.push(...ov.slice(0,6).map(el=>({t:'overflow',sel:(el.id?'#'+el.id:'')+'.'+String(el.className).slice(0,30),r:[Math.round(el.getBoundingClientRect().left),Math.round(el.getBoundingClientRect().top),Math.round(el.getBoundingClientRect().right),Math.round(el.getBoundingClientRect().bottom)]})));
        // 文字截断
        const ct=[...document.querySelectorAll('div,span,p,h1,h2,h3,h4,button,a,label')].filter(el=>{
          const cs=getComputedStyle(el);
          return cs.overflow==='hidden'&&el.scrollHeight>el.clientHeight+3&&el.clientHeight>0&&el.textContent.trim();
        });
        res.issues.push(...ct.slice(0,6).map(el=>({t:'clipped-text',sel:(el.id?'#'+el.id:'')+'.'+String(el.className).slice(0,30),text:el.textContent.trim().slice(0,20),sh:el.scrollHeight,ch:el.clientHeight})));
        // 叠压检测：文本节点互相重叠
        const texts=[...document.querySelectorAll('h1,h2,h3,h4,.song-title,.lyric-line,p')].map(el=>({el,b:el.getBoundingClientRect()})).filter(x=>x.b.width>0&&x.b.height>0);
        for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
          const a=texts[i].b,c=texts[j].b;
          const ox=Math.min(a.right,c.right)-Math.max(a.left,c.left), oy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
          if(ox>20&&oy>6) res.issues.push({t:'overlap',a:$(texts[i].el).slice(0,40),b:$(texts[j].el).slice(0,40)});
        }
        function $(el){return (el.id?'#'+el.id:'')+'.'+String(el.className).slice(0,35)+'|'+el.textContent.trim().slice(0,15)}
        res.issues=res.issues.slice(0,12);
        return res;
      })()`).catch(e=>({preset:p,err:e.message.slice(0,80)}));
      out.push(issues);
      const img=await win.webContents.capturePage();
      fs.writeFileSync('/tmp/audit-p'+p+'-'+w+'.png', img.toPNG());
    }
    win.destroy();
  }
  fs.writeFileSync('/tmp/audit-full.json', JSON.stringify(out,null,1));
  console.log('DONE', out.length);
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
