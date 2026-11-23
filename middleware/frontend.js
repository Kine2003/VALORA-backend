import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const raizBackend=fileURLToPath(new URL('../',import.meta.url));
const tipos={'.webp':'image/webp','.avif':'image/avif','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
export async function servirFrontend(peticion,respuesta,ruta) {
  if(!['GET','HEAD'].includes(peticion.method))return false;
  let nombre;try{nombre=decodeURIComponent(ruta==='/'?'/index.html':ruta);}catch{return false;}
  if(!/^\/(?:index\.html|admin\.html|privacidad\.html|condiciones\.html|(?:assets|js)\/[a-zA-Z0-9_./-]+)$/.test(nombre)||nombre.includes('..')||nombre.includes('/.'))return false;
  const raiz=resolve(raizBackend,process.env.FRONTEND_DIR||'../VALORA-frontend');
  const archivo=resolve(raiz,'.'+nombre);
  if(!archivo.startsWith(raiz+sep))return false;
  const tipo=tipos[extname(archivo)];if(!tipo)return false;
  try {
    let contenido=await readFile(archivo);
    if(tipo.startsWith('text/html'))contenido=Buffer.from(contenido.toString('utf8').replace(/(<meta\s+name="valora-api-url"\s+content=")[^"]*(")/g,'$1/$2'));
    respuesta.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    respuesta.writeHead(200,{'Content-Type':tipo,'Content-Length':contenido.length});
    respuesta.end(peticion.method==='HEAD'?undefined:contenido);return true;
  }catch(e){if(['ENOENT','EISDIR'].includes(e.code))return false;throw e;}
}
