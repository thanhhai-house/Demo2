// ====== CONFIG ======
const API_BASE = "https://script.google.com/macros/s/AKfycbyRD-D3grNs7e0gXHB0x9o15Dvt_3di0IKyUI-UCHIOl-8d5Q5S9TDj0K4qanoqsdzLqg/exec";

// ====== STATE ======
let token = "";
let role = "none"; // admin|guest|none
let products = [];
let current = null;
let currentMode = "view"; // view|edit|add
let uploadTemp = { dataBase64:"", mimeType:"", filename:"" };

const $ = (id) => document.getElementById(id);

// ====== UI ROLE ======
function setRoleUI() {
  const badge = $("roleBadge");
  badge.classList.remove("badge--admin","badge--guest");
  document.querySelectorAll(".adminOnly").forEach(el => el.style.display = (role === "admin" ? "" : "none"));

  if (role === "admin") { badge.textContent = "Admin"; badge.classList.add("badge--admin"); }
  else if (role === "guest") { badge.textContent = "Khách (chỉ xem)"; badge.classList.add("badge--guest"); }
  else { badge.textContent = "Chưa đăng nhập"; badge.classList.add("badge--guest"); }
}

// ====== API ======
async function apiGet(params) {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Network error");
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("Network error");
  return res.json();
}

// ====== AUTH ======
async function login() {
  token = $("tokenInput").value.trim();
  if (!token) return alert("Nhập token trước nhé.");
  const out = await apiGet({ action:"me", token });
  if (!out.ok) return alert(out.error || "UNAUTHORIZED");
  role = out.role;
  setRoleUI();
  await reload();
}

// ====== DATA ======
async function reload() {
  if (!token) return;
  const out = await apiGet({ action:"list", token });
  if (!out.ok) return alert(out.error || "Load fail");
  products = out.data || [];
  fillFilters(products);
  render();
}

