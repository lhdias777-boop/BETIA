const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, DB=path.join(__dirname,'data.json');
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||'admin@iabet.local';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'troque-esta-senha';
const SECRET=process.env.IABET_SECRET||'dev-secret-change-me';
if(!fs.existsSync(DB)) fs.writeFileSync(DB,JSON.stringify({users:[],deposits:[],bets:[],sessions:[],gateway:{provider:'',baseUrl:'',apiKey:'',webhookSecret:'',live:false}},null,2));
const read=()=>JSON.parse(fs.readFileSync(DB,'utf8')); const write=d=>fs.writeFileSync(DB,JSON.stringify(d,null,2));
const hash=(p,s=crypto.randomBytes(16).toString('hex'))=>({salt:s,hash:crypto.scryptSync(p,s,64).toString('hex')});
const verify=(p,u)=>{try{return crypto.timingSafeEqual(Buffer.from(hash(p,u.salt).hash,'hex'),Buffer.from(u.hash,'hex'))}catch{return false}};
const tok=(kind,id)=>Buffer.from(`${kind}:${id}:${SECRET}`).toString('base64url');
const auth=(req)=>{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const a=Buffer.from(h.slice(7),'base64url').toString().split(':');if(a.length<3||a[2]!==SECRET)return null;return {kind:a[0],id:a[1]}};
const send=(res,s,d,type='application/json')=>{res.writeHead(s,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(d):d)};
const body=req=>new Promise((ok,no)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){no(e)}})});
const user=(req)=>{const a=auth(req);if(!a||a.kind!=='user')return null;return read().users.find(u=>u.id===a.id)||null};
const admin=(req)=>{const a=auth(req);return a&&a.kind==='admin'&&a.id==='admin'};
function ensureAdmin(){const d=read();if(!d.users.some(u=>u.email===ADMIN_EMAIL)){const h=hash(ADMIN_PASSWORD);d.users.push({id:'admin',email:ADMIN_EMAIL,role:'admin',...h,balance:0});write(d)}}
ensureAdmin();

function qrSvg(text){ // visual QR-like placeholder for sandbox; real PSP QR should replace this.
 const size=210, cells=21, cell=10, seed=crypto.createHash('sha256').update(text).digest();
 let bits=[]; for(let i=0;i<cells*cells;i++) bits.push(((seed[Math.floor(i/8)%seed.length]>>(i%8))&1)===1);
 function finder(x,y){for(let j=0;j<7;j++)for(let i=0;i<7;i++){const edge=i===0||i===6||j===0||j===6,mid=i>=2&&i<=4&&j>=2&&j<=4;bits[(y+j)*cells+x+i]=edge||mid}}
 finder(0,0);finder(14,0);finder(0,14);
 let r=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/>`;
 for(let y=0;y<cells;y++)for(let x=0;x<cells;x++)if(bits[y*cells+x])r+=`<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}" fill="#111"/>`;
 return r+'</svg>';
}

