/**
 * WebEditor.tsx
 *
 * WebView-based rich text editor (contenteditable).
 * Handles formatting via document.execCommand, undo/redo history,
 * insert helpers, and messages back to React Native.
 */

import { getWebViewFontInjectionScript } from "@/services/editorFontService";
import type { EditorWebViewMessage } from "@/src/types/editor.types";
import React, { useCallback, useEffect, useRef } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useDocument } from "./DocumentContext";

// ── Editor HTML ────────────────────────────────────────────────────────────
/* ─────────────────────────────────────────────────────────────────────────────
   THE CORE FIX (ported from /lower/WebEditor.js):
   When a user taps a toolbar button in React Native, the WebView loses focus
   and the browser drops the text selection. That's why NOTHING was working —
   execCommand() requires an active selection/focus.

   Fix: We save the selection range on every cursor move, then RESTORE it
   inside the WebView before applying any format command.
   ───────────────────────────────────────────────────────────────────────── */

const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<!-- Bundled fonts are injected dynamically via injectJavaScript after load -->
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}

html{height:100%;direction:ltr;}
body{background:#fff;padding:0;min-height:100%;margin:0;direction:ltr;}

#page{
  background:#fff;width:100%;min-height:100vh;
  margin:0;padding:10px 12px 120px;
  border:none;box-shadow:none;border-radius:0;
  direction:ltr;text-align:left;
}

#editor{
  outline:none;min-height:80vh;
  font-size:11pt;font-family:'Inter',sans-serif;
  color:#000;line-height:1.15;word-wrap:break-word;
  caret-color:#1976D2;
  direction:ltr;text-align:left;unicode-bidi:normal;
}
#editor:empty::before{
  content:attr(data-placeholder);color:#BDBDBD;
  pointer-events:none;font-style:italic;
}
div[contenteditable]{outline:none;}

