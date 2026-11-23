import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||8080);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    const filename=path.resolve(root,'.'+pathname);
    if(filename!==path.resolve(root)&&!filename.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(filename);
    const target=info.isDirectory()?path.join(filename,'index.html'):filename;
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error.code==='ENOENT'||error.code==='ENOTDIR'?404:400);res.end('Filen kunde inte hittas eller adressen är ogiltig.');}
});
server.on('error',error=>{console.error('Kunde inte starta servern:',error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Bullrush körs på http://localhost:${port}\nAvsluta med Ctrl+C.`));
