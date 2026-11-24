import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {aprovisionarEquipo} from '../scripts/aprovisionar-equipo.mjs';

test('las claves nunca se escriben dentro del proyecto o carpeta publicada',async()=>{
  let conectado=false;
  const pool={connect:async()=>{conectado=true;throw Error('No debe conectar');}};
  for(const ruta of [new URL('../users-prueba.txt',import.meta.url),new URL('../data/accesos.txt',import.meta.url),new URL('../../VALORA-frontend/assets/accesos.txt',import.meta.url)]){
    await assert.rejects(aprovisionarEquipo(pool,ruta.pathname.replace(/^\/([A-Za-z]:)/,'$1')),/fuera de los repositorios/);
  }
  assert.equal(conectado,false);
});

test('un FRONTEND_DIR externo también queda excluido',async()=>{
  const carpeta=await mkdtemp(join(tmpdir(),'valora-publicado-')),anterior=process.env.FRONTEND_DIR;
  process.env.FRONTEND_DIR=carpeta;
  try{await assert.rejects(aprovisionarEquipo({},join(carpeta,'accesos.txt')),/fuera de los repositorios/);}
  finally{if(anterior===undefined)delete process.env.FRONTEND_DIR;else process.env.FRONTEND_DIR=anterior;await rm(carpeta,{recursive:true,force:true});}
});

test('un fallo de conexión conserva claves privadas distintas para reintentar',async()=>{
  const carpeta=await mkdtemp(join(tmpdir(),'valora-privado-')),archivo=join(carpeta,'users.txt');
  const pool={connect:async()=>{throw Error('Conexión interrumpida');}};
  try{
    await assert.rejects(aprovisionarEquipo(pool,archivo),/Conexión interrumpida/);
    const texto=await readFile(archivo,'utf8');
    const claves=[...texto.matchAll(/Contraseña: ([^\r\n]+)/g)].map(m=>m[1]);
    assert.equal(claves.length,15);assert.equal(new Set(claves).size,15);assert(claves.every(c=>c.length>=15));
    await assert.rejects(aprovisionarEquipo(pool,archivo),/Conexión interrumpida/);
    assert.equal(await readFile(archivo,'utf8'),texto);
  }finally{await rm(carpeta,{recursive:true,force:true});}
});

test('un archivo incompleto no se sobrescribe ni modifica cuentas',async()=>{
  const carpeta=await mkdtemp(join(tmpdir(),'valora-privado-')),archivo=join(carpeta,'users.txt');
  try{await writeFile(archivo,'Entrega incompleta');await assert.rejects(aprovisionarEquipo({},archivo),/incompleto/);assert.equal(await readFile(archivo,'utf8'),'Entrega incompleta');}
  finally{await rm(carpeta,{recursive:true,force:true});}
});
