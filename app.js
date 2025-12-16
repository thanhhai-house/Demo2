const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxIVh3b_8Tx1TT6WrFyTgZRSvSFLXM41zhAVjLa7jfjO76UBHirs5IC_1On6rOBx4BryQ/exec"; // .../exec

// ===== JSONP call (no CORS) =====
function api(action, data = {}) {
  return new Promise((resolve) => {
    const cb = "cb_" + Date.now() + "_" + Math.floor(Math.random()*1e6);
    window[cb] = (res) => {
      try { resolve(res); } finally {
        delete window[cb];
        script.remove();
      }
    };
    const url = new URL(GAS_WEBAPP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", cb);
    url.searchParams.set("data", encodeURIComponent(JSON.stringify(data)));

    const script = document.createElement("script");
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

const $ = (id) => document.getElementById(id);

let isAdmin = false;
let token = "";
let products = [];
let page = 1;
const pageSize = 100;
let total = 0;

function setRole(admin) {
  isAdmin = admin;
  $("rolePill").textContent = admin ? "ADMIN" : "GUEST";
  $("btnAdd").style.display = admin ? "inline-block" : "none";
  $("btnSave").disabled = !admin;
  $("btnDelete").disabled = !admin;
  $("btnUploadImage").disabled = !admin;
}

function openLogin() { $("loginModal").style.display = "flex"; $("adminTokenRow").style.display = "none"; }
function closeLogin() { $("loginModal").style.display = "none"; }

function openModal() { $("productModal").style.display = "flex"; }
function closeModal() { $("productModal").style.display = "none"; }

function money(n) { return Number(n || 0).toLocaleString("vi-VN"); }

function renderProducts() {
  $("productsTbody").innerHTML = products.map(p => `
    <tr>
      <td>${p.image ? `<img src="${p.image}" alt="img">` : ""}</td>
      <td><b>${p.oem}</b><div class="hint">ID: ${p.id}</div></td>
      <td>${p.ten}</td>
      <td>${p.loai}</td>
      <td>${p.brand}</td>
      <td>${money(p.price)}</td>
      <td>${p.oem_alts || ""}</td>
      <td><button class="btn" data-id="${p.id}">Chi tiết</button></td>
    </tr>
  `).join("");

  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  $("pageInfo").textContent = `Trang ${page}/${maxPage} • Tổng ${total.toLocaleString("vi-VN")} sản phẩm`;

  $("productsTbody").querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const p = products.find(x => String(x.id) === String(id));
      if (p) openDetail(p);
    });
  });
}

async function loadProducts(resetPage) {
  if (resetPage) page = 1;

  const res = await api("getProductsPaged", {
    search: $("search").value.trim(),
    brand: $("filterBrand").value.trim(),
    loai: $("filterLoai").value.trim(),
    page,
    pageSize,
    activeOnly: true
  });
  if (!res.ok) return alert("Lỗi load: " + (res.error || "unknown"));
  total = res.data.total || 0;
  products = res.data.items || [];
  renderProducts();
}

function fillModal(p, mode) {
  $("modalTitle").textContent = mode === "add" ? "Thêm sản phẩm" : "Chi tiết sản phẩm";
  $("modalHint").textContent = isAdmin ? "ADMIN: được sửa/xóa/upload ảnh." : "KHÁCH: chỉ xem.";

  $("p_id").value = p?.id || "";
  $("p_oem").value = p?.oem || "";
  $("p_oem_alts").value = p?.oem_alts || "";
  $("p_ten").value = p?.ten || "";
  $("p_dvt").value = p?.dvt || "";
  $("p_loai").value = p?.loai || "";
  $("p_brand").value = p?.brand || "";
  $("p_price").value = p?.price ?? "";
  $("p_image_url").value = p?.image || "";

  const img = (p?.image || "").trim();
  const imgEl = $("imgPreview");
  if (img) { imgEl.src = img; imgEl.style.display = "block"; }
  else { imgEl.src = ""; imgEl.style.display = "none"; }

  $("btnDelete").style.display = (isAdmin && p?.id) ? "inline-block" : "none";
}

function openDetail(p) {
  fillModal(p, "detail");
  openModal();
}

// ===== Local preview when choosing file =====
$("p_image_file").addEventListener("change", () => {
  const file = $("p_image_file").files?.[0];
  if (!file) return;
  const imgEl = $("imgPreview");
  imgEl.src = URL.createObjectURL(file);
  imgEl.style.display = "block";
});

// ===== Client resize/compress to keep upload light =====
async function fileToCompressedBase64(file, maxW = 1280, quality = 0.82) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const ratio = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", quality); // jpg nhẹ
  return dataUrl.split(",")[1]; // base64
}

