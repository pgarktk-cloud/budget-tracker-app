/* Parse-check index.html's JSX block. RUN THIS AFTER EVERY EDIT.

   A syntax error in the babel block blanks the app with *zero console output*
   — Babel throws after `#loading` is removed and `#root` never mounts — so
   this is the only cheap way to know an edit is even loadable.

   Needs @babel/standalone, which is not vendored (the app loads it from a
   CDN). Install it once, anywhere outside the repo, e.g.:

       npm i @babel/standalone --prefix /tmp/pc
       node parsecheck.cjs /tmp/pc/node_modules/@babel/standalone

   or pass nothing if it resolves from the current directory.

   Note the script tag is `<script type="text/babel" data-presets="react">` —
   a regex matching `type="text/babel">` exactly will not find it. */
const fs=require("fs"),path=require("path");
const babelPath=process.argv[2]||"@babel/standalone";
let Babel;
try{Babel=require(path.isAbsolute(babelPath)?babelPath:babelPath);}
catch(e){
  console.error("Could not load @babel/standalone from "+babelPath+
    "\nInstall it and pass the path — see the header of this file.");
  process.exit(2);
}
const file=process.argv[3]||path.join(__dirname,"index.html");
const html=fs.readFileSync(file,"utf8")
  // normalise CRLF: a Windows checkout would otherwise break every slice
  // marker that spans a newline (see .gitattributes)
  .replace(/\r\n/g, "\n");
const m=html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if(!m){console.error("no <script type=\"text/babel\"> block found in "+file);process.exit(1);}
const src=m[1];
const lineOffset=html.slice(0,m.index).split("\n").length;
try{
  Babel.transform(src,{presets:["react"],filename:"index.jsx"});
  console.log("PARSE OK — "+src.split("\n").length+" lines of JSX");
}catch(e){
  // map the error back to a line number in index.html, not in the slice
  const loc=e.loc?" (index.html line "+(lineOffset+e.loc.line-1)+", col "+e.loc.column+")":"";
  console.error("PARSE FAIL"+loc+"\n"+e.message);
  process.exit(1);
}