const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/'){return send(res,200,fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8'),'text/html;charset=utf-8')}
  if(req.method==='GET'&&req.url==='/api/qr.svg'){const a=auth(req); if(!a)return send(res,401,{error:'Não autenticado'}); return send(res,200,qrSvg('IABET-SANDBOX-'+Date.now()),'image/svg+xml')}
  if(req.method==='POST'&&req.url==='/api/register'){const b=await body(req),d=read(),email=String(b.email||'').toLowerCase();if(!email||String(b.password||'').length<6)return send(res,400,{error:'Informe e-mail e senha com 6+ caracteres.'});if(d.users.some(u=>u.email===email))return send(res,409,{error:'E-mail já cadastrado.'});const id=crypto.randomUUID(),h=hash(b.password);d.users.push({id,email,...h,balance:0,role:'user'});write(d);return send(res,201,{token:tok('user',id)})}
  if(req.method==='POST'&&req.url==='/api/login'){const b=await body(req),d=read(),email=String(b.email||'').toLowerCase(),u=d.users.find(x=>x.email===email);if(!u||!verify(String(b.password||''),u))return send(res,401,{error:'Login inválido.'});return send(res,200,{token:tok(u.role==='admin'?'admin':'user',u.id),role:u.role})}
  if(req.method==='GET'&&req.url==='/api/me'){const u=user(req);if(!u)return send(res,401,{error:'Não autenticado'});return send(res,200,{id:u.id,email:u.email,balance:u.balance})}
  if(req.method==='POST'&&req.url==='/api/deposits'){const u=user(req);if(!u)return send(res,401,{error:'Faça login'});const b=await body(req),amount=Number(b.amount);if(!Number.isFinite(amount)||amount<=0)return send(res,400,{error:'Valor inválido'});const d=read(),dep={id:crypto.randomUUID(),userId:u.id,amount,status:'PENDING',createdAt:new Date().toISOString(),qrPayload:'IABET-SANDBOX-'+crypto.randomUUID()};d.deposits.push(dep);write(d);return send(res,201,{id:dep.id,amount:dep.amount,status:dep.status,qr:'/api/qr.svg'})}
  // Sandbox payment confirmation: simulates the PSP webhook. It credits balance and, if a pending bet is attached,
  // changes the bet to CONFIRMED and emits the same event the chat would show.
  if(req.method==='POST'&&req.url==='/api/sandbox/confirm-deposit'){const u=user(req);if(!u)return send(res,401,{error:'Faça login'});const b=await body(req),d=read(),dep=d.deposits.find(x=>x.id===b.depositId&&x.userId===u.id);if(!dep)return send(res,404,{error:'Depósito não encontrado'});if(dep.status!=='PENDING')return send(res,400,{error:'Depósito já processado'});dep.status='PAID';u.balance+=dep.amount;let confirmed=null;const bet=d.bets.find(x=>x.userId===u.id&&x.status==='AWAITING_DEPOSIT'&&Math.abs(x.stake-dep.amount)<0.001);if(bet){bet.status='CONFIRMED';bet.confirmedAt=new Date().toISOString();confirmed=bet}write(d);return send(res,200,{balance:u.balance,deposit:dep,bet:confirmed})}
  if(req.method==='POST'&&req.url==='/api/bets'){const u=user(req);if(!u)return send(res,401,{error:'Faça login'});const b=await body(req),stake=Number(b.stake),odd=Number(b.odd);if(!b.selection||stake<=0||odd<=1)return send(res,400,{error:'Dados inválidos'});const d=read(),bet={id:crypto.randomUUID(),userId:u.id,selection:String(b.selection),odd,stake,status:'AWAITING_DEPOSIT',createdAt:new Date().toISOString()};d.bets.push(bet);write(d);return send(res,201,{bet,requiredDeposit:stake})}
  if(req.method==='GET'&&req.url==='/api/history'){const u=user(req);if(!u)return send(res,401,{error:'Faça login'});const d=read();return send(res,200,{deposits:d.deposits.filter(x=>x.userId===u.id).slice(-30).reverse(),bets:d.bets.filter(x=>x.userId===u.id).slice(-30).reverse()})}
  if(req.method==='POST'&&req.url==='/api/cashout'){return send(res,403,{error:'Cash out está desativado nesta versão.'})}
  if(req.method==='GET'&&req.url==='/api/admin/gateway'){if(!admin(req))return send(res,403,{error:'Acesso administrativo negado'});const d=read();const g=d.gateway||{};return send(res,200,{provider:g.provider||'',baseUrl:g.baseUrl||'',live:!!g.live})}
  if(req.method==='POST'&&req.url==='/api/admin/gateway'){if(!admin(req))return send(res,403,{error:'Acesso administrativo negado'});const b=await body(req),d=read();d.gateway={provider:String(b.provider||''),baseUrl:String(b.baseUrl||''),apiKey:String(b.apiKey||''),webhookSecret:String(b.webhookSecret||''),live:!!b.live};write(d);return send(res,200,{ok:true})}
  if(req.method==='GET'&&req.url==='/api/admin/summary'){if(!admin(req))return send(res,403,{error:'Acesso administrativo negado'});const d=read();return send(res,200,{users:d.users.filter(u=>u.role!=='admin').length,deposits:d.deposits.length,bets:d.bets.length,pending:d.deposits.filter(x=>x.status==='PENDING').length,confirmed:d.bets.filter(x=>x.status==='CONFIRMED').length})}
  if(req.method==='GET'&&req.url==='/api/admin/bets'){if(!admin(req))return send(res,403,{error:'Acesso administrativo negado'});const d=read();return send(res,200,d.bets.slice(-100).reverse())}
  send(res,404,{error:'Rota não encontrada'});
 }catch(e){send(res,500,{error:'Erro interno'})}
});
server.listen(PORT,()=>console.log(`IABET sandbox: http://localhost:${PORT}`));