// ===== Upload via popup (no CORS) =====
function uploadViaPopup({ token, name, mimeType, dataBase64 }) {
  return new Promise((resolve) => {
    const popup = window.open("", "uploadWin", "width=420,height=280");
    if (!popup) { alert("Trình duyệt chặn popup. Bật popup để upload ảnh."); return resolve({ ok:false, error:"POPUP_BLOCKED" }); }

    // listen message back
    const handler = (ev) => {
      if (!ev?.data || ev.data.type !== "UPLOAD_DONE") return;
      window.removeEventListener("message", handler);
      resolve(ev.data.data);
    };
    window.addEventListener("message", handler);

    // create form and submit to GAS doPost
    const form = document.createElement("form");
    form.method = "POST";
    form.action = GAS_WEBAPP_URL; // same /exec
    form.target = "uploadWin";

    const addField = (k, v) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    };

    addField("token", token);
    addField("name", name);
    addField("mimeType", mimeType);
    addField("dataBase64", dataBase64);

    document.body.appendChild(form);
    form.submit();
    form.remove();
  });
}

$("btnUploadImage").addEventListener("click", async () => {
  if (!isAdmin) return alert("Chỉ ADMIN mới upload ảnh.");
  const file = $("p_image_file").files?.[0];
  if (!file) return alert("Chọn ảnh trước (hoặc chụp camera).");

  // compress trước khi upload để không quá nặng
  const base64 = await fileToCompressedBase64(file);

  const res = await uploadViaPopup({
    token,
    name: file.name || `img_${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    dataBase64: base64
  });

  if (!res.ok) return alert("Upload lỗi: " + (res.error || "unknown"));
  $("p_image_url").value = res.url;
  $("imgPreview").src = res.url;
  $("imgPreview").style.display = "block";
  alert("Upload ảnh thành công!");
});

// ===== Save/Delete =====
$("btnSave").addEventListener("click", async () => {
  if (!isAdmin) return alert("KHÁCH không được lưu.");

  const payload = {
    token,
    id: $("p_id").value.trim(),
    oem: $("p_oem").value.trim(),
    oem_alts: $("p_oem_alts").value.trim(),
    ten: $("p_ten").value.trim(),
    dvt: $("p_dvt").value.trim(),
    loai: $("p_loai").value.trim(),
    brand: $("p_brand").value.trim(),
    price: Number($("p_price").value || 0),
    image: $("p_image_url").value.trim()
  };

  if (!payload.oem) return alert("Thiếu OEM");
  if (!payload.ten) return alert("Thiếu Tên");

  const action = payload.id ? "updateProduct" : "addProduct";
  const res = await api(action, payload);
  if (!res.ok) return alert("Lỗi: " + (res.error || "unknown"));

  alert("Đã lưu!");
  closeModal();
  await loadProducts(false);
});

$("btnDelete").addEventListener("click", async () => {
  if (!isAdmin) return;
  const id = $("p_id").value.trim();
  if (!id) return;
  if (!confirm("Xóa sản phẩm này?")) return;

  const res = await api("deleteProduct", { token, id });
  if (!res.ok) return alert("Lỗi: " + (res.error || "unknown"));

  alert("Đã xóa!");
  closeModal();
  await loadProducts(true);
});

// ===== UI events =====
$("btnClose").addEventListener("click", closeModal);

$("btnAdd").addEventListener("click", () => {
  fillModal({}, "add");
  openModal();
});

$("btnSearch").addEventListener("click", () => loadProducts(true));

$("btnPrev").addEventListener("click", async () => {
  page = Math.max(1, page - 1);
  await loadProducts(false);
});
$("btnNext").addEventListener("click", async () => {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(maxPage, page + 1);
  await loadProducts(false);
});

// ===== Login modal logic =====
$("pickGuest").addEventListener("click", () => $("adminTokenRow").style.display = "none");
$("pickAdmin").addEventListener("click", () => $("adminTokenRow").style.display = "block");

$("btnGuestEnter").addEventListener("click", () => {
  token = "";
  setRole(false);
  closeLogin();
});

$("btnAdminEnter").addEventListener("click", async () => {
  const t = $("loginAdminToken").value.trim();
  if (!t) return alert("Nhập token admin");

  const res = await api("verifyAdmin", { token: t });
  if (!res.ok || !res.isAdmin) return alert("Token sai hoặc chưa ACTIVE");

  token = t;
  setRole(true);
  closeLogin();
});

// ===== Open detail modal needs to be global callable for table buttons =====
function openDetail(p){ fillModal(p, "detail"); openModal(); }
window.openDetail = openDetail;

// ===== INIT =====
(function init() {
  openLogin();
  setRole(false);
  loadProducts(true);
})();
