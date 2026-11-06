const $=s=>document.querySelector(s);
const api=async(url,opts={})=>{const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");return d};
const physical=[["Body / Frame","body_frame",["OK","Damage"]],["Display Glass","display_glass",["OK","Crack"]],["Back Panel","back_panel",["OK","Damage"]],["Camera Glass","camera_glass",["OK","Crack"]],["Screws / Seals","screws_seals",["OK","Missing"]],["Water / Rust Signs","water_rust",["No","Yes"]]];
const checkNames=["Display / LCD","Touch Screen","Battery / Backup","Charging / USB Port","Front Camera","Rear Camera","Earpiece / Receiver","Loud Speaker","Microphone","Vibration","Power Button","Volume Buttons","SIM 1 / SIM 2","Network / Signal","Wi-Fi","Bluetooth","GPS","Sensors / Proximity","Fingerprint","Face ID / Face Unlock","Wi-Fi Calling / Hotspot","Torch / Flash","Memory / Storage","Power On / Boot"];
let currentUser=null,savedId=null;
function buildControls(){
  $("#physicalFields").innerHTML=physical.map(([label,key,opts])=>`<label>${label}<select name="${key}"><option value="">Not checked</option>${opts.map(o=>`<option>${o}</option>`).join("")}</select></label>`).join("");
  $("#checksGrid").innerHTML=checkNames.map((n,i)=>`<div class="qc-item"><span>${n}</span><span class="qc-options">${["OK","Fault","N/A"].map(v=>`<label><input type="radio" name="check_${i}" value="${v}"> ${v}</label>`).join("")}</span></div>`).join("");
}
function formObject(){
 const f=$("#qcForm"),o={};new FormData(f).forEach((v,k)=>{if(k!=="record_id"&&k!=="accessories"&&!k.startsWith("check_"))o[k]=v});
 o.accessories=[...f.querySelectorAll('input[name="accessories"]:checked')].map(x=>x.value).join(", ");
 o.checks={};checkNames.forEach((n,i)=>{const v=f.querySelector(`input[name="check_${i}"]:checked`);if(v)o.checks[n]=v.value});
 o.estimate_amount=Number(o.estimate_amount||0);o.advance_payment=Number(o.advance_payment||0);
 o.balance_amount=Math.max(0,o.estimate_amount-o.advance_payment);
 return o;
}
function fillForm(r){
 const f=$("#qcForm");f.reset();savedId=r?.id||null;f.elements.record_id.value=savedId||"";
 if(!r)return;
 Object.entries(r).forEach(([k,v])=>{if(f.elements[k]&&typeof v!=="object")f.elements[k].value=v??""});
 const acc=String(r.accessories||"").split(", ");f.querySelectorAll('input[name="accessories"]').forEach(x=>x.checked=acc.includes(x.value));
 const checks=r.checks||{};checkNames.forEach((n,i)=>{const v=checks[n];if(v){const el=f.querySelector(`input[name="check_${i}"][value="${v}"]`);if(el)el.checked=true;}});
}
function showTab(tab){
  ["form","records","users"].forEach(t=>$("#"+t+"Tab").classList.toggle("hidden",t!==tab));
  document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  $("#pageTitle").textContent=({form:savedId?"Edit QC Record":"New QC Form",records:"Customer Records",users:"Staff & Access"})[tab];
}
function updateBalance(){
 const f=$("#qcForm");f.elements.balance_amount.value=Math.max(0,Number(f.elements.estimate_amount.value||0)-Number(f.elements.advance_payment.value||0)).toFixed(2);
}
async function saveRecord(){
 const data=formObject();if(!data.customer_name.trim())throw new Error("Customer name is required.");
 const id=$("#qcForm").elements.record_id.value;
 const r=await api(id?`/api/customers/${id}`:"/api/customers",{method:id?"PUT":"POST",body:JSON.stringify(data)});
 savedId=id||r.id;$("#qcForm").elements.record_id.value=savedId;return savedId;
}
function whatsappNumber(value){
 let n=String(value||"").replace(/\D/g,"");
 if(n.length===10)n="91"+n;
 return n;
}
function whatsappMessage(r){
 const lines=[
  "MS MOBILE SOLUTIONS",
  "QC & CUSTOMER SERVICE REPORT",
  "--------------------------------",
  `Customer Name: ${r.customer_name||"-"}`,
  `Customer Mobile: ${r.mobile_number||"-"}`,
  `Received Date: ${r.received_date||"-"}`,
  `Serial Number: ${r.serial_number||"-"}`,
  `Brand / Model: ${r.brand_model||"-"}`,
  `IMEI 1: ${r.imei1||"-"}`,
  `IMEI 2: ${r.imei2||"-"}`,
  `Device Type: ${r.device_type||"-"}`,
  "",
  "PHYSICAL CONDITION",
  ...physical.map(([label,key])=>`${label}: ${r[key]||"Not checked"}`),
  `Accessories: ${r.accessories||"-"}`,
  "",
  "FUNCTION / QC CHECKING",
  ...checkNames.map(n=>`${n}: ${(r.checks||{})[n]||"Not checked"}`),
  "",
  "COMPLAINT & REPAIR DETAILS",
  `Customer Complaint: ${r.complaint||"-"}`,
  `Technician Observation: ${r.technician_observation||"-"}`,
  `Work Required: ${r.work_required||"-"}`,
  "",
  "PAYMENT & DELIVERY",
  `Repair Estimate: Rs. ${Number(r.estimate_amount||0).toFixed(2)}`,
  `Advance Payment: Rs. ${Number(r.advance_payment||0).toFixed(2)}`,
  `Balance Amount: Rs. ${Number(r.balance_amount??(Number(r.estimate_amount||0)-Number(r.advance_payment||0))).toFixed(2)}`,
  `Repair Time: ${r.repair_time||"-"}`,
  `Delivery Date: ${r.delivery_date||"-"}`,
  `Repair Status: ${r.status||"Received"}`,
  `Received By / Technician: ${r.received_by||"-"}`,
  "",
  "Please contact MS Mobile Solutions if you have any questions. Thank you."
 ];
 return lines.join("\n");
}
function openWhatsApp(r){
 const number=whatsappNumber(r.mobile_number);
 if(!number||number.length<10)throw new Error("Customer mobile number is missing or invalid.");
 const url=`https://wa.me/${number}?text=${encodeURIComponent(whatsappMessage(r))}`;
 window.location.href=url;
}
async function shareCurrentRecord(){
 const popup=window.open("about:blank","_blank");
 try{
  await saveRecord();
  const data=formObject();
  const number=whatsappNumber(data.mobile_number);
  if(!number||number.length<10)throw new Error("Please enter a valid customer mobile number first.");
  const url=`https://wa.me/${number}?text=${encodeURIComponent(whatsappMessage(data))}`;
  if(popup)popup.location.href=url;else window.location.href=url;
  $("#formMessage").textContent="Record saved. WhatsApp is opening; review the message and press Send.";
 }catch(err){if(popup)popup.close();$("#formMessage").textContent=err.message;}
}
async function loadRecords(){
 const q=encodeURIComponent($("#searchBox").value.trim());const rows=await api("/api/customers?q="+q);
 $("#recordsBody").innerHTML=rows.map(r=>`<tr><td>${r.id}</td><td>${esc(r.customer_name)}</td><td>${esc(r.mobile_number||"")}</td><td>${esc(r.brand_model||"")}</td><td>${esc(r.received_date||"")}</td><td>${esc(r.delivery_date||"")}</td><td><span class="status">${esc(r.status||"Received")}</span></td><td>₹${Number(r.estimate_amount||0).toFixed(2)}</td><td><button class="secondary table-action" data-edit="${r.id}">Open</button><button class="whatsapp-btn table-action" data-whatsapp="${r.id}" type="button">WhatsApp</button>${currentUser.role==="admin"?`<button class="ghost table-action" data-delete="${r.id}">Delete</button>`:""}</td></tr>`).join("")||'<tr><td colspan="9">No customer records found.</td></tr>';
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function loadUsers(){
 const rows=await api("/api/users");$("#usersBody").innerHTML=rows.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.role}</td><td>${u.active?"Active":"Disabled"}</td><td><button class="secondary table-action" data-toggle-user="${u.id}" data-active="${u.active?0:1}">${u.active?"Disable":"Enable"}</button></td></tr>`).join("");
}
async function startApp(){
 const d=await api("/api/me");if(!d.user){$("#loginView").classList.remove("hidden");$("#appView").classList.add("hidden");return;}
 currentUser=d.user;$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
 $("#who").textContent=`${currentUser.name} · ${currentUser.role}`;
 if(currentUser.role==="admin")document.body.classList.add("admin");else document.body.classList.remove("admin");
 fillForm(null);showTab("form");
}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";const fd=new FormData(e.target);try{await api("/api/login",{method:"POST",body:JSON.stringify(Object.fromEntries(fd))});await startApp();}catch(err){$("#loginError").textContent=err.message;}});
$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});currentUser=null;await startApp();};
document.querySelectorAll(".nav").forEach(b=>b.onclick=async()=>{showTab(b.dataset.tab);if(b.dataset.tab==="records")await loadRecords();if(b.dataset.tab==="users")await loadUsers();});
$("#qcForm").addEventListener("submit",async e=>{e.preventDefault();try{await saveRecord();$("#formMessage").textContent="Saved successfully. Record ID: "+savedId;$("#pageTitle").textContent="Edit QC Record";}catch(err){$("#formMessage").textContent=err.message;}});
$("#savePdf").onclick=async()=>{try{await saveRecord();$("#formMessage").textContent="Saved. Opening A4 print / PDF…";window.print();}catch(err){$("#formMessage").textContent=err.message;}};
$("#shareWhatsApp").onclick=shareCurrentRecord;
$("#resetForm").onclick=()=>{fillForm(null);$("#formMessage").textContent="New blank form ready.";showTab("form");};
$("#newRecordBtn").onclick=()=>{fillForm(null);showTab("form");};
$("#searchBtn").onclick=loadRecords;$("#searchBox").addEventListener("keydown",e=>{if(e.key==="Enter")loadRecords();});
$("#recordsBody").addEventListener("click",async e=>{
 const edit=e.target.dataset.edit,del=e.target.dataset.delete,wa=e.target.dataset.whatsapp;
 if(edit){const r=await api("/api/customers/"+edit);fillForm(r);showTab("form");}
 if(wa){
  const popup=window.open("about:blank","_blank");
  try{const r=await api("/api/customers/"+wa);const number=whatsappNumber(r.mobile_number);if(!number||number.length<10)throw new Error("Customer mobile number is missing or invalid.");const url=`https://wa.me/${number}?text=${encodeURIComponent(whatsappMessage(r))}`;if(popup)popup.location.href=url;else window.location.href=url;}
  catch(err){if(popup)popup.close();alert(err.message);}
 }
 if(del&&confirm("Permanently delete this customer record?")){await api("/api/customers/"+del,{method:"DELETE"});await loadRecords();}
});
$("#qcForm").elements.estimate_amount.addEventListener("input",updateBalance);
$("#qcForm").elements.advance_payment.addEventListener("input",updateBalance);
$("#userForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/users",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();await loadUsers();alert("User login created.");}catch(err){alert(err.message);}});
$("#usersBody").addEventListener("click",async e=>{const id=e.target.dataset.toggleUser;if(id){await api("/api/users/"+id,{method:"PATCH",body:JSON.stringify({active:Number(e.target.dataset.active)})});await loadUsers();}});
buildControls();startApp().catch(()=>{});
