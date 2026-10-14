/**
 * 계산중이쥐 — shared guild roster API (Google Apps Script).
 * Only the roster and scoring bonuses are shared; battle calculations remain on each device.
 * Deploy as Web App, Execute as: Me, Who has access: Anyone.
 * All requests use POST and require a long secret key in the HTTPS request body.
 */
'use strict';

var APP_SHEET = 'Members';
var APP_META = 'Meta';
var MAX_MEMBERS = 200;
var FIELDS = ['id','name','bonus','minScore','pirate','cat','wolf','food','profileRevision','group','zone1Bonus','zone2Bonus'];

/** Run ONCE manually from the Apps Script editor; change both placeholder secrets first.
 *  Secrets must be distinct and 20+ characters, preferably randomly generated.
 *  Run before deployment. No URLs/secrets are placed in this project's source.
 */
function setupServer() {
  var readKey = 'REPLACE_WITH_A_RANDOM_READ_SECRET_AT_LEAST_20_CHARACTERS';
  var editKey = 'REPLACE_WITH_A_DIFFERENT_RANDOM_EDIT_SECRET_AT_LEAST_20_CHARACTERS';
  if (/^REPLACE_/.test(readKey) || /^REPLACE_/.test(editKey)) throw new Error('First replace both example keys inside setupServer().');
  if (readKey.length < 20 || editKey.length < 20 || readKey === editKey) throw new Error('Use distinct keys, each at least 20 characters.');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SPREADSHEET_ID')) throw new Error('Already initialized; do not overwrite an existing roster.');
  var book = SpreadsheetApp.create('계산중이쥐 공용 길드원 데이터');
  var sheet = book.getSheets()[0];
  sheet.setName(APP_SHEET);
  sheet.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS]);
  // Begin with an empty roster. Admins add members from the PWA.
  sheet.setFrozenRows(1);
  var meta = book.insertSheet(APP_META);
  meta.getRange('A1:B2').setValues([['key','value'],['revision',1]]);
  var salt = Utilities.getUuid();
  props.setProperties({SPREADSHEET_ID:book.getId(),SALT:salt,READ_HASH:digest(salt + ':read:' + readKey),EDIT_HASH:digest(salt + ':edit:' + editKey)},false);
  Logger.log('Created shared spreadsheet: ' + book.getUrl());
}
function newMemberId() { return 'm' + Utilities.getUuid().replace(/-/g,'').toLowerCase(); }
function digest(raw) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+(b & 255).toString(16)).slice(-2);}).join('');
}
function equalsConstantTime(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var n = Math.max(a.length,b.length), diff = a.length ^ b.length;
  for(var i=0;i<n;i++) diff |= (a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function checkAuth(token, requireEdit) {
  var props=PropertiesService.getScriptProperties(),salt=props.getProperty('SALT');
  if (!salt || typeof token!=='string' || token.length<20 || token.length>256) return false;
  var edit=equalsConstantTime(digest(salt+':edit:'+token),props.getProperty('EDIT_HASH'));
  if(requireEdit) return edit;
  return edit || equalsConstantTime(digest(salt+':read:'+token),props.getProperty('READ_HASH'));
}
function response(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function fail(code,message) { return response({ok:false,error:code,message:message}); }
function doGet() {return fail('USE_POST','Use the app: authenticated POST requests only.');}
function doPost(e) {
  try {
    var raw = (e&&e.postData&&e.postData.contents)||'';
    if(raw.length>16000) return fail('TOO_LARGE','Request too large.');
    var req=JSON.parse(raw);
    if(!req || typeof req!=='object' || !['read','mutate'].includes(req.action)) return fail('BAD_ACTION','Unsupported action.');
    if(!checkAuth(req.key,req.action==='mutate')) return fail('UNAUTHORIZED','Invalid read/edit key.');
    var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if(!id) return fail('NOT_READY','Run setupServer first.');
    // Lock both reads and writes so clients cannot observe half-written revisions.
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(15000)) return fail('BUSY','Another edit is in progress. Retry.');
    try { return response(req.action==='read' ? getSnapshot(id) : mutate(id,req.operation)); }
    finally { lock.releaseLock(); }
  } catch(err) { return fail('SERVER_ERROR', String(err&&err.message||err).slice(0,200)); }
}
function asMember(row) {
  return {id:String(row[0]),name:String(row[1]),bonus:Number(row[2])||0,minScore:Number(row[3])||0,
    region:{pirate:Number(row[4])||0,cat:Number(row[5])||0,wolf:Number(row[6])||0,food:Number(row[7])||0},
    profileRevision:Number(row[8])||1,group:[1,2,3,4].indexOf(Number(row[9]))>=0?Number(row[9]):0,
    zone1Bonus:Number(row[10])||0,zone2Bonus:Number(row[11])||0};
}
function sheetData(id) {
  var book=SpreadsheetApp.openById(id),sheet=book.getSheetByName(APP_SHEET),meta=book.getSheetByName(APP_META);
  if(!sheet||!meta) throw new Error('Shared spreadsheet tabs are missing.');
  var last=sheet.getLastRow(),rows=last>1?sheet.getRange(2,1,last-1,FIELDS.length).getValues():[];
  return {sheet:sheet,meta:meta,rows:rows,revision:Number(meta.getRange('B2').getValue())||1};
}
function snapshot(data) {
  return {ok:true,schema:1,revision:data.revision,members:data.rows.map(asMember),updatedAt:new Date().toISOString()};
}
function getSnapshot(id) { return snapshot(sheetData(id)); }
function bad(code,message,data) {return {ok:false,error:code,message:message,revision:data.revision};}
function cleanName(value) {
  if(typeof value!=='string')throw new Error('Name must be a string.');
  var name=value.trim();
  if(!name || name.length>30 || /[\u0000-\u001f]/.test(name) || /^[=+\-@]/.test(name))throw new Error('Invalid name (do not start with spreadsheet formula characters).');
  return name;
}
function cleanNumber(value,max) {
  if(typeof value!=='number' || !isFinite(value) || value<0 || value>max) throw new Error('Invalid numeric value.');
  return value;
}
function cleanGroup(v) {
  if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>4)throw new Error('Group must be an integer from 0 to 4.');
  return v;
}

/** Optional one-time migration for a sheet initialized before the group field existed. */
function migrateRosterGroupColumn() {
  var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id)throw new Error('Run setupServer first.');
  var sheet=SpreadsheetApp.openById(id).getSheetByName(APP_SHEET);
  if(!sheet)throw new Error('Missing Members sheet.');
  if(sheet.getRange(1,10).getValue()!=='group')sheet.getRange(1,10).setValue('group');
  var last=sheet.getLastRow();
  if(last>1){var range=sheet.getRange(2,10,last-1,1);var values=range.getValues().map(function(r){return [cleanGroupOrZero(r[0])];});range.setValues(values);}
  Logger.log('Group column ready.');
}
/** Existing server upgrade: adds the two independent zone bonus columns without deleting members. Run once after updating Code.gs. */
function migrateRosterZoneBonusColumns() {
  var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id)throw new Error('Run setupServer first.');
  var sheet=SpreadsheetApp.openById(id).getSheetByName(APP_SHEET);
  if(!sheet)throw new Error('Missing Members sheet.');
  var headers=sheet.getRange(1,11,1,2).getValues()[0];
  if(headers[0] && headers[0]!=='zone1Bonus')throw new Error('Column K is already used; check it before migration.');
  if(headers[1] && headers[1]!=='zone2Bonus')throw new Error('Column L is already used; check it before migration.');
  sheet.getRange(1,11,1,2).setValues([['zone1Bonus','zone2Bonus']]);
  var last=sheet.getLastRow();
  if(last>1){
    var range=sheet.getRange(2,11,last-1,2);
    var values=range.getValues().map(function(r){return [cleanLegacyBonus(r[0]),cleanLegacyBonus(r[1])];});
    range.setValues(values);
  }
  SpreadsheetApp.flush();
  Logger.log('Zone bonus columns ready.');
}
function cleanLegacyBonus(value){var n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1000000?n:0;}

