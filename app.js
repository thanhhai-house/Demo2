const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzlWL5dyWSf_JEMzeYyz1x3xaOA-LLUr2jImq8lwRjcZj4PKqoldbuoaslIDcrdJXceMg/exec';

const S = {
  role: null,     // 'guest' | 'admin'
  session: null,  // admin session từ Apps Script
  kho: [],
  shop: [],
  history: [],
  trash: [],
  chart: [],
  place: 'KHO',
  current: null,
  chartObj: null,
};

const $ = (id) => document.getElementById(id);

const UI = {
  show(el){ $(el).style.display='flex'; },
  hide(el){ $(el).style.display='none'; },

  openLogin(){ UI.show('loginModal'); },
  closeLogin(){ UI.hide('loginModal'); },

  closeDetail(){ UI.hide('detailModal'); },
  closeAdd(){ UI.hide('addModal'); },
  closeHistory(){ UI.hide('historyModal'); },
  closeTrash(){ UI.hide('trashModal'); },

  printBill(){
    const q = Number($('qty').value||0);
    if (!q || q<=0) return alert('Nhập số lượng > 0');
    const total = q * Number(S.current.gia||0);

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><meta charset="utf-8"><title>Bill</title>
      <style>
        body{font-family:Arial;padding:20px}
        h2{margin:0 0 10px}
        .box{border:1px solid #ddd;padding:14px;border-radius:10px}
        .row{display:flex;justify-content:space-between;margin:6px 0}
        .muted{color:#555}
      </style></head><body>
      <h2>HÓA ĐƠN BÁN HÀNG</h2>
      <div class="muted">${new Date().toLocaleString()}</div>
      <div class="box">
        <div class="row"><div>Tên</div><div><b>${esc(S.current.ten)}</b></div></div>
        <div class="row"><div>OEM</div><div>${esc(S.current.oem)}</div></div>
        <div class="row"><div>Số lượng</div><div>${q}</div></div>
        <div class="row"><div>Đơn giá</div><div>${money(S.current.gia)}</div></div>
        <hr/>
        <div class="row"><div><b>Tổng</b></div><div><b>${money(total)}</b></div></div>
      </div>
      <p class="muted">Cảm ơn quý khách!</p>
      <script>window.print();</script>
      </body></html>
    `);
    w.document.close();
  }
};

const API = {
  async getPublic(){
    const r = await fetch(`${APP_SCRIPT_URL}?action=publicGet`);
    return r.json();
  },
  async getAdmin(){
    const r = await fetch(`${APP_SCRIPT_URL}?action=adminGet&session=${encodeURIComponent(S.session)}`);
    return r.json();
  },
  async post(payload){
    const r = await fetch(APP_SCRIPT_URL, { method:'POST', body: JSON.stringify(payload) });
    return r.json();
  },

  async loginAdmin(name, token){
    return API.post({ action:'login', name, token });
  },

  mustAdmin(){
    if (S.role !== 'admin' || !S.session) throw new Error('Not admin');
  },
  qty(){
    const q = Number($('qty').value||0);
    if (!q || q<=0) { alert('Nhập số lượng > 0'); return null; }
    return q;
  },

  async nhap(noi){
    API.mustAdmin();
    const q = API.qty(); if(!q) return;
    const res = await API.post({ action:'changeStock', session:S.session, noi, id:S.current.id, sl:q });
    if(res.error) return alert(res.error);
    location.reload();
  },
  async xuat(noi){
    API.mustAdmin();
    const q = API.qty(); if(!q) return;
    const res = await API.post({ action:'changeStock', session:S.session, noi, id:S.current.id, sl:-q });
    if(res.error) return alert(res.error);
    location.reload();
  },
  async transfer(from,to){
    API.mustAdmin();
    const q = API.qty(); if(!q) return;
    const res = await API.post({ action:'transfer', session:S.session, id:S.current.id, sl:q, from, to });
    if(res.error) return alert(res.error);
    location.reload();
  },
  async sell(){
    API.mustAdmin();
    const q = API.qty(); if(!q) return;
    const res = await API.post({ action:'sell', session:S.session, id:S.current.id, sl:q });
    if(res.error) return alert(res.error);
    location.reload();
  },

  async deleteSoft(){
    API.mustAdmin();
    const oem = String(S.current.oem||'').trim();
    const confirmOem = prompt(`XÁC NHẬN XÓA MỀM: gõ đúng OEM = ${oem}`);
    if(!confirmOem) return;
    const res = await API.post({ action:'deleteSoft', session:S.session, id:S.current.id, confirm_oem:confirmOem.trim(), note:'Xóa mềm trên web' });
    if(res.error) return alert(res.error);
    alert('Đã xóa mềm → vào thùng rác');
    location.reload();
  },

  async restore(trashRow, oem){
    API.mustAdmin();
    const confirmOem = prompt(`XÁC NHẬN KHÔI PHỤC: gõ đúng OEM = ${oem}`);
    if(!confirmOem) return;
    const res = await API.post({ action:'restore', session:S.session, trash_row:trashRow, confirm_oem:confirmOem.trim() });
    if(res.error) return alert(res.error);
    alert('Khôi phục thành công');
    location.reload();
  },

  // ✅ ID DO WEB TỰ TẠO: tạo ID ở frontend, gửi lên addProduct
  genId(){
    // dạng: P-<timestamp>-<random>
    return `P-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  },

  async saveProduct(){
    API.mustAdmin();

    const f = $('a_img').files?.[0];
    if(!f) return alert('Chọn ảnh (có thể chụp trực tiếp)');

    const ten = $('a_ten').value.trim();
    const oem = $('a_oem').value.trim();
    if(!ten || !oem) return alert('Thiếu Tên hoặc OEM');

    const base64 = await fileToDataURL(f);

    const up = await API.post({
      action:'uploadImage',
      session:S.session,
      base64,
      filename:`phutung_${Date.now()}_${f.name||'img'}`
    });
    if(up.error) return alert(up.error);

    const payload = {
      action:'addProduct',
      session:S.session,
      noi:$('a_noi').value,

      // ✅ id web tự tạo
      id: API.genId(),

      ten,
      oem,
      oem_thay_the:$('a_oemtt').value.trim(),
      thuong_hieu:$('a_brand').value.trim(),
      loai:$('a_loai').value.trim(),
      thong_tin:$('a_info').value.trim(),
      gia:Number($('a_gia').value||0),
      so_luong:Number($('a_sl').value||0),
      hinh_anh: up.url
    };

    const res = await API.post(payload);
    if(res.error) return alert(res.error);

    // ✅ thông báo + reset form (không reload)
    alert('✅ Thêm sản phẩm thành công!');

    $('a_ten').value=''; $('a_oem').value=''; $('a_oemtt').value='';
    $('a_brand').value=''; $('a_loai').value=''; $('a_gia').value='';
    $('a_sl').value=''; $('a_info').value=''; $('a_img').value='';
    $('a_preview').src=''; $('a_preview').style.display='none';

    // ✅ refresh dữ liệu để thấy sản phẩm mới ngay
    const data = await API.getAdmin();
    if(!data.error){
      S.kho = data.kho || [];
      S.shop = data.cuahang || [];
      S.chart = data.chart || [];
      S.history = data.history || [];
      S.trash = data.trash || [];
      renderList();
      drawChart();
    }
  }
};

init();

function init(){
  UI.openLogin();

  $('guestBtn').onclick = async () => {
    S.role = 'guest';
    UI.closeLogin();
    await loadData();
  };

  $('adminBtn').onclick = () => { $('adminForm').style.display = 'block'; };

  $('loginBtn').onclick = async () => {
    const name = $('adminName').value.trim();
    const token = $('adminToken').value.trim();
    const res = await API.loginAdmin(name, token);
    if(!res.success) return alert('Sai tên hoặc token!');
    S.role = 'admin';
    S.session = res.session;
    UI.closeLogin();
    await loadData();
  };

  $('btnLogout').onclick = () => {
    S.role = null; S.session = null;
    $('adminName').value=''; $('adminToken').value='';
    $('adminForm').style.display='none';
    UI.openLogin();
  };

  $('search').oninput = renderList;
  $('place').onchange = (e)=>{ S.place = e.target.value; renderList(); };

  $('btnAdd').onclick = () => UI.show('addModal');
  $('btnHistory').onclick = () => { renderHistory(); UI.show('historyModal'); };
  $('btnTrash').onclick = () => { renderTrash(); UI.show('trashModal'); };

  $('a_img').onchange = () => {
    const f = $('a_img').files?.[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = () => { $('a_preview').src = r.result; $('a_preview').style.display='block'; };
    r.readAsDataURL(f);
  };
}

async function loadData(){
  let data;
  if(S.role === 'admin'){
    data = await API.getAdmin();
    if(data.error){
      alert('Phiên admin hết hạn. Đăng nhập lại.');
      S.role=null; S.session=null; UI.openLogin();
      return;
    }
    $('btnAdd').hidden = false;
    $('btnHistory').hidden = false;
    $('btnTrash').hidden = false;
  } else {
    data = await API.getPublic();
    $('btnAdd').hidden = true;
    $('btnHistory').hidden = true;
    $('btnTrash').hidden = true;
  }

  S.kho = data.kho || [];
  S.shop = data.cuahang || [];
  S.chart = data.chart || [];
  S.history = data.history || [];
  S.trash = data.trash || [];

  renderList();
  drawChart();
}

function renderList(){
  const kw = ($('search').value||'').trim().toLowerCase();
  const arr = (S.place === 'CUAHANG' ? S.shop : S.kho).filter(p=>{
    if(!kw) return true;
    return [p.oem,p.ten,p.thuong_hieu,p.loai,p.oem_thay_the].some(x=>String(x||'').toLowerCase().includes(kw));
  });

  $('list').innerHTML = arr.map(p=>`
    <div class="card">
      <img src="${p.hinh_anh||''}" alt="">
      <div class="p">
        <div class="name">${esc(p.ten)}</div>
        <p class="meta">OEM: ${esc(p.oem)}</p>
        <p class="meta">Giá: ${money(p.gia)} | SL: ${p.so_luong}</p>
        <div class="row">
          <button class="btn" onclick="openDetail('${encodeURIComponent(JSON.stringify(p))}')">Chi tiết</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.openDetail = (encoded) => {
  const p = JSON.parse(decodeURIComponent(encoded));
  S.current = p;

  $('d_img').src = p.hinh_anh || '';
  $('d_name').innerText = p.ten || '';
  $('d_oem').innerText = p.oem || '';
  $('d_oemtt').innerText = p.oem_thay_the || '';
  $('d_gia').innerText = money(p.gia);

  const inKho = S.kho.find(x=>String(x.id)===String(p.id));
  const inShop= S.shop.find(x=>String(x.id)===String(p.id));
  $('d_kho').innerText = inKho ? inKho.so_luong : 0;
  $('d_shop').innerText = inShop ? inShop.so_luong : 0;

  $('adminActions').hidden = (S.role !== 'admin');
  $('qty').value = '';

  renderAlternatives();
  UI.show('detailModal');
};

function renderAlternatives(){
  const p = S.current;
  const myOem = String(p.oem||'').trim();
  const myAlt = splitOems(p.oem_thay_the);

  const all = S.kho.concat(S.shop);
  const alts = all.filter(x=>{
    if(String(x.id)===String(p.id)) return false;
    const oem = String(x.oem||'').trim();
    const xAlt = splitOems(x.oem_thay_the);
    return (oem && (myAlt.includes(oem) || xAlt.includes(myOem) || oem===myOem));
  });

  $('altList').innerHTML = alts.length
    ? alts.map(x=>`<li>${esc(x.ten)} — ${money(x.gia)} (OEM: ${esc(x.oem)})</li>`).join('')
    : `<li>Không có dữ liệu thay thế</li>`;
}

function renderHistory(){
  const rows = (S.history||[]).slice().reverse().map(h=>`
    <div class="panel" style="margin:8px 0">
      <b>${esc(h.action)}</b> | ${esc(String(h.time))}<br/>
      ${esc(h.ten)} | SL: ${esc(String(h.so_luong))} | ${esc(h.noi)}<br/>
      <i>${esc(h.ghi_chu||'')}</i>
    </div>
  `).join('');
  $('historyList').innerHTML = rows || `<div class="panel">Chưa có lịch sử</div>`;
}

function renderTrash(){
  if(!S.trash || !S.trash.length){
    $('trashList').innerHTML = `<div class="panel">Thùng rác trống</div>`;
    return;
  }
  $('trashList').innerHTML = S.trash.map(t=>`
    <div class="panel" style="display:flex;gap:10px;align-items:center">
      <img src="${t.hinh_anh||''}" style="width:90px;height:90px;object-fit:cover;border-radius:12px;background:#eaf7ff">
      <div style="flex:1">
        <b>${esc(t.ten)}</b><br/>
        OEM: ${esc(t.oem)} | Origin: ${esc(t.origin)} | SL: ${esc(String(t.so_luong))}
        <div style="margin-top:8px">
          <button class="btn primary" onclick="API.restore(${t.trash_row}, '${escJS(t.oem)}')">♻ Khôi phục</button>
        </div>
      </div>
    </div>
  `).join('');
}

function drawChart(){
  const labels = (S.chart||[]).map(x=>x.ten);
  const kho = (S.chart||[]).map(x=>x.kho);
  const shop= (S.chart||[]).map(x=>x.cuahang);

  if(S.chartObj) S.chartObj.destroy();
  S.chartObj = new Chart($('chart'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Kho', data:kho },
      { label:'Cửa hàng', data:shop }
    ]},
    options:{
      responsive:true,
      plugins:{ legend:{ position:'bottom' } },
      scales:{ x:{ ticks:{ display:false } } }
    }
  });
}

/************ utils ************/
function money(n){ return Number(n||0).toLocaleString('vi-VN')+' đ'; }
function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function escJS(s){ return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function splitOems(s){ return String(s||'').split(',').map(x=>x.trim()).filter(Boolean); }

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
