import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../..', import.meta.url));
const html = `<!doctype html><html><body><div id="root"></div><script type="module">
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import '/src/index.css';
window.qaRequests=[];window.qaOffset=0;window.qaFail=false;window.qaScope=null;
window.qaTouches=0;window.qaCallbacks=[];window.qaHold=false;window.qaRelease=null;
const realNow=Date.now;Date.now=()=>realNow()+qaOffset;
const mode=new URLSearchParams(location.search).get('mode');
window.qaExpires=Date.now()+(mode==='expired'?-1:2*60*60*1000);
window.fetch=async(url)=>{
 const path=new URL(url,location.origin).pathname;qaRequests.push(path);
 let data=[];let status=200;
 if(path.endsWith('/rpc/session_status') || path.endsWith('/rpc/touch_session')){
  if(qaHold)await new Promise(resolve=>{qaRelease=resolve});
  if(qaFail){status=500;data={message:'Offline test'};}
  else{
   const state=Date.now()>=qaExpires?'expired':'active';
   if(path.endsWith('/touch_session')&&state==='active'){qaTouches++;qaExpires=Date.now()+2*60*60*1000;}
   data={state,expires_at:new Date(qaExpires).toISOString(),server_time:new Date(Date.now()).toISOString()};
  }
 }else if(path.endsWith('/rpc/end_session')){data=null;}
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}});
};
const {supabase}=await import('/src/lib/supabaseClient.js');
const makeSession=aal=>({access_token:'test.'+btoa(JSON.stringify({aal,session_id:'00000000-0000-0000-0000-000000000003',app_metadata:{app_role:'WRITER'}}))+'.test',user:{id:'00000000-0000-0000-0000-000000000002',email:'test@example.test'}});
let session=makeSession(mode==='mfa'?'aal1':'aal2');
supabase.auth.getSession=async()=>({data:{session},error:mode.startsWith('auth-error')?new Error('Session check failed'):null});
supabase.auth.onAuthStateChange=cb=>{qaCallbacks.push(cb);return {data:{subscription:{unsubscribe(){qaCallbacks=qaCallbacks.filter(value=>value!==cb)}}}}};
supabase.auth.mfa.listFactors=async()=>({data:{totp:[{id:'working',status:'verified'}],all:[]},error:null});
supabase.auth.mfa.challengeAndVerify=async()=>{session=makeSession('aal2');qaCallbacks.forEach(cb=>cb('MFA_CHALLENGE_VERIFIED',session));return {data:{},error:null}};
supabase.auth.signOut=async options=>{qaScope=options?.scope;if(mode.includes('signout-failure'))return {error:new Error('Offline')};session=null;qaCallbacks.forEach(cb=>cb('SIGNED_OUT',null));return {error:null}};
const {default:App}=await import('/src/App.tsx');
createRoot(document.getElementById('root')).render(React.createElement(StrictMode,{},React.createElement(App)));
</script></body></html>`;
const server=await createServer({root,envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://idle-test.supabase.co'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-key')},server:{host:'127.0.0.1',port:5189,ws:false},plugins:[{name:'loading-qa',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url.startsWith('/__idle-qa')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));}else next();});}}]});
let chrome, socket;
const errors=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 await server.listen();
 chrome=spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=9246','--user-data-dir='+mkdtempSync('/private/tmp/idle-chrome-'),'about:blank'],{stdio:'ignore'});
 let targets;
 for(let i=0;i<60;i++){try{targets=await(await fetch('http://127.0.0.1:9246/json')).json();break;}catch{await delay(100);}}
 assert.ok(targets,'Chrome did not start');
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(resolve=>socket.onopen=resolve);
 let nextId=0;const pending=new Map();
 socket.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const cb=pending.get(msg.id);pending.delete(msg.id);if(msg.error)cb.reject(msg.error);else cb.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description??msg.params.exceptionDetails.text);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate('Boolean('+expression+')'))return;await delay(30);}throw Error('Timed out '+expression+' '+JSON.stringify(errors));};
 await cdp('Runtime.enable');await cdp('Page.enable');
 const navigate=async mode=>{await cdp('Page.navigate',{url:'http://127.0.0.1:5189/__idle-qa?mode='+mode});};
 const click=label=>evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==="+JSON.stringify(label)+").click()");
 // Initial Auth check errors sign out; a failed sign-out stays locked without Retry.
 await navigate('auth-error');
 await until("document.querySelector('#sign-in-email')");
 assert.equal(await evaluate('qaScope'),'local');
 assert.equal(await evaluate('qaRequests.length'),0);
 await navigate('auth-error-signout-failure');
 await until("document.querySelector('.status-card h1')?.textContent==='We could not check your session'");
 assert.equal(await evaluate("[...document.querySelector('.status-card').querySelectorAll('button')].map(b=>b.textContent.trim()).join(',')"),'Sign out');
 assert.equal(await evaluate('qaRequests.length'),0);
 await navigate('mfa');await until("document.querySelector('#mfa-code') && !document.querySelector('.LoadingDialog')?.open");
 assert.equal(await evaluate('qaRequests.length'),0,'AAL1 must not run idle or app RPCs');
 await until("document.activeElement===document.querySelector('#mfa-code')");
 for (const text of '012345') await cdp('Input.insertText',{text});
 await until("document.querySelector('.dashboard-layout') && !document.querySelector('.LoadingDialog')?.open");
 assert.equal(await evaluate('qaTouches'),0,'Restoring a verified session does not renew it');
 // Real browser interaction touches the server; background data reads do not.
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
 await until('qaTouches===1');
 // Test warning and explicit continuation without waiting two real hours.
 await evaluate('qaOffset+=2*60*60*1000-55000');
 await until("document.querySelector('[data-idle-warning]')?.open");
 // Backdrop starts translucent and becomes opaque by ten seconds remaining.
 await until("getComputedStyle(document.querySelector('[data-idle-warning]'),'::backdrop').backgroundColor.startsWith('rgba(')");
 await evaluate('qaOffset+=45000');
 await until("getComputedStyle(document.querySelector('[data-idle-warning]'),'::backdrop').backgroundColor==='rgb(0, 0, 0)'");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-idle-warning]'),'::backdrop').backdropFilter"),'blur(12px)');
 await click('Stay signed in');
 await until("!document.querySelector('[data-idle-warning]')");
 assert.equal(await evaluate('qaTouches'),2);
 // Another tab's storage notification rechecks server state without renewal.
 await evaluate('qaOffset+=2*60*60*1000-55000');
 await until("document.querySelector('[data-idle-warning]')?.open");
 await evaluate(`qaExpires=Date.now()+2*60*60*1000;
   const frame=document.createElement('iframe');document.body.append(frame);
   frame.contentWindow.eval("localStorage.setItem('elmodelo:session-activity:00000000-0000-0000-0000-000000000003','other-tab')");`);
 await until("!document.querySelector('[data-idle-warning]')");
 assert.equal(await evaluate('qaTouches'),2,'Other-tab notification cannot extend server time');
 // No data appears while checking on resume; an existing dashboard is retained.
 await evaluate("qaHold=true;window.dispatchEvent(new Event('focus'))");
 await until("qaRelease!==null && document.querySelector('.dashboard-layout')?.style.visibility==='hidden'");
 await evaluate('qaHold=false;qaRelease();qaRelease=null');
 await until("document.querySelector('.dashboard-layout')?.style.visibility!== 'hidden' && !document.querySelector('.LoadingDialog')?.open");
 assert.equal(await evaluate('qaTouches'),2,'Focus/status checks must not renew idle time');
 // Network failure signs out locally without offering a session-check retry.
 await evaluate("qaFail=true;window.dispatchEvent(new Event('focus'))");
 await until("document.querySelector('#sign-in-email')");
 assert.equal(await evaluate("document.querySelector('.dashboard-layout')"),null);
 assert.equal(await evaluate('qaScope'),'local');
 assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Try again')"),false);
 await navigate('active');
 await until("document.querySelector('.dashboard-layout') && !document.querySelector('.LoadingDialog')?.open");
 // Sleeping beyond the limit locks the UI and signs out only this session.
 await evaluate("qaOffset+=2*60*60*1000+1000;window.dispatchEvent(new Event('focus'))");
 await until("document.querySelector('#sign-in-email')");
 assert.equal(await evaluate('qaScope'),'local');
 assert.ok(await evaluate("qaRequests.some(path=>path.endsWith('/rpc/end_session'))"));
 // A stale session on initial app startup must not fetch preferences or finance.
 await navigate('expired');
 await until("document.querySelector('#sign-in-email')");
 assert.ok(await evaluate("qaRequests.every(path=>path.includes('/rpc/session_status')||path.includes('/rpc/end_session'))"),'Expired startup must not fetch app data');
 // Failed network sign-out must leave the expired app locked.
 await navigate('signout-failure');
 await until("document.querySelector('.dashboard-layout') && !document.querySelector('.LoadingDialog')?.open");
 await evaluate("qaFail=true;window.dispatchEvent(new Event('focus'))");
 await until("document.querySelector('.status-card')?.textContent.includes('Could not verify your session')");
 assert.equal(await evaluate("[...document.querySelector('.status-card').querySelectorAll('button')].map(b=>b.textContent.trim()).join(',')"),'Sign out');
 await evaluate("qaFail=false;window.dispatchEvent(new Event('focus'))");
 assert.equal(await evaluate("document.querySelector('.dashboard-layout')"),null);
 await navigate('signout-failure');
 await until("document.querySelector('.dashboard-layout') && !document.querySelector('.LoadingDialog')?.open");
 await evaluate("qaOffset+=2*60*60*1000+1000;window.dispatchEvent(new Event('focus'))");
 await until("document.querySelector('.status-card h1')?.textContent==='Session expired'");
 assert.equal(await evaluate("document.querySelector('.dashboard-layout')"),null);
 assert.deepEqual(errors,[]);
 console.log('Idle browser checks passed: MFA boundary, activity, warning/continue, resume gate, failure/sign-out, sleep/expiry, local sign-out.');
} finally {socket?.close();chrome?.kill();await server.close();}