function cleanGroupOrZero(v) {return [1,2,3,4].indexOf(Number(v))>=0?Number(v):0;}

function uniqueName(rows,name,exceptId) {
  return !rows.some(function(row){return String(row[0])!==exceptId&&String(row[1]).toLocaleLowerCase()===name.toLocaleLowerCase();});
}
function mutate(id,op) {
  var data=sheetData(id);
  if(!op||typeof op!=='object')return bad('BAD_OPERATION','Operation missing.',data);
  var action=op.type;
  if(action==='add') {
    if(data.rows.length>=MAX_MEMBERS)return bad('LIMIT','Maximum 200 members.',data);
    var name=cleanName(op.name);
    if(!uniqueName(data.rows,name,''))return bad('DUPLICATE','A member with this name already exists.',data);
    var bonus=cleanNumber(op.bonus,1000000);
    var group=cleanGroup(op.group == null ? 0 : op.group);
    var zone1Bonus=cleanNumber(op.zone1Bonus == null ? 0 : op.zone1Bonus,1000000);
    var zone2Bonus=cleanNumber(op.zone2Bonus == null ? 0 : op.zone2Bonus,1000000);
    data.sheet.appendRow([newMemberId(),name,bonus,0,0,0,0,0,1,group,zone1Bonus,zone2Bonus]);
  } else if (action==='update'||action==='delete') {
    if(typeof op.id!=='string')return bad('BAD_ID','Invalid member ID.',data);
    var index=data.rows.findIndex(function(row){return String(row[0])===op.id;});
    if(index<0)return bad('NOT_FOUND','Member no longer exists.',data);
    var row=data.rows[index];
    if(!Number.isInteger(op.expectedRevision)||op.expectedRevision!==Number(row[8]))
      return bad('CONFLICT','Member was edited by someone else. Refresh and retry.',data);
    if(action==='delete') {
      data.sheet.deleteRow(index+2);
    } else {
      var field=op.field;
      var col={name:1,bonus:2,minScore:3,pirate:4,cat:5,wolf:6,food:7,group:9,zone1Bonus:10,zone2Bonus:11}[field];
      if(typeof col!=='number')return bad('BAD_FIELD','Field not editable.',data);
      var value=field==='name'?cleanName(op.value):field==='group'?cleanGroup(op.value):cleanNumber(op.value,field==='minScore'?1000000000:1000000);
      if(field==='name'&&!uniqueName(data.rows,value,op.id))return bad('DUPLICATE','A member with this name already exists.',data);
      data.sheet.getRange(index+2,col+1).setValue(value);
      data.sheet.getRange(index+2,9).setValue(Number(row[8])+1);
    }
  } else return bad('BAD_OPERATION','Unknown operation.',data);
  data.revision++;
  data.meta.getRange('B2').setValue(data.revision);
  SpreadsheetApp.flush();
  return getSnapshot(id);
}