function fillFilters(list) {
  const brands = ["Tất cả", ...Array.from(new Set(list.map(x => (x.brand||"").trim()).filter(Boolean))).sort()];
  const types  = ["Tất cả", ...Array.from(new Set(list.map(x => (x.type||"").trim()).filter(Boolean))).sort()];
  $("brandFilter").innerHTML = brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  $("typeFilter").innerHTML  = types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

function getFiltered() {
  const q = $("q").value.trim().toLowerCase();
  const b = $("brandFilter").value;
  const t = $("typeFilter").value;
  const s = $("stockFilter").value;

  return products.filter(p => {
    const hay = [p.id,p.name,p.oem,p.oem_alt,p.brand,p.type,p.info].join(" ").toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (b !== "Tất cả" && (p.brand||"") !== b) return false;
    if (t !== "Tất cả" && (p.type||"") !== t) return false;

    const total = Number(p.qty_kho||0) + Number(p.qty_cuahang||0);
    if (s === "in" && total <= 0) return false;
    if (s === "out" && total > 0) return false;
    return true;
  });
}

function render() {
  const list = getFiltered();
  $("tbody").innerHTML = list.map(p => rowHtml(p)).join("");
  $("emptyState").style.display = list.length ? "none" : "block";
}

function rowHtml(p) {
  const img = p.image_url
    ? `<img class="thumb" src="${escapeAttr(p.image_url)}" alt="img" loading="lazy">`
    : `<div class="thumb"></div>`;

  return `
    <tr>
      <td>${img}</td>
      <td><b>${escapeHtml(p.id)}</b></td>
      <td>${escapeHtml(p.name||"")}</td>
      <td>${escapeHtml(p.brand||"")}</td>
      <td>${escapeHtml(p.type||"")}</td>
      <td>${escapeHtml(p.oem||"")}</td>
      <td>${escapeHtml(p.oem_alt||"")}</td>
      <td class="right">${Number(p.price||0).toLocaleString()}</td>
      <td class="right">${Number(p.qty_kho||0)}</td>
      <td class="right">${Number(p.qty_cuahang||0)}</td>
      <td>
        <div class="actionsInline">
          <button class="btn btn--primary" onclick="openDetail('${escapeJs(p.id)}')">Chi tiết</button>
          ${role==="admin" ? `<button class="btn btn--success" onclick="openEdit('${escapeJs(p.id)}')">Sửa</button>` : ``}
        </div>
      </td>
    </tr>
  `;
}

function findById(id){ return products.find(x => x.id === id); }

// ====== MODAL ======
function showModal(){ $("modal").classList.remove("hidden"); }
function hideModal(){
  $("modal").classList.add("hidden");
  current = null; currentMode = "view";
  uploadTemp = { dataBase64:"", mimeType:"", filename:"" };
  $("imgFile").value = "";
}

function setReadonly(on){
  ["f_name","f_brand","f_type","f_oem","f_oem_alt","f_price","f_info","f_image_url"].forEach(k => $(k).readOnly = on);
  $("f_id").readOnly = true;
}

function paintModal(p, mode){
  currentMode = mode;
  current = JSON.parse(JSON.stringify(p || {}));

  $("modalTitle").textContent =
    mode==="add" ? "Thêm sản phẩm" :
    mode==="edit" ? "Sửa sản phẩm" : "Chi tiết sản phẩm";

  $("modalHint").textContent = current?.id ? `Mã: ${current.id}` : "Đang tạo sản phẩm...";

  $("f_id").value = current.id || "";
  $("f_name").value = current.name || "";
  $("f_brand").value = current.brand || "";
  $("f_type").value = current.type || "";
  $("f_oem").value = current.oem || "";
  $("f_oem_alt").value = current.oem_alt || "";
  $("f_price").value = Number(current.price || 0);
  $("f_info").value = current.info || "";
  $("f_image_url").value = current.image_url || "";

  $("s_kho").textContent = Number(current.qty_kho||0);
  $("s_ch").textContent = Number(current.qty_cuahang||0);

  const img = current.image_url || "";
  $("imgPreview").src = img || "";
  $("imgPreview").style.opacity = img ? "1" : ".25";

  // sản phẩm thay thế: oem_alt match oem
  const alts = String(current.oem_alt||"").split(",").map(x=>x.trim()).filter(Boolean);
  if (alts.length) {
    const matched = products.filter(pp => alts.some(a => String(pp.oem||"").trim() === a));
    $("altBox").innerHTML = `
      <div><b>Sản phẩm thay thế</b></div>
      <div class="tiny">Theo OEM thay thế: ${alts.map(escapeHtml).join(", ")}</div>
      <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
        ${matched.length ? matched.map(m => `
          <button class="btn" onclick="openDetail('${escapeJs(m.id)}')">
            ${escapeHtml(m.id)} - ${escapeHtml(m.name||"")}
          </button>
        `).join("") : `<div class="tiny">Chưa tìm thấy sản phẩm có OEM trùng.</div>`}
      </div>
    `;
    $("altBox").classList.remove("hidden");
  } else {
    $("altBox").classList.add("hidden");
    $("altBox").innerHTML = "";
  }

  if (role==="guest" || mode==="view") setReadonly(true);
  else setReadonly(false);
}

window.openDetail = (id) => {
  const p = findById(id);
  if (!p) return;
  paintModal(p, "view");
  showModal();
};

window.openEdit = (id) => {
  const p = findById(id);
  if (!p) return;
  paintModal(p, "edit");
  showModal();
};

// ====== ADD PRODUCT (backend tạo ID) ======
async function addProduct(){
  if (role !== "admin") return;

  // mở modal trước cho mượt
  paintModal({ id:"(đang tạo...)", qty_kho:0, qty_cuahang:0 }, "add");
  showModal();

  const product = readFormProduct_({ includeId:false });
  // tạo ở backend
  const out = await apiPost({ action:"createProduct", token, product });
  if (!out.ok) return alert(out.error || "createProduct fail");

  await reload();
  const p = findById(out.id);
  if (p) paintModal(p, "edit");
  alert("Đã tạo sản phẩm. ID do backend tạo.");
}

function readFormProduct_(opts){
  const includeId = opts?.includeId ?? true;
  const obj = {
    name: $("f_name").value.trim(),
    brand: $("f_brand").value.trim(),
    type: $("f_type").value.trim(),
    oem: $("f_oem").value.trim(),
    oem_alt: $("f_oem_alt").value.trim(),
    price: Number($("f_price").value || 0),
    info: $("f_info").value.trim(),
    image_url: $("f_image_url").value.trim(),
  };
  if (includeId) obj.id = $("f_id").value.trim();
  return obj;
}

// ====== SAVE (upsert) ======
async function saveProduct(){
  if (role !== "admin") return;

  const product = readFormProduct_({ includeId:true });
  if (!product.id || product.id.includes("đang")) return alert("Chưa có ID thật.");
  if (!product.name) return alert("Nhập Tên sản phẩm.");

  const out = await apiPost({ action:"upsertProduct", token, product });
  if (!out.ok) return alert(out.error || "upsert fail");

  await reload();
  const p = findById(product.id);
  if (p) paintModal(p, "edit");
  alert("Đã lưu.");
}

// ====== DELETE (confirm) ======
async function deleteProduct(){
  if (role !== "admin") return;
  const id = $("f_id").value.trim();
  const name = $("f_name").value.trim();
  if (!id) return;

  const ok = confirm(`XÁC NHẬN XÓA?\n\n${id} - ${name}\n\nSẽ xóa tồn kho (KHO + CỬA HÀNG).`);
  if (!ok) return;

  const out = await apiPost({ action:"deleteProduct", token, id });
  if (!out.ok) return alert(out.error || "delete fail");

  await reload();
  hideModal();
  alert("Đã xóa.");
}

// ====== STOCK: adjust ======
async function adjustStock(){
  if (role !== "admin") return;

  const id = $("f_id").value.trim();
  if (!id || id.includes("đang")) return alert("Chưa có ID thật.");

  const scope = $("adjScope").value; // KHO|CUAHANG|BOTH
  const qty = Number($("adjQty").value || 0);
  const type = $("adjType").value; // NHAP|XUAT
  const note = $("adjNote").value.trim();

  if (!qty) return alert("Nhập số lượng.");
  const delta = type === "NHAP" ? qty : -qty;

  const out = await apiPost({
    action:"adjustStock",
    token,
    payload: { id, scope, delta, note, label: type }
  });
  if (!out.ok) return alert(out.error || "adjust fail");

  await reload();
  const p = findById(id);
  if (p) paintModal(p, "edit");
  alert("Đã cập nhật tồn.");
}

// ====== STOCK: transfer ======
async function transferStock(){
  if (role !== "admin") return;

  const id = $("f_id").value.trim();
  if (!id || id.includes("đang")) return alert("Chưa có ID thật.");

  const from = $("trFrom").value;
  const to = $("trTo").value;
  const qty = Number($("trQty").value || 0);
  const note = $("trNote").value.trim();

  if (from === to) return alert("Từ và Sang phải khác nhau.");
  if (!qty || qty <= 0) return alert("Nhập số lượng chuyển.");

  const out = await apiPost({
    action:"transferStock",
    token,
    payload: { id, from, to, qty, note }
  });
  if (!out.ok) return alert(out.error || "transfer fail");

  await reload();
  const p = findById(id);
  if (p) paintModal(p, "edit");
  alert("Đã chuyển.");
}

// ====== IMAGE PREVIEW + OPTIONAL UPLOAD ======
async function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function onPickFile(){
  const f = $("imgFile").files?.[0];
  if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  $("imgPreview").src = dataUrl;
  $("imgPreview").style.opacity = "1";
  uploadTemp = { dataBase64: (dataUrl.split(",")[1]||""), mimeType: f.type, filename: f.name };
}

async function uploadImage(){
  if (role !== "admin") return;
  if (!uploadTemp.dataBase64) return alert("Chọn ảnh trước.");

  const out = await apiPost({ action:"uploadImage", token, payload: uploadTemp });
  if (!out.ok) return alert(out.error || "upload fail");

  // gán link Drive vào input
  $("f_image_url").value = out.image_url;
  $("imgPreview").src = out.image_url;
  alert("Upload OK. Link Drive đã điền vào Image URL.");
}

// ====== HELPERS ======
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function escapeJs(s){ return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'"); }

// ====== EVENTS ======
function wire(){
  $("btnLogin").onclick = ()=>login().catch(err=>alert(err.message));
  $("btnReload").onclick = ()=>reload().catch(err=>alert(err.message));

  ["q","brandFilter","typeFilter","stockFilter"].forEach(id=>{
    $(id).addEventListener("input", render);
    $(id).addEventListener("change", render);
  });

  $("btnAdd").onclick = ()=>addProduct().catch(err=>alert(err.message));

  $("btnSave").onclick = ()=>saveProduct().catch(err=>alert(err.message));
  $("btnDelete").onclick = ()=>deleteProduct().catch(err=>alert(err.message));
  $("btnCancel").onclick = hideModal;

  $("modalClose").onclick = hideModal;
  $("modalOverlay").onclick = hideModal;

  $("btnAdjust").onclick = ()=>adjustStock().catch(err=>alert(err.message));
  $("btnTransfer").onclick = ()=>transferStock().catch(err=>alert(err.message));

  $("imgFile").addEventListener("change", ()=>onPickFile().catch(err=>alert(err.message)));
  $("btnUpload").onclick = ()=>uploadImage().catch(err=>alert(err.message));

  setRoleUI();
}
wire();