.doc-image,.inserted-image{max-width:100%;height:auto;display:block;margin:8px auto;cursor:pointer;position:relative;}
.doc-image.selected,.inserted-image.selected{outline:2px solid #1976D2;}
.img-resize-wrap{position:relative;display:inline-block;max-width:100%;margin:8px auto;}
.img-resize-wrap.selected{outline:2px solid #1976D2;}
.img-resize-handle{
  position:absolute;width:12px;height:12px;background:#1976D2;border:2px solid #fff;
  border-radius:2px;z-index:10;cursor:nwse-resize;touch-action:none;
}
.img-resize-handle.br{bottom:-6px;right:-6px;}
.img-resize-handle.bl{bottom:-6px;left:-6px;cursor:nesw-resize;}
.img-resize-handle.tr{top:-6px;right:-6px;cursor:nesw-resize;}
.img-resize-handle.tl{top:-6px;left:-6px;cursor:nwse-resize;}
.doc-shape,.shape-container{display:block;margin:8px 0;cursor:pointer;user-select:none;}
.doc-shape.selected svg *,.shape-container.selected svg *{stroke:#1976D2 !important;}
.doc-textbox,.text-box{
  display:inline-block;border:1px solid #9E9E9E;
  min-width:140px;min-height:44px;padding:8px 10px;margin:6px 2px;
  font-size:11pt;font-family:'Inter',sans-serif;
}
.doc-signature,.signature-img{display:block;margin:8px 0;max-width:260px;}
.doc-comment,.comment-mark{background:rgba(255,235,59,0.35);border-bottom:2px solid #FBC02D;cursor:help;}
.doc-bookmark,.bookmark-mark{color:#1976D2;font-size:13px;cursor:pointer;user-select:none;margin-right:2px;}
.doc-hyperlink,.hyperlink{color:#1565C0;text-decoration:underline;cursor:pointer;}
.doc-attachment{
  display:inline-flex;align-items:center;gap:8px;
  padding:6px 14px;background:#F5F5F5;border:1px solid #E0E0E0;
  border-radius:6px;margin:4px 0;cursor:default;user-select:none;
  font-family:'Inter',sans-serif;font-size:11pt;
}

/* ── Table styles ───────────────────────────────────── */
.editor-table{
  width:100%;border-collapse:collapse;margin:12px 0;
  table-layout:auto;font-size:11pt;font-family:'Inter',sans-serif;
}
.editor-table td{
  border:1px solid #BDBDBD;padding:6px 8px;min-width:40px;
  min-height:28px;vertical-align:top;word-wrap:break-word;
  outline:none;
}
.editor-table td:focus{
  outline:2px solid #1976D2;outline-offset:-2px;
  background:rgba(25,118,210,0.04);
}
.editor-table tr:first-child td{
  background:#F5F5F5;font-weight:600;
}
.table-wrapper{position:relative;margin:12px 0;overflow-x:auto;}
.table-toolbar{
  display:none;position:absolute;top:-32px;left:0;z-index:50;
  background:#fff;border:1px solid #E0E0E0;border-radius:6px;
  padding:2px 4px;gap:2px;flex-direction:row;box-shadow:0 2px 8px rgba(0,0,0,0.12);
}
.table-wrapper:focus-within .table-toolbar{display:flex;}
.table-toolbar button{
  border:none;background:transparent;padding:4px 8px;
  font-size:12px;color:#424242;cursor:pointer;border-radius:4px;
  font-family:system-ui;white-space:nowrap;
}
.table-toolbar button:active{background:#E3F2FD;}

/* ── Table add-row floating button ───────────────── */
.table-add-row-btn{
  width:28px;height:28px;border-radius:50%;
  background:#1976D2;color:#fff;border:2px solid #fff;
  font-size:18px;line-height:1;text-align:center;
  cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.2);
  display:flex;align-items:center;justify-content:center;
  margin:-8px 8px 0 auto;
  position:relative;z-index:51;
  user-select:none;-webkit-user-select:none;
  font-family:system-ui;
}
.table-add-row-btn:active{background:#1565C0;transform:scale(0.92);}

/* ── Image action buttons ────────────────────────── */
.img-action-bar{
  position:absolute;bottom:-14px;right:18px;z-index:11;
  display:flex;flex-direction:row;gap:4px;
}
.img-action-btn{
  width:26px;height:26px;border-radius:50%;
  background:#fff;border:1.5px solid #E0E0E0;
  font-size:13px;line-height:1;text-align:center;
  cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.15);
  display:flex;align-items:center;justify-content:center;
  user-select:none;-webkit-user-select:none;
}
.img-action-btn:active{background:#E3F2FD;border-color:#1976D2;}

/* ── Crop overlay ────────────────────────────────── */
.crop-overlay{position:absolute;top:0;left:0;z-index:20;pointer-events:auto;}
.crop-mask{position:absolute;background:rgba(0,0,0,0.45);}
.crop-border{position:absolute;border:2px dashed #1976D2;z-index:21;pointer-events:none;}
.crop-handle{
  position:absolute;width:18px;height:18px;background:#1976D2;border:2px solid #fff;
  border-radius:3px;z-index:22;touch-action:none;cursor:pointer;
}
.crop-btn-bar{
  position:absolute;bottom:-34px;left:0;right:0;
  display:flex;justify-content:center;gap:8px;z-index:22;
}
.crop-btn{
  padding:4px 14px;border:none;border-radius:4px;
  font-size:13px;cursor:pointer;font-family:system-ui;
}
.crop-btn.apply{background:#1976D2;color:#fff;}
.crop-btn.cancel{background:#fff;color:#424242;border:1px solid #BDBDBD;}
</style>
</head>
<body>
<div id="page">
  <div id="editor" contenteditable="true" spellcheck="true"
       data-placeholder="Start typing your document..."></div>
</div>
<script>
'use strict';
var editor=document.getElementById('editor');

// ── SELECTION SAVE/RESTORE (THE CORE FIX) ──────────────────────────────────
var _savedRange=null;

function saveSelection(){
  var sel=window.getSelection();
  if(sel&&sel.rangeCount>0){
    var r=sel.getRangeAt(0);
    if(editor.contains(r.commonAncestorContainer)||r.commonAncestorContainer===editor){
      _savedRange=r.cloneRange();
    }
  }
}

function restoreSelection(){
  editor.focus();
  if(_savedRange){
    try{
      var sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }catch(e){}
  }
}

document.addEventListener('selectionchange',saveSelection);
editor.addEventListener('keyup',saveSelection);
editor.addEventListener('mouseup',saveSelection);
editor.addEventListener('touchend',saveSelection);

// ── WORD-LEVEL HISTORY (undo/redo with cursor preservation) ───────────────
var _hist=[{h:'',c:0}],_hidx=0,_htimer=null;

// Get cursor offset as character count from start of editor text
function _curOff(){
  try{
    var sel=window.getSelection();
    if(!sel||!sel.rangeCount)return 0;
    var r=sel.getRangeAt(0);
    var pr=document.createRange();
    pr.selectNodeContents(editor);
    pr.setEnd(r.endContainer,r.endOffset);
    return pr.toString().length;
  }catch(e){return 0;}
}

// Set cursor at character offset from start of editor text
function _setCur(off){
  try{
    editor.focus();
    if(off<0)off=0;
    var text=editor.innerText||'';
    if(off>text.length)off=text.length;
    var tw=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,null,false);
    var cnt=0,nd;
    while(nd=tw.nextNode()){
      var len=nd.textContent.length;
      if(cnt+len>=off){
        var r=document.createRange();
        r.setStart(nd,off-cnt);r.collapse(true);
        var sel=window.getSelection();
        sel.removeAllRanges();sel.addRange(r);
        _savedRange=r.cloneRange();
        return;
      }
      cnt+=len;
    }
    // Fallback: place cursor at end of content
    var r=document.createRange();
    r.selectNodeContents(editor);r.collapse(false);
    var sel=window.getSelection();
    sel.removeAllRanges();sel.addRange(r);
    _savedRange=r.cloneRange();
  }catch(e){}
}

function _snap(){
  var h=editor.innerHTML;
  var c=_curOff();
  if(h===_hist[_hidx].h)return;
  _hist=_hist.slice(0,_hidx+1);
  _hist.push({h:h,c:c});_hidx++;
  if(_hist.length>200){_hist.shift();_hidx--;}
  _notifyUR();
}

function _notifyUR(){
  rn({type:'UNDO_REDO',canUndo:_hidx>0,canRedo:_hidx<_hist.length-1});
}

// pushHistory() — immediate snapshot (used by format commands, inserts)
function pushHistory(){
  clearTimeout(_htimer);
  _snap();
}

// _inputChanged() — called by input handler; immediate on word boundary,
// debounced otherwise so each word gets its own undo step.
function _inputChanged(isWordBoundary){
  clearTimeout(_htimer);
  if(isWordBoundary){_snap();}
  else{_htimer=setTimeout(_snap,800);}
}

window.doUndo=function(){
  // Flush any pending debounced snapshot before undoing
  clearTimeout(_htimer);
  var cur=editor.innerHTML;
  if(cur!==_hist[_hidx].h){_snap();}
  if(_hidx>0){
    _hidx--;
    editor.innerHTML=_hist[_hidx].h;
    _setCur(_hist[_hidx].c);
    _notifyUR();
    notifyContent();
  }
};

window.doRedo=function(){
  if(_hidx<_hist.length-1){
    _hidx++;
    editor.innerHTML=_hist[_hidx].h;
    _setCur(_hist[_hidx].c);
    _notifyUR();
    notifyContent();
  }
};

// ── CORE execCommand WRAPPER ──────────────────────────────────────────────
function cmd(command,value){
  restoreSelection();
  document.execCommand(command,false,value||null);
  pushHistory();
  notifySelectionState();
}

// ── INLINE FORMATS ────────────────────────────────────────────────────────
window.applyBold=function(){cmd('bold');};
window.applyItalic=function(){cmd('italic');};
window.applyUnderline=function(){cmd('underline');};
window.applyStrikethrough=function(){cmd('strikeThrough');};

// ── FONT FAMILY (span-based for real rendering) ────────────────────────────
window.applyFontFamily=function(fontName){
  restoreSelection();
  wrapStyle('fontFamily',fontName+', sans-serif');
  pushHistory();
};

// ── FONT SIZE ─────────────────────────────────────────────────────────────
window.applyFontSize=function(pt){
  restoreSelection();
  wrapStyle('fontSize',pt+'pt');
  pushHistory();
};

// ── HIGHLIGHT ─────────────────────────────────────────────────────────────
window.applyHighlight=function(color){
  restoreSelection();
  if(!color||color==='none'){
    cmd('removeFormat');
  }else{
    cmd('hiliteColor',color);
  }
};

// ── ALIGNMENT ─────────────────────────────────────────────────────────────
window.applyAlign=function(align){
  restoreSelection();
  var map={left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'};
  if(map[align]) document.execCommand(map[align],false,null);
  var block=getBlock();
  if(block) block.style.textAlign=align;
  pushHistory();
  notifySelectionState();
};

// ── LINE SPACING ──────────────────────────────────────────────────────────
window.applyLineSpacing=function(spacing){
  restoreSelection();
  var block=getBlock();
  if(block) block.style.lineHeight=String(spacing);
  else editor.style.lineHeight=String(spacing);
  pushHistory();
};

// ── SPAN STYLE WRAPPER ────────────────────────────────────────────────────
function wrapStyle(prop,value){
  var sel=window.getSelection();
  if(!sel||!sel.rangeCount)return;
  var range=sel.getRangeAt(0);
  if(range.collapsed){
    var s=document.createElement('span');
    s.style[prop]=value;
    s.innerHTML='\\u200B';
    range.insertNode(s);
    var nr=document.createRange();
    nr.setStart(s.firstChild,1);nr.collapse(true);
    sel.removeAllRanges();sel.addRange(nr);
    _savedRange=nr.cloneRange();
    return;
  }
  try{
    var sp=document.createElement('span');
    sp.style[prop]=value;
    range.surroundContents(sp);
    _savedRange=sel.getRangeAt(0).cloneRange();
  }catch(e){
    document.execCommand('fontSize',false,'7');
    editor.querySelectorAll('font[size="7"]').forEach(function(n){
      n.removeAttribute('size');n.style[prop]=value;
    });
  }
}

function getBlock(){
  var sel=window.getSelection();
  if(!sel||!sel.rangeCount)return null;
  var node=sel.getRangeAt(0).commonAncestorContainer;
  if(node.nodeType===3)node=node.parentNode;
  while(node&&node!==editor){
    if(/^(DIV|P|H[1-6]|LI|BLOCKQUOTE)$/.test(node.nodeName))return node;
    node=node.parentNode;
  }
  return editor;
}

// ── IMAGE CROP ────────────────────────────────────────────────────────────
function startCrop(wrap,img){
  if(wrap.querySelector('.crop-overlay'))return;
  var w=img.offsetWidth,h=img.offsetHeight;
  var crop={t:0,l:0,r:1,b:1};
  var ov=document.createElement('div');
  ov.className='crop-overlay';
  ov.style.width=w+'px';ov.style.height=h+'px';
  var mT=document.createElement('div');mT.className='crop-mask';
  var mB=document.createElement('div');mB.className='crop-mask';
  var mL=document.createElement('div');mL.className='crop-mask';
  var mR=document.createElement('div');mR.className='crop-mask';
  [mT,mB,mL,mR].forEach(function(m){ov.appendChild(m);});
  var bdr=document.createElement('div');bdr.className='crop-border';ov.appendChild(bdr);
  function mkH(p){var d=document.createElement('div');d.className='crop-handle';d.dataset.pos=p;return d;}
  var hs={tl:mkH('tl'),tr:mkH('tr'),bl:mkH('bl'),br:mkH('br')};
  Object.values(hs).forEach(function(hh){ov.appendChild(hh);});
  function upd(){
    var cl=crop.l*w,ct=crop.t*h,cr=crop.r*w,cb=crop.b*h,cw=cr-cl,ch=cb-ct;
    mT.style.cssText='position:absolute;background:rgba(0,0,0,0.45);top:0;left:'+cl+'px;width:'+cw+'px;height:'+ct+'px;';
    mB.style.cssText='position:absolute;background:rgba(0,0,0,0.45);top:'+cb+'px;left:'+cl+'px;width:'+cw+'px;height:'+(h-cb)+'px;';
    mL.style.cssText='position:absolute;background:rgba(0,0,0,0.45);top:0;left:0;width:'+cl+'px;height:'+h+'px;';
    mR.style.cssText='position:absolute;background:rgba(0,0,0,0.45);top:0;left:'+cr+'px;width:'+(w-cr)+'px;height:'+h+'px;';
    bdr.style.cssText='position:absolute;border:2px dashed #1976D2;z-index:21;pointer-events:none;left:'+cl+'px;top:'+ct+'px;width:'+cw+'px;height:'+ch+'px;';
    hs.tl.style.left=(cl-9)+'px';hs.tl.style.top=(ct-9)+'px';
    hs.tr.style.left=(cr-9)+'px';hs.tr.style.top=(ct-9)+'px';
    hs.bl.style.left=(cl-9)+'px';hs.bl.style.top=(cb-9)+'px';
    hs.br.style.left=(cr-9)+'px';hs.br.style.top=(cb-9)+'px';
  }
  upd();
  var dh=null,dx0,dy0,dc;
  function hDown(e){e.preventDefault();e.stopPropagation();dh=e.currentTarget.dataset.pos;var pt=e.touches?e.touches[0]:e;dx0=pt.clientX;dy0=pt.clientY;dc={t:crop.t,l:crop.l,r:crop.r,b:crop.b};document.addEventListener('mousemove',hMove);document.addEventListener('mouseup',hUp);document.addEventListener('touchmove',hMove,{passive:false});document.addEventListener('touchend',hUp);}
  function hMove(e){e.preventDefault();if(!dh)return;var pt=e.touches?e.touches[0]:e;var fx=(pt.clientX-dx0)/w,fy=(pt.clientY-dy0)/h;if(dh[0]==='t')crop.t=Math.max(0,Math.min(crop.b-0.1,dc.t+fy));if(dh[0]==='b')crop.b=Math.max(crop.t+0.1,Math.min(1,dc.b+fy));if(dh[1]==='l')crop.l=Math.max(0,Math.min(crop.r-0.1,dc.l+fx));if(dh[1]==='r')crop.r=Math.max(crop.l+0.1,Math.min(1,dc.r+fx));upd();}
  function hUp(){dh=null;document.removeEventListener('mousemove',hMove);document.removeEventListener('mouseup',hUp);document.removeEventListener('touchmove',hMove);document.removeEventListener('touchend',hUp);}
  Object.values(hs).forEach(function(hh){hh.addEventListener('mousedown',hDown);hh.addEventListener('touchstart',hDown,{passive:false});});
  var bb=document.createElement('div');bb.className='crop-btn-bar';
  var apBtn=document.createElement('button');apBtn.className='crop-btn apply';apBtn.textContent='\\u2713 Crop';
  apBtn.addEventListener('click',function(e){e.stopPropagation();doCrop();});
  var caBtn=document.createElement('button');caBtn.className='crop-btn cancel';caBtn.textContent='Cancel';
  caBtn.addEventListener('click',function(e){e.stopPropagation();ov.remove();bb.remove();});
  bb.appendChild(apBtn);bb.appendChild(caBtn);
  wrap.appendChild(ov);wrap.appendChild(bb);
  function doCrop(){
    var cvs=document.createElement('canvas');
    var nw=img.naturalWidth,nh=img.naturalHeight;
    var sx=Math.round(crop.l*nw),sy=Math.round(crop.t*nh);
    var sw=Math.round((crop.r-crop.l)*nw),sh=Math.round((crop.b-crop.t)*nh);
    if(sw<1)sw=1;if(sh<1)sh=1;
    cvs.width=sw;cvs.height=sh;
    var ctx=cvs.getContext('2d');ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    img.src=cvs.toDataURL('image/png');
    var dw=img.offsetWidth;img.style.height=Math.round(dw*(sh/sw))+'px';
    ov.remove();bb.remove();pushHistory();
  }
}

// ── INSERTS ───────────────────────────────────────────────────────────────
window.insertImage=function(base64,mimeType){
  restoreSelection();
  var wrap=document.createElement('div');
  wrap.className='img-resize-wrap';wrap.contentEditable='false';
  var img=document.createElement('img');
  img.src='data:'+mimeType+';base64,'+base64;
  img.className='inserted-image';
  img.style.width='100%';img.style.height='auto';img.style.display='block';
  img.draggable=false;
  wrap.appendChild(img);

  // Resize handle (bottom-right)
  var handle=document.createElement('div');
  handle.className='img-resize-handle br';
  wrap.appendChild(handle);

  // Click to select
  wrap.addEventListener('click',function(e){
    e.stopPropagation();
    document.querySelectorAll('.img-resize-wrap').forEach(function(w){w.classList.remove('selected');});
    wrap.classList.add('selected');
  });

  // Deselect on outside click
  document.addEventListener('click',function(e){
    if(!wrap.contains(e.target)){wrap.classList.remove('selected');}
  });

  // Touch/pointer resize
  var startX,startY,startW,startH,ratio;
  function onDown(e){
    e.preventDefault();e.stopPropagation();
    startW=img.offsetWidth;startH=img.offsetHeight;
    ratio=startH/startW;
    var pt=e.touches?e.touches[0]:e;
    startX=pt.clientX;startY=pt.clientY;
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onUp);
  }
  function onMove(e){
    e.preventDefault();
    var pt=e.touches?e.touches[0]:e;
    var dx=pt.clientX-startX;
    var newW=Math.max(40,startW+dx);
    img.style.width=newW+'px';
    img.style.height=Math.round(newW*ratio)+'px';
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    document.removeEventListener('touchmove',onMove);
    document.removeEventListener('touchend',onUp);
    pushHistory();
  }
  handle.addEventListener('mousedown',onDown);
  handle.addEventListener('touchstart',onDown,{passive:false});

  // Action buttons (crop + delete)
  var actionBar=document.createElement('div');
  actionBar.className='img-action-bar';
  var cropBtn=document.createElement('div');
  cropBtn.className='img-action-btn';cropBtn.innerHTML='\\u2702';cropBtn.title='Crop';
  cropBtn.addEventListener('mousedown',function(e){e.preventDefault();});
  cropBtn.addEventListener('click',function(e){e.stopPropagation();startCrop(wrap,img);});
  actionBar.appendChild(cropBtn);
  var delBtn=document.createElement('div');
  delBtn.className='img-action-btn';delBtn.innerHTML='\\uD83D\\uDDD1';delBtn.title='Delete';delBtn.style.color='#D32F2F';
  delBtn.addEventListener('mousedown',function(e){e.preventDefault();});
  delBtn.addEventListener('click',function(e){e.stopPropagation();if(confirm('Delete this image?')){wrap.parentNode.removeChild(wrap);pushHistory();notifyContent();}});
  actionBar.appendChild(delBtn);
  wrap.appendChild(actionBar);

  // Long-press to delete
  var _lpt=null;
  wrap.addEventListener('touchstart',function(){
    _lpt=setTimeout(function(){if(confirm('Delete this image?')){wrap.parentNode.removeChild(wrap);pushHistory();notifyContent();}},600);
  });
  wrap.addEventListener('touchend',function(){clearTimeout(_lpt);});
  wrap.addEventListener('touchmove',function(){clearTimeout(_lpt);});

  insertNode(wrap);
};

// ── TABLE INSERT ──────────────────────────────────────────────────────────
window.insertTable=function(rows,cols){
  restoreSelection();
  var wrap=document.createElement('div');
  wrap.className='table-wrapper';

  // Mini toolbar
  var tb=document.createElement('div');
  tb.className='table-toolbar';
  var btns=[
    {label:'+Row',fn:function(){addRow(tbl);}},
    {label:'+Col',fn:function(){addCol(tbl);}},
    {label:'-Row',fn:function(){delRow(tbl);}},
    {label:'-Col',fn:function(){delCol(tbl);}}
  ];
  btns.forEach(function(b){
    var btn=document.createElement('button');
    btn.textContent=b.label;
    btn.addEventListener('mousedown',function(e){e.preventDefault();});
    btn.addEventListener('click',function(e){e.stopPropagation();b.fn();pushHistory();});
    tb.appendChild(btn);
  });
  wrap.appendChild(tb);

  var tbl=document.createElement('table');
  tbl.className='editor-table';
  for(var r=0;r<rows;r++){
    var tr=document.createElement('tr');
    for(var c=0;c<cols;c++){
      var td=document.createElement('td');
      td.contentEditable='true';
      td.innerHTML='<br>';
      setupCell(td);
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
  wrap.appendChild(tbl);

  // Persistent "+" add-row button at bottom-right
  var addBtn=document.createElement('div');
  addBtn.className='table-add-row-btn';addBtn.textContent='+';addBtn.title='Add row';
  addBtn.addEventListener('mousedown',function(e){e.preventDefault();});
  addBtn.addEventListener('click',function(e){e.stopPropagation();addRow(tbl);pushHistory();});
  wrap.appendChild(addBtn);

  insertNode(wrap);
  // Focus first cell
  var first=tbl.querySelector('td');
  if(first)setTimeout(function(){first.focus();},50);
};

function setupCell(td){
  td.addEventListener('keydown',function(e){
    if(e.key==='Tab'){
      e.preventDefault();
      var cells=Array.from(td.closest('table').querySelectorAll('td'));
      var idx=cells.indexOf(td);
      var next=e.shiftKey?cells[idx-1]:cells[idx+1];
      if(next)next.focus();
    }
  });
}
function addRow(tbl){
  var cols=tbl.rows[0]?tbl.rows[0].cells.length:1;
  var tr=document.createElement('tr');
  for(var c=0;c<cols;c++){
    var td=document.createElement('td');
    td.contentEditable='true';td.innerHTML='<br>';setupCell(td);tr.appendChild(td);
  }
  tbl.appendChild(tr);
}
function addCol(tbl){
  Array.from(tbl.rows).forEach(function(tr){
    var td=document.createElement('td');
    td.contentEditable='true';td.innerHTML='<br>';setupCell(td);tr.appendChild(td);
  });
}
function delRow(tbl){
  if(tbl.rows.length>1)tbl.deleteRow(tbl.rows.length-1);
}
function delCol(tbl){
  if(!tbl.rows[0]||tbl.rows[0].cells.length<=1)return;
  Array.from(tbl.rows).forEach(function(tr){tr.deleteCell(tr.cells.length-1);});
}

window.insertShape=function(type){
  restoreSelection();
  var wrap=document.createElement('div');
  wrap.className='shape-container';wrap.contentEditable='false';
  var NS='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width','120');svg.setAttribute('height','80');svg.style.display='block';
  if(type==='rectangle'){
    var r=document.createElementNS(NS,'rect');
    r.setAttribute('x','4');r.setAttribute('y','4');r.setAttribute('width','112');r.setAttribute('height','72');
    r.setAttribute('fill','none');r.setAttribute('stroke','#333');r.setAttribute('stroke-width','2');
    svg.appendChild(r);
  }else if(type==='circle'){
    var c=document.createElementNS(NS,'ellipse');
    c.setAttribute('cx','60');c.setAttribute('cy','40');c.setAttribute('rx','55');c.setAttribute('ry','34');
    c.setAttribute('fill','none');c.setAttribute('stroke','#333');c.setAttribute('stroke-width','2');
    svg.appendChild(c);
  }else if(type==='line'){
    var l=document.createElementNS(NS,'line');
    l.setAttribute('x1','4');l.setAttribute('y1','40');l.setAttribute('x2','116');l.setAttribute('y2','40');
    l.setAttribute('stroke','#333');l.setAttribute('stroke-width','2');svg.appendChild(l);
  }else if(type==='arrow'){
    var defs=document.createElementNS(NS,'defs');
    var mk=document.createElementNS(NS,'marker');
    mk.setAttribute('id','arr');mk.setAttribute('markerWidth','10');mk.setAttribute('markerHeight','7');
    mk.setAttribute('refX','9');mk.setAttribute('refY','3.5');mk.setAttribute('orient','auto');
    var poly=document.createElementNS(NS,'polygon');
    poly.setAttribute('points','0 0,10 3.5,0 7');poly.setAttribute('fill','#333');
    mk.appendChild(poly);defs.appendChild(mk);svg.appendChild(defs);
    var al=document.createElementNS(NS,'line');
    al.setAttribute('x1','4');al.setAttribute('y1','40');al.setAttribute('x2','106');al.setAttribute('y2','40');
    al.setAttribute('stroke','#333');al.setAttribute('stroke-width','2');al.setAttribute('marker-end','url(#arr)');
    svg.appendChild(al);
  }
  wrap.appendChild(svg);
  wrap.onclick=function(){
    document.querySelectorAll('.shape-container').forEach(function(s){s.classList.remove('selected');});
    wrap.classList.toggle('selected');
  };
  insertNode(wrap);
};

window.insertTextBox=function(){
  restoreSelection();
  var box=document.createElement('div');
  box.className='text-box';box.contentEditable='true';box.textContent='Text box';
  insertNode(box);setTimeout(function(){box.focus();},50);
};

window.insertSignature=function(base64){
  restoreSelection();
  var img=document.createElement('img');
  img.src='data:image/png;base64,'+base64;img.className='signature-img';
  insertNode(img);
};

window.insertHyperlink=function(text,url){
  restoreSelection();
  var a=document.createElement('a');
  a.href=url;a.textContent=text||url;a.className='hyperlink';a.contentEditable='false';
  insertNode(a);
};

window.insertDateTime=function(text){
  restoreSelection();document.execCommand('insertText',false,text);pushHistory();
};

window.insertComment=function(commentText,id){
  restoreSelection();
  var sel=window.getSelection();if(!sel||!sel.rangeCount)return;
  var range=sel.getRangeAt(0);
  var span=document.createElement('span');
  span.className='comment-mark';span.setAttribute('data-comment-id',id);span.title=commentText;
  try{range.surroundContents(span);}
  catch(e){span.textContent=sel.toString()||'[Comment]';range.deleteContents();range.insertNode(span);}
  pushHistory();
};

window.insertBookmark=function(name,id){
  restoreSelection();
  var anchor=document.createElement('span');
  anchor.className='bookmark-mark';anchor.id='bm-'+id;anchor.contentEditable='false';
  anchor.title='Bookmark: '+name;anchor.textContent='🔗';
  insertNode(anchor);
};

window.insertBlankPage=function(){
  restoreSelection();
  var hr=document.createElement('hr');hr.className='page-break';insertNode(hr);
  var p=document.createElement('p');p.innerHTML='<br>';insertNode(p);
};

window.insertAttachment=function(name){
  restoreSelection();
  var div=document.createElement('div');
  div.className='doc-attachment';div.contentEditable='false';
  div.innerHTML='<span>📎</span><span>'+name+'</span>';
  insertNode(div);
};

function insertNode(node){
  var sel=window.getSelection();
  if(sel&&sel.rangeCount){
    var range=sel.getRangeAt(0);
    range.deleteContents();range.insertNode(node);
    var after=document.createRange();
    after.setStartAfter(node);after.collapse(true);
    sel.removeAllRanges();sel.addRange(after);
    _savedRange=after.cloneRange();
  }else{
    editor.appendChild(node);
  }
  pushHistory();notifyContent();
}

// ── STATE NOTIFICATIONS ───────────────────────────────────────────────────
function notifySelectionState(){
  try{
    var bold=document.queryCommandState('bold');
    var italic=document.queryCommandState('italic');
    var underline=document.queryCommandState('underline');
    var strike=document.queryCommandState('strikeThrough');
    var align='left';
    if(document.queryCommandState('justifyCenter'))align='center';
    else if(document.queryCommandState('justifyRight'))align='right';
    else if(document.queryCommandState('justifyFull'))align='justify';
    var block=getBlock();
    if(block&&block.style.textAlign)align=block.style.textAlign;
    rn({type:'SELECTION_STATE',bold:bold,italic:italic,underline:underline,strikethrough:strike,align:align});
  }catch(e){}
}
function notifyContent(){
  var text=editor.innerText||'';
  var words=text.trim()?text.trim().split(/\\s+/).length:0;
  rn({type:'CONTENT_CHANGE',wordCount:words,charCount:text.length});
}
window.getContent=function(){
  rn({type:'SAVE_CONTENT',html:editor.innerHTML,text:editor.innerText||''});
};

window.loadContent=function(html){
  editor.innerHTML=html;
  pushHistory();
  notifyContent();
};

function rn(data){
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────
// ── SCROLL-TO-CARET (keyboard avoidance) ──────────────────────────────
// Uses getBoundingClientRect on the selection — never mutates the DOM.
function scrollToCaret(){
  try{
    var sel=window.getSelection();
    if(!sel||!sel.rangeCount)return;
    var range=sel.getRangeAt(0);
    var rect=range.getBoundingClientRect();
    if(!rect||rect.height===0){
      var node=range.commonAncestorContainer;
      if(node.nodeType===3)node=node.parentNode;
      if(node&&node.getBoundingClientRect)rect=node.getBoundingClientRect();
    }
    if(!rect)return;
    var vh=window.visualViewport?window.visualViewport.height:window.innerHeight;
    var margin=60;
    if(rect.bottom>vh-margin){
      window.scrollBy({top:rect.bottom-(vh-margin),behavior:'smooth'});
    }else if(rect.top<margin){
      window.scrollBy({top:rect.top-margin,behavior:'smooth'});
    }
  }catch(e){}
}

// Scroll on keyboard resize (visual viewport change)
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',function(){
    setTimeout(scrollToCaret,80);
  });
}

editor.addEventListener('input',function(e){
  var isBoundary=false;
  if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak'){
    isBoundary=true;
  }else if(e.inputType==='insertText'&&e.data){
    if(/[\\s\\t\\n\\r\\.\\,;:!?\\-\\(\\)\\[\\]{}\\"\\'\\\/\\\\]/.test(e.data)){
      isBoundary=true;
    }
  }else if(e.inputType==='deleteContentBackward'||e.inputType==='deleteContentForward'||
           e.inputType==='deleteWordBackward'||e.inputType==='deleteWordForward'){
    isBoundary=true;
  }
  _inputChanged(isBoundary);
  notifyContent();
  scrollToCaret();
});
editor.addEventListener('keyup',function(){notifySelectionState();notifyContent();});
editor.addEventListener('mouseup',notifySelectionState);
editor.addEventListener('touchend',notifySelectionState);

setTimeout(function(){editor.focus();},200);
</script>
</body>
</html>
`;

// ── Component ──────────────────────────────────────────────────────────────

export default React.memo(function WebEditor() {
  const { webViewRef, dispatch, lastHtmlRef } = useDocument();
  const fontScriptRef = useRef<string | null>(null);

  // Load bundled font CSS injection script AFTER initial render settles —
  // the editor is usable with system fonts immediately; custom fonts are
  // injected once InteractionManager fires, avoiding mount-time jank.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      getWebViewFontInjectionScript()
        .then((script) => {
          fontScriptRef.current = script;
          // If WebView is already loaded, inject now
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(script);
          }
        })
        .catch(() => {}); // fonts will just use system fallback
    });
    return () => handle.cancel();
  }, [webViewRef]);

  // Debounce timers for high-frequency messages from the WebView editor.
  // CONTENT_CHANGE fires on every input and SELECTION_STATE on every
  // keyup/mouseup — dispatching each one immediately causes the whole
  // editor tree to re-render.  Instead we batch them with a short timer.
  const contentChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionStateTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingContentChange = useRef<{
    wordCount: number;
    charCount: number;
  } | null>(null);
  const pendingSelectionState = useRef<any>(null);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data: EditorWebViewMessage = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case "CONTENT_CHANGE":
            // Debounce word/char count updates (fire at most every 300ms)
            pendingContentChange.current = {
              wordCount: data.wordCount,
              charCount: data.charCount,
            };
            if (!contentChangeTimer.current) {
              contentChangeTimer.current = setTimeout(() => {
                if (pendingContentChange.current) {
                  dispatch({
                    type: "UPDATE_COUNTS",
                    ...pendingContentChange.current,
                  });
                  pendingContentChange.current = null;
                }
                contentChangeTimer.current = null;
              }, 300);
            }
            break;

          case "SELECTION_STATE":
            // Debounce formatting state updates (fire at most every 150ms)
            pendingSelectionState.current = {
              bold: data.bold,
              italic: data.italic,
              underline: data.underline,
              strikethrough: data.strikethrough,
              textAlign: data.align,
            };
            if (!selectionStateTimer.current) {
              selectionStateTimer.current = setTimeout(() => {
                if (pendingSelectionState.current) {
                  dispatch({
                    type: "SET_FORMATTING_STATE",
                    payload: pendingSelectionState.current,
                  });
                  pendingSelectionState.current = null;
                }
                selectionStateTimer.current = null;
              }, 150);
            }
            break;

          case "UNDO_REDO":
            dispatch({
              type: "SET_UNDO_REDO",
              canUndo: data.canUndo,
              canRedo: data.canRedo,
            });
            break;

          case "CONTENT":
            lastHtmlRef.current = data.html;
            break;

          case "SAVE_CONTENT":
            lastHtmlRef.current = data.html;
            break;

          default:
            break;
        }

        // Handle GET_CONTENT_RESULT for the getEditorHtml() promise
        if (
          (data as any).type === "GET_CONTENT_RESULT" &&
          (webViewRef.current as any)?.__htmlResolve
        ) {
          (webViewRef.current as any).__htmlResolve((data as any).html || "");
          delete (webViewRef.current as any).__htmlResolve;
        }
      } catch {
        // Ignore non-JSON messages
      }
    },
    [dispatch, lastHtmlRef],
  );

  // Inject bundled fonts into the WebView after it finishes loading
  const handleLoad = useCallback(() => {
    if (fontScriptRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(fontScriptRef.current);
    }
  }, [webViewRef]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: EDITOR_HTML }}
        onMessage={handleMessage}
        onLoad={handleLoad}
        scrollEnabled
        keyboardDisplayRequiresUserAction={false}
        showsVerticalScrollIndicator={false}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
