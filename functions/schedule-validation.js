"use strict";
const {randomUUID}=require("node:crypto");
function invalid(message){const error=new Error(message);error.status=400;throw error;}
function validateText(value,max){if(typeof value!=="string"||!value.trim()||value.trim().length>max)invalid("入力内容を確認してください。");return value.trim();}
function validateSlots(input){if(!Array.isArray(input)||input.length<1||input.length>30)invalid("候補は1〜30件追加してください。");const seen=new Set();return input.map(s=>{if(!s||typeof s.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.start>=s.end)invalid("日付と開始・終了時刻を確認してください。");const date=new Date(s.date+"T00:00:00Z");if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==s.date)invalid("日付が正しくありません。");const key=s.date+" "+s.start+" "+s.end;if(seen.has(key))invalid("同じ候補が重複しています。");seen.add(key);return {id:randomUUID(),date:s.date,start:s.start,end:s.end};});}
function profileForSchedule(id,data){if(data.disabled===true||data.active===false||data.scheduleAccess===false||typeof data.name!=="string"||!data.name.trim())return null;return {id,name:data.name.trim().slice(0,80),icon:typeof data.icon==="string"&&data.icon.startsWith("https://")?data.icon:""};}
module.exports={validateText,validateSlots,profileForSchedule};
