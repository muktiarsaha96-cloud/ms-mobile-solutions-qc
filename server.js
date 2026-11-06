require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || "./data/ms-mobile-qc.sqlite";
const dbFile = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Set SESSION_SECRET to a random string of at least 32 characters.");
}
const SESSION_SECRET = process.env.SESSION_SECRET || "development-only-change-this-secret";

const db = new sqlite3.Database(dbFile);
const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve(this)}));
const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)));
const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows)));

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')),
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, mobile_number TEXT,
    serial_number TEXT, received_date TEXT, brand_model TEXT, delivery_date TEXT,
    imei1 TEXT, imei2 TEXT, device_type TEXT, body_frame TEXT, display_glass TEXT,
    back_panel TEXT, camera_glass TEXT, screws_seals TEXT, water_rust TEXT,
    accessories TEXT, checks_json TEXT NOT NULL DEFAULT '{}', complaint TEXT,
    technician_observation TEXT, work_required TEXT, estimate_amount REAL DEFAULT 0,
    advance_payment REAL DEFAULT 0, balance_amount REAL DEFAULT 0, repair_time TEXT,
    received_by TEXT, customer_signature TEXT, technician_signature TEXT, status TEXT NOT NULL DEFAULT 'Received',
    created_by INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile_number)`);
  const admin = await get("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!admin) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "ChangeThisStrongPassword123!";
    const hash = await bcrypt.hash(password, 12);
    await run("INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,'admin')",
      [process.env.ADMIN_NAME || "MS Admin", username, hash]);
    console.log(`Initial admin created. Username: ${username}. Change the password after first login.`);
  }
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false}));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.dirname(dbFile) }),
  secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
const loginLimiter = rateLimit({windowMs:15*60*1000, max:10, standardHeaders:true, legacyHeaders:false});
const safeUser = u => ({id:u.id,name:u.name,username:u.username,role:u.role});
function auth(req,res,next){ if(!req.session.user) return res.status(401).json({error:"Please sign in."}); next(); }
function adminOnly(req,res,next){ if(req.session.user?.role!=="admin") return res.status(403).json({error:"Admin access required."}); next(); }

app.post("/api/login", loginLimiter, async (req,res)=>{
  try {
    const {username,password}=req.body||{};
    if(!username||!password) return res.status(400).json({error:"Enter username and password."});
    const u=await get("SELECT * FROM users WHERE username=? AND active=1",[String(username).trim()]);
    if(!u || !(await bcrypt.compare(String(password),u.password_hash))) return res.status(401).json({error:"Incorrect login details."});
    req.session.regenerate(err=>{
      if(err) return res.status(500).json({error:"Could not start session."});
      req.session.user=safeUser(u);
      res.json({user:req.session.user});
    });
  } catch(e){res.status(500).json({error:"Login failed."});}
});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));

const allowed = [
"customer_name","mobile_number","serial_number","received_date","brand_model","delivery_date","imei1","imei2","device_type",
"body_frame","display_glass","back_panel","camera_glass","screws_seals","water_rust","accessories",
"complaint","technician_observation","work_required","estimate_amount","advance_payment","balance_amount","repair_time","received_by","customer_signature","technician_signature","status"
];
function cleanPayload(body) {
  const out={};
  for(const k of allowed) if(body[k]!==undefined) out[k]=body[k];
  out.customer_name=String(out.customer_name||"").trim();
  out.checks_json=JSON.stringify(body.checks && typeof body.checks==="object" ? body.checks : {});
  for(const k of ["estimate_amount","advance_payment","balance_amount"]) {
    if(out[k]!==undefined) out[k]=Math.max(0,Number(out[k])||0);
  }
  if(!out.customer_name) throw new Error("Customer name is required.");
  return out;
}
app.get("/api/customers",auth,async(req,res)=>{
  try {
    const q=String(req.query.q||"").trim();
    const rows=q
      ? await all(`SELECT c.*,u.name AS creator_name FROM customers c LEFT JOIN users u ON u.id=c.created_by
          WHERE c.customer_name LIKE ? OR c.mobile_number LIKE ? OR c.serial_number LIKE ? OR c.imei1 LIKE ? OR c.imei2 LIKE ?
          ORDER BY c.id DESC LIMIT 300`,Array(5).fill(`%${q}%`))
      : await all(`SELECT c.*,u.name AS creator_name FROM customers c LEFT JOIN users u ON u.id=c.created_by ORDER BY c.id DESC LIMIT 300`);
    res.json(rows.map(r=>({...r,checks:JSON.parse(r.checks_json||"{}")})));
  } catch(e){res.status(500).json({error:"Could not load customer records."});}
});
app.get("/api/customers/:id",auth,async(req,res)=>{
  const row=await get("SELECT * FROM customers WHERE id=?",[req.params.id]);
  if(!row) return res.status(404).json({error:"Record not found."});
  row.checks=JSON.parse(row.checks_json||"{}"); delete row.checks_json; res.json(row);
});
app.post("/api/customers",auth,async(req,res)=>{
  try {
    const p=cleanPayload(req.body);
    const cols=[...Object.keys(p),"created_by"], vals=[...Object.values(p),req.session.user.id];
    const result=await run(`INSERT INTO customers(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`,vals);
    res.json({id:result.lastID});
  } catch(e){res.status(400).json({error:e.message||"Could not save record."});}
});
app.put("/api/customers/:id",auth,async(req,res)=>{
  try {
    const p=cleanPayload(req.body);
    const cols=[...Object.keys(p),"updated_at"];
    const vals=[...Object.values(p),"CURRENT_TIMESTAMP",req.params.id];
    const sql=`UPDATE customers SET ${Object.keys(p).map(k=>`${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`;
    const result=await run(sql,[...Object.values(p),req.params.id]);
    if(!result.changes) return res.status(404).json({error:"Record not found."});
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message||"Could not update record."});}
});
app.delete("/api/customers/:id",auth,adminOnly,async(req,res)=>{
  await run("DELETE FROM customers WHERE id=?",[req.params.id]); res.json({ok:true});
});

// Staff accounts are administered by the owner/admin.
app.get("/api/users",auth,adminOnly,async(req,res)=>{
  res.json(await all("SELECT id,name,username,role,active,created_at FROM users ORDER BY id"));
});
app.post("/api/users",auth,adminOnly,async(req,res)=>{
  try {
    const {name,username,password,role}=req.body||{};
    if(!name||!username||!password||String(password).length<10||!["admin","staff"].includes(role))
      return res.status(400).json({error:"Enter name, username, role and a password of at least 10 characters."});
    const hash=await bcrypt.hash(String(password),12);
    const r=await run("INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)",
      [String(name).trim(),String(username).trim(),hash,role]);
    res.json({id:r.lastID});
  } catch(e){res.status(400).json({error:"Username may already exist."});}
});
app.patch("/api/users/:id",auth,adminOnly,async(req,res)=>{
  const {active,password}=req.body||{};
  if(password){
    if(String(password).length<10) return res.status(400).json({error:"Password must be at least 10 characters."});
    await run("UPDATE users SET password_hash=? WHERE id=?",[await bcrypt.hash(String(password),12),req.params.id]);
  }
  if(active!==undefined) await run("UPDATE users SET active=? WHERE id=?",[active?1:0,req.params.id]);
  res.json({ok:true});
});
app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
initDb().then(()=>app.listen(PORT,()=>console.log(`MS Mobile QC running on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
