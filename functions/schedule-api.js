"use strict";
const {onRequest}=require("firebase-functions/v2/https");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue,Timestamp}=require("firebase-admin/firestore");
const {randomBytes}=require("node:crypto");
const {safeEqual,sha256Base64Url,validPkceChallenge,validPkceVerifier}=require("./chat-auth");
const {validateSlots,validateText,profileForSchedule,validateDateRange,validateAvailability}=require("./schedule-validation");
const REDIRECT="https://erdaosataillang.github.io/lmc-schedule/";
const LMC="https://lmc-mobile.sorairosystem.com";
const allowed=new Set([LMC,"https://erdaosataillang.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
function deny(status,message){const e=new Error(message);e.status=status;throw e;}
async function identity(request){const token=(request.get("authorization")||"").replace(/^Bearer\s+/i,"");let user;try{user=await getAuth().verifyIdToken(token,true);}catch{deny(401,"LMCアカウントでログインしてください。");}if(user.line!==true||user.registered!==true)deny(403,"LMCの登録アカウントが必要です。");const snapshot=await getFirestore().doc(`users/${user.uid}`).get();const profile=snapshot.exists?profileForSchedule(user.uid,snapshot.data()):null;if(!profile)deny(403,"このLMCアカウントは利用できません。");return profile;}
async function poll(ref,transaction){const snap=transaction?await transaction.get(ref):await ref.get();if(!snap.exists)deny(404,"日程調整が見つかりません。リンクを確認してください。");return snap.data();}
function publicPoll(id,p){return {id,title:p.title,project:p.project,projectId:p.projectId,organizer:p.organizer,ownerId:p.ownerId,slots:p.slots||[],...(p.mode==="availability"?{mode:p.mode,dateFrom:p.dateFrom,dateTo:p.dateTo}:{}),...(p.confirmed?{confirmed:p.confirmed}:{}),...(p.confirmedSlot?{confirmedSlot:p.confirmedSlot}:{})};}
exports.lmcScheduleApi=onRequest({region:"asia-northeast1",memory:"256MiB",timeoutSeconds:30,maxInstances:10},async(request,response)=>{
 const origin=request.get("origin");if(origin&&allowed.has(origin)){response.set("Access-Control-Allow-Origin",origin);response.set("Vary","Origin");}
 response.set("Access-Control-Allow-Headers","Content-Type, Authorization");response.set("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS");response.set("Cache-Control","no-store");
 if(request.method==="OPTIONS"){response.status(allowed.has(origin)?204:403).send("");return;}if(origin&&!allowed.has(origin)){response.status(403).json({error:"許可されていない接続元です。"});return;}
 const db=getFirestore();const body=request.body||{};
 try{
 if(request.path==="/auth/code"&&request.method==="POST"){
 if(origin!==LMC||body.clientId!=="lmc-schedule"||body.redirectUri!==REDIRECT||body.codeChallengeMethod!=="S256"||!validPkceChallenge(body.codeChallenge))deny(400,"ログイン要求が正しくありません。");
 const user=await identity(request);const code=randomBytes(32).toString("base64url");await db.doc(`scheduleAuthorizationCodes/${sha256Base64Url(code)}`).create({uid:user.id,codeChallenge:body.codeChallenge,redirectUri:REDIRECT,expiresAt:Timestamp.fromMillis(Date.now()+60000)});response.json({code});return;
 }
 if(request.path==="/auth/exchange"&&request.method==="POST"){
 if(typeof body.code!=="string"||body.code.length>128||body.redirectUri!==REDIRECT||!validPkceVerifier(body.codeVerifier))deny(400,"ログイン情報が正しくありません。");const ref=db.doc(`scheduleAuthorizationCodes/${sha256Base64Url(body.code)}`);const uid=await db.runTransaction(async t=>{const snap=await t.get(ref);if(!snap.exists||snap.get("redirectUri")!==REDIRECT||!snap.get("expiresAt")||snap.get("expiresAt").toMillis()<Date.now()||!safeEqual(sha256Base64Url(body.codeVerifier),snap.get("codeChallenge")))deny(401,"ログインの有効期限が切れました。もう一度ログインしてください。");t.delete(ref);return snap.get("uid");});const profile=await db.doc(`users/${uid}`).get();if(!profile.exists||!profileForSchedule(uid,profile.data()))deny(403,"利用可能なLMCアカウントがありません。");response.json({customToken:await getAuth().createCustomToken(uid,{line:true,registered:true})});return;
 }
 const user=await identity(request);
 if(request.path==="/bootstrap"&&request.method==="GET"){
 const [projects,polls]=await Promise.all([db.collection("scheduleProjects").where("ownerId","==",user.id).limit(100).get(),db.collection("schedulePolls").where("ownerId","==",user.id).limit(100).get()]);response.json({profile:user,projects:projects.docs.map(d=>({id:d.id,name:d.get("name")})),polls:polls.docs.map(d=>publicPoll(d.id,d.data()))});return;
 }
 if(request.path==="/projects"&&request.method==="POST"){
 const name=validateText(body.name,80);const ref=db.collection("scheduleProjects").doc();await ref.create({name,ownerId:user.id,createdAt:FieldValue.serverTimestamp()});response.status(201).json({project:{id:ref.id,name}});return;
 }
 if(request.path==="/polls"&&request.method==="POST"){
 const title=validateText(body.title,120);const availabilityMode=body.mode==="availability";const schedule=availabilityMode?{mode:"availability",...validateDateRange(body.dateFrom,body.dateTo),slots:[]}:{slots:validateSlots(body.slots)};if(typeof body.projectId!=="string"||!/^[A-Za-z0-9]{20}$/.test(body.projectId))deny(400,"プロジェクトを選択してください。");const project=await db.doc(`scheduleProjects/${body.projectId}`).get();if(!project.exists||project.get("ownerId")!==user.id)deny(403,"このプロジェクトに日程調整を作成できません。");const ref=db.collection("schedulePolls").doc();const data={title,...schedule,projectId:project.id,project:project.get("name"),organizer:user.name,ownerId:user.id,createdAt:FieldValue.serverTimestamp()};await ref.create(data);response.status(201).json({poll:publicPoll(ref.id,data)});return;
 }
 const match=request.path.match(/^\/polls\/([A-Za-z0-9]{20})(\/answers)?$/);
 if(match){const ref=db.doc(`schedulePolls/${match[1]}`);
 if(request.method==="GET"&&!match[2]){const p=await poll(ref);const rows=await ref.collection("answers").get();response.json({poll:publicPoll(ref.id,p),answers:rows.docs.map(d=>({uid:d.id,name:d.get("name"),choices:d.get("choices")||{},...(p.mode==="availability"?{availability:d.get("availability")||[],unavailable:d.get("unavailable")===true}:{})}))});return;}
 if(request.method==="POST"&&match[2]){await db.runTransaction(async t=>{const p=await poll(ref,t);if(p.confirmed||p.confirmedSlot)deny(409,"日程が確定しているため回答を変更できません。");if(p.mode==="availability"){const availability=validateAvailability(body.availability,p);if((!availability.length&&body.unavailable!==true)||(availability.length&&body.unavailable===true))deny(400,"参加できる時間帯を追加するか、参加できる時間帯なしを選択してください。");t.set(ref.collection("answers").doc(user.id),{name:user.name,availability,unavailable:body.unavailable===true,updatedAt:FieldValue.serverTimestamp()});return;}if(!body.choices||typeof body.choices!=="object"||!p.slots.every(s=>["yes","maybe","no"].includes(body.choices[s.id])))deny(400,"すべての候補に回答してください。");const choices=Object.fromEntries(p.slots.map(s=>[s.id,body.choices[s.id]]));t.set(ref.collection("answers").doc(user.id),{name:user.name,choices,updatedAt:FieldValue.serverTimestamp()});});response.json({ok:true});return;}
 if(request.method==="PATCH"&&!match[2]){let result;await db.runTransaction(async t=>{const p=await poll(ref,t);if(p.ownerId!==user.id)deny(403,"日程の確定は主催者のみ操作できます。");if(p.confirmed||p.confirmedSlot)deny(409,"この日程はすでに確定しています。");if(p.mode==="availability"){const confirmed=validateAvailability([body.slot],p)[0];t.update(ref,{confirmedSlot:confirmed});result={...p,confirmedSlot:confirmed};return;}if(!p.slots.some(s=>s.id===body.slotId))deny(400,"有効な候補を選択してください。");t.update(ref,{confirmed:body.slotId});result={...p,confirmed:body.slotId};});response.json({poll:publicPoll(ref.id,result)});return;}
 }
 deny(404,"操作が見つかりません。");
 }catch(error){if(error.status){response.status(error.status).json({error:error.message});}else{console.error("Schedule request failed",{code:error.code});response.status(503).json({error:"接続に失敗しました。入力を残したまま、もう一度お試しください。"});}}
});
