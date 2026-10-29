import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const gameUrl = `http://localhost:${port}`;
const shouldOpen = process.argv.includes('--open');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };

function openBrowser(){
  const command=process.platform==='win32'?['cmd.exe',['/c','start','',gameUrl]]:process.platform==='darwin'?['open',[gameUrl]]:['xdg-open',[gameUrl]];
  try{const child=spawn(command[0],command[1],{detached:true,stdio:'ignore',windowsHide:true});child.unref();}catch(error){console.warn(`無法自動開啟瀏覽器，請手動前往 ${gameUrl}`);}
}

const server=createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const requested = resolve(root, `.${urlPath === '/' ? '/index.html' : urlPath}`);
    if (requested !== root && !requested.startsWith(root + sep)) throw new Error('Forbidden');
    const info = await stat(requested);
    const file = info.isDirectory() ? join(requested, 'index.html') : requested;
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.on('error',error=>{
  if(error.code==='EADDRINUSE'){
    console.log(`NEON STRIKE 已在執行：${gameUrl}`);
    if(shouldOpen)openBrowser();
    process.exitCode=0;
    return;
  }
  console.error('NEON STRIKE 啟動失敗：',error.message);
  process.exitCode=1;
});

server.listen(port,'127.0.0.1',()=>{
  console.log(`NEON STRIKE ready at ${gameUrl}`);
  console.log('保持此視窗開啟即可繼續遊玩；按 Ctrl+C 可停止伺服器。');
  if(shouldOpen)setTimeout(openBrowser,250);
});
