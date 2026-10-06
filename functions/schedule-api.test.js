"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const {validateSlots,profileForSchedule}=require("./schedule-validation");
const {sha256Base64Url}=require("./chat-auth");
const id="P".repeat(20),projectId="J".repeat(20),uid="Uline";
function harness(identity={uid,line:true,registered:true}){
 const store=new Map([[`users/${uid}`,{name:"LMC登録名",tel:"private"}],[`scheduleProjects/${projectId}`,{name:"バンド練習",ownerId:uid}],[`schedulePolls/${id}`,{title:"練習",project:"バンド練習",projectId,ownerId:uid,organizer:"LMC登録名",slots:[{id:"s1",date:"2026-10-08",start:"10:00",end:"11:00"}]}]]);
 const ref=path=>({path,get:async()=>snapshot(path),create:async value=>{store.set(path,value);},collection:name=>({doc:id=>ref(path+"/"+name+"/"+id)})});
 const snapshot=path=>{const data=store.get(path);return {exists:!!data,data:()=>data,get:key=>data?.[key]};};
 const db={doc:ref,runTransaction:async fn=>fn({get:r=>r.get(),delete:r=>store.delete(r.path),set:(r,v)=>store.set(r.path,v),update:(r,v)=>store.set(r.path,{...store.get(r.path),...v})})};
 const auth={verifyIdToken:async token=>{if(token!=="valid")throw new Error("invalid token");return identity;},createCustomToken:async uid=>"custom:"+uid};
 const context={exports:{},console,require:name=>{if(name==="firebase-functions/v2/https")return {onRequest:(_,fn)=>fn};if(name==="firebase-admin/auth")return {getAuth:()=>auth};if(name==="firebase-admin/firestore")return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>"timestamp"},Timestamp:{fromMillis:n=>({toMillis:()=>n})}};return require(name);}};
 vm.runInNewContext(fs.readFileSync(__dirname+"/schedule-api.js","utf8"),context);
 async function call(path,method="POST",body={},token="valid"){const result={status:200};const response={set:()=>{},status:n=>{result.status=n;return response;},json:b=>{result.body=b;},send:()=>{}};await context.exports.lmcScheduleApi({path,method,body,get:name=>name==="origin"?"https://erdaosataillang.github.io":name==="authorization"?`Bearer ${token}`:undefined},response);return result;}
 return {store,call};
}
test("候補は実在日付・終了が後・重複なしで1〜30件",()=>{assert.equal(validateSlots([{date:"2026-10-08",start:"10:15",end:"11:45"}])[0].start,"10:15");for(const input of [[],[{date:"2026-02-30",start:"10:00",end:"11:00"}],[{date:"2026-10-08",start:"11:00",end:"10:00"}],[{date:"2026-10-08",start:"10:00",end:"24:00"}]])assert.throws(()=>validateSlots(input));});
test("利用停止アカウントを拒否しプロフィールの個人情報を除外",()=>{assert.equal(profileForSchedule(uid,{name:"名前",disabled:true}),null);assert.deepEqual(Object.keys(profileForSchedule(uid,{name:"名前",tel:"secret"})),["id","name","icon"]);});
test("認証なし・未登録アカウントは操作できない",async()=>{assert.equal((await harness().call(`/polls/${id}`,"GET",{},"forged")).status,401);assert.equal((await harness({uid,line:true,registered:false}).call(`/polls/${id}`,"GET")).status,403);});
test("主催者以外は確定できない",async()=>{const h=harness();h.store.get(`schedulePolls/${id}`).ownerId="someone-else";assert.equal((await h.call(`/polls/${id}`,"PATCH",{slotId:"s1"})).status,403);assert.equal(h.store.get(`schedulePolls/${id}`).confirmed,undefined);});
test("回答者は入力値ではなくLMCのUIDと登録名を使用し更新できる",async()=>{const h=harness();assert.equal((await h.call(`/polls/${id}/answers`,"POST",{name:"偽名",uid:"attacker",choices:{s1:"yes"}})).status,200);assert.equal(h.store.get(`schedulePolls/${id}/answers/${uid}`).name,"LMC登録名");await h.call(`/polls/${id}/answers`,"POST",{choices:{s1:"no"}});assert.equal(h.store.get(`schedulePolls/${id}/answers/${uid}`).choices.s1,"no");});
test("未回答と確定後の回答を拒否",async()=>{const h=harness();assert.equal((await h.call(`/polls/${id}/answers`,"POST",{choices:{}})).status,400);h.store.get(`schedulePolls/${id}`).confirmed="s1";assert.equal((await h.call(`/polls/${id}/answers`,"POST",{choices:{s1:"yes"}})).status,409);});
test("PKCE認証コードは正しいverifierで一度だけ利用可能",async()=>{const h=harness(),code="one-time-code",verifier="a".repeat(48),redirectUri="https://erdaosataillang.github.io/lmc-schedule/";const key=`scheduleAuthorizationCodes/${sha256Base64Url(code)}`;h.store.set(key,{uid,redirectUri,expiresAt:{toMillis:()=>Date.now()+60000},codeChallenge:sha256Base64Url(verifier)});assert.equal((await h.call("/auth/exchange","POST",{code,codeVerifier:"b".repeat(48),redirectUri})).status,401);assert.equal(h.store.has(key),true);assert.equal((await h.call("/auth/exchange","POST",{code,codeVerifier:verifier,redirectUri})).status,200);assert.equal((await h.call("/auth/exchange","POST",{code,codeVerifier:verifier,redirectUri})).status,401);});
