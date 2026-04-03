// ==========================================
// DESPENSA FAMILIAR v6.0
// ==========================================

var CAT_EMOJI = {
  'Carnes':'\u{1F969}','Lacteos':'\u{1F9C0}','Lacteos y huevos':'\u{1F9C0}',
  'Abarrotes':'\u{1F9FA}','Bebidas':'\u{1F377}',
  'Limpieza':'\u{1F9F9}','Panaderia':'\u{1F35E}','Congelados':'\u2744\uFE0F',
  'Frutas y Verduras':'\u{1F34E}','Vegano':'\u{1F33F}','Pupe':'\u{1F33F}',
  'Reposteria':'\u{1F370}','Aperitivo':'\u{1F37F}','Aperitivos':'\u{1F37F}','Botanas':'\u{1F37F}','Snacks':'\u{1F37F}',
  'Despensa':'\u{1F3E0}','Salsas y ali\u00F1os':'\u{1F336}\uFE0F','Salsas':'\u{1F336}\uFE0F',
  'Desayuno y dulces':'\u{1F36B}','Desayuno':'\u2615','Dulces':'\u{1F36B}',
  'Condimentos':'\u{1F9C2}','Especias':'\u{1F9C2}',
  'Higiene':'\u{1F9FC}','Aseo personal':'\u{1F9FC}','Cuidado personal':'\u{1F9FC}',
  'Mascotas':'\u{1F43E}','Hogar':'\u{1F3E0}','Oficina':'\u{1F4DD}',
  'Otro':'\u{1F4E6}'
};
// Smart emoji lookup: tries exact match, then partial match
function catEmoji(name) {
  if (CAT_EMOJI[name]) return CAT_EMOJI[name];
  var lower = name.toLowerCase();
  for (var k in CAT_EMOJI) {
    if (lower.indexOf(k.toLowerCase()) >= 0 || k.toLowerCase().indexOf(lower) >= 0) return CAT_EMOJI[k];
  }
  return '\u{1F4E6}';
}

var AVATARS = {
  Pablo:'avatar-pablo.png', Pupe:'avatar-pupe.png',
  Mama:'avatar-mama.png', Papa:'avatar-papa.png',
  Chichi:'avatar-chichi.png', Ester:'avatar-ester.png'
};
var DEFAULT_FAMILY = ['Papa','Mama','Pablo','Pupe','Chichi','Ester'];
var DEFAULT_SECTIONS = ['Carnes','Lacteos','Abarrotes','Bebidas','Limpieza','Panaderia','Congelados','Frutas y Verduras','Vegano','Otro'];
function getSections() {
  var base = S.config.categorias || DEFAULT_SECTIONS.slice();
  // Ensure any product categories not in the list are included
  for (var i=0; i<S.productos.length; i++) {
    var cat = dSec(S.productos[i].categoria);
    if (base.indexOf(cat)===-1) base.splice(base.length-1, 0, cat);
  }
  return base;
}
function getCatList() {
  return S.config.categorias || DEFAULT_SECTIONS.slice();
}
var SECTIONS = DEFAULT_SECTIONS;

var S = {
  productos: [], pedidos: [],
  config: { familia:['Papa','Mama','Pablo','Pupe','Chichi','Ester'], proxyUrl:'https://desmensa-proxy.pguzmanbeza.workers.dev', activeUser:'Pablo', categorias: null }
};
// categorias: null means use DEFAULT_SECTIONS. When user customizes, it becomes an array.

// === HELPERS ===
function av(n) { return AVATARS[n] || ''; }
function dSec(c) { return (c==='Verduras'||c==='Frutas') ? 'Frutas y Verduras' : c; }
function st(p) { return p.cantidadActual<=0?'empty':'ok'; }
function nid(a) { var m=0; for(var i=0;i<a.length;i++) if(a[i].id>m) m=a[i].id; return m+1; }
function dCan(c) { return (c==='Verduras'||c==='Frutas')?'feria':'uber_eats'; }
function now() { return new Date().toISOString(); }
function cap(s) { if(!s)return s; return s.charAt(0).toUpperCase()+s.slice(1); }

function save() {
  S.lastSaved = now();
  try { localStorage.setItem('df7', JSON.stringify(S)); } catch(e) {}
  // Sync to cloud (non-blocking)
  syncToCloud();
}

var DATA_VERSION = 2; // Increment this when seed data changes significantly
function load() {
  try {
    var d = localStorage.getItem('df7');
    if (d) {
      S = JSON.parse(d);
      if(!S.pedidos) S.pedidos=[];
      // Always ensure proxy URL is set
      if(!S.config.proxyUrl) S.config.proxyUrl = 'https://desmensa-proxy.pguzmanbeza.workers.dev';
      // Check if data is old seed (version 1 had <=31 products and no custom categories)
      if (!S._dataVersion && S.productos.length <= 35 && (!S.config.categorias || S.config.categorias.length <= 11)) {
        console.log('Detected old seed data, upgrading to v'+DATA_VERSION);
        seed();
        S._dataVersion = DATA_VERSION;
        save();
      }
      return;
    }
    // Try to migrate from older versions
    var oldKeys = ['df6','df5','despensa_v3','despensa_familiar_v2','despensa_familiar'];
    for (var k=0; k<oldKeys.length; k++) {
      var old = localStorage.getItem(oldKeys[k]);
      if (old) {
        try {
          S = JSON.parse(old);
          if(!S.pedidos) S.pedidos=[];
          // Also check if old data is just seed
          if (S.productos.length <= 35 && (!S.config.categorias || S.config.categorias.length <= 11)) {
            seed();
            S._dataVersion = DATA_VERSION;
          }
          localStorage.setItem('df7', JSON.stringify(S));
          console.log('Migrated data from '+oldKeys[k]);
          return;
        } catch(e2) {}
      }
    }
    // No local data found
    S._needsCloudCheck = true;
    seed();
    S._dataVersion = DATA_VERSION;
  } catch(e) { seed(); S._dataVersion = DATA_VERSION; }
}
function isRealData() {
  // Returns true if state has real user data (not just seed/demo data)
  return S.productos && S.productos.length > 35;
}

// === CLOUD SYNC ===
var syncTimer = null;
function syncToCloud() {
  // Debounce: wait 2 seconds after last change before syncing
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() {
    if (!S.config.proxyUrl) return;
    // PROTECTION: Don't overwrite cloud with seed/demo data
    if (S.productos.length <= 35 && S._needsCloudCheck) {
      console.log('Skipping sync: data looks like seed, checking cloud first');
      return;
    }
    var payload = { productos: S.productos, pedidos: S.pedidos, config: S.config };
    fetch(S.config.proxyUrl.replace(/\/+$/,''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _sync: 'save', data: payload })
    }).then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok) {
        console.log('Synced to cloud:', d.saved);
        // Also save a backup copy (rotates 3 backups in KV)
        fetch(S.config.proxyUrl.replace(/\/+$/,''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _sync: 'backup', data: payload })
        }).catch(function(){});
      }
    })
    .catch(function(e) { console.log('Sync error:', e.message); });
  }, 2000);
}

function loadFromCloud() {
  if (!S.config.proxyUrl) return Promise.resolve(false);
  return fetch(S.config.proxyUrl.replace(/\/+$/,''), { method: 'GET' })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d && !d.empty && d.productos) {
      var cloudCount = d.productos.length;
      var localCount = S.productos.length;
      // PROTECTION: Always prefer cloud if cloud has more products (real data)
      // or if local looks like seed data
      var cloudWins = false;
      if (S._needsCloudCheck && cloudCount > localCount) {
        cloudWins = true; // Local is seed, cloud has real data
      } else {
        var cloudTime = d.productos.reduce(function(max, p) { return p.upd > max ? p.upd : max; }, '');
        var localTime = S.productos.reduce(function(max, p) { return p.upd > max ? p.upd : max; }, '');
        if (cloudTime >= localTime) cloudWins = true;
      }
      if (cloudWins) {
        S.productos = d.productos;
        S.pedidos = d.pedidos || S.pedidos;
        if (d.config) {
          var localProxy = S.config.proxyUrl;
          S.config = d.config;
          if (localProxy) S.config.proxyUrl = localProxy;
        }
        delete S._needsCloudCheck;
        localStorage.setItem('df7', JSON.stringify(S));
        return true;
      }
    }
    return false;
  })
  .catch(function() { return false; });
}

// Auto-sync: check cloud every 30 seconds
setInterval(function() {
  if (!S.config.proxyUrl) return;
  loadFromCloud().then(function(updated) {
    if (updated) { renderAll(); }
  });
}, 30000);

function findProduct(name) {
  if (!name) return null;
  var q = name.toLowerCase().trim();
  for (var i=0; i<S.productos.length; i++) {
    if (S.productos[i].nombre.toLowerCase() === q) return S.productos[i];
  }
  return null;
}

// === OPENAI ===
function callOpenAI(body) {
  if (!S.config.proxyUrl) return Promise.reject(new Error('Configura el proxy en Config'));
  return fetch(S.config.proxyUrl.replace(/\/+$/,''), {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  }).then(function(r) {
    return r.json().then(function(d) {
      if (!r.ok) {
        var msg = d.error ? (d.error.message || d.error) : 'Error '+r.status;
        if (r.status===401) msg='API Key invalida en el proxy';
        if (r.status===429) msg='Sin saldo en OpenAI';
        throw new Error(msg);
      }
      return d;
    });
  });
}

// === TOAST ===
var toastTimer;
function showToast(msg,type) {
  var t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show '+(type||'info');
  clearTimeout(toastTimer);
  if(type!=='info') toastTimer=setTimeout(function(){t.className='toast'},5000);
}
function hideToast() { document.getElementById('toast').className='toast'; clearTimeout(toastTimer); }

// === SEED ===
function seed() {
  var n=now();
  var u='uber_eats',f='feria',id=0;
  function p(nom,cat,uni,qty,canal){id++;return {id:id,nombre:nom,categoria:cat,unidad:uni||'un',cantidadActual:qty||0,canal:canal||u,upd:n,by:'Pablo'};}

  S.productos = [
    // Carnes
    p('Pollo','Carnes','kg',1),p('Carne molida','Carnes','kg',0),p('Cerdo','Carnes','kg',2),
    p('Chorizo','Carnes','un',0),p('Pescado','Carnes','kg',0),p('Prietas','Carnes','un',0),
    p('Salmon','Carnes','kg',0),p('Vienesas','Carnes','pack',0),p('Choritos','Carnes','un',0),
    // Lacteos y huevos
    p('Leche','Lacteos y huevos','lt',1),p('Huevos','Lacteos y huevos','un',0),
    p('Mantequilla','Lacteos y huevos','un',2),p('Yogur','Lacteos y huevos','un',3),
    p('Queso','Lacteos y huevos','un',0),p('Crema','Lacteos y huevos','un',0),
    p('Yogur griego','Lacteos y huevos','un',0),p('Manjar','Lacteos y huevos','un',1),
    // Abarrotes
    p('Arroz','Abarrotes','kg',2),p('Arroz Basmati','Abarrotes','kg',0),
    p('Pasta','Abarrotes','pack',1),p('Fideos','Abarrotes','pack',1),
    p('Aceite','Abarrotes','lt',1),p('Aceite oliva','Abarrotes','lt',0),
    p('Atun','Abarrotes','un',0),p('Lenteja','Abarrotes','kg',1),
    p('Harina','Abarrotes','kg',0),p('Masa pizza','Abarrotes','un',0),
    // Condimentos
    p('Sal','Condimentos','un',1),p('Pimienta','Condimentos','un',1),
    p('Comino','Condimentos','un',1),p('Oregano','Condimentos','un',1),
    p('Garam masala','Condimentos','un',0),p('Curry','Condimentos','un',0),
    p('Aji','Condimentos','un',1),p('Paprika','Condimentos','un',0),
    // Salsas y aliños
    p('Ketchup','Salsas y aliños','un',1),p('Mostaza','Salsas y aliños','un',1),
    p('Mayonesa','Salsas y aliños','un',0),p('Salsa soya','Salsas y aliños','un',1),
    p('Vinagre','Salsas y aliños','un',1),p('Salsa tomate','Salsas y aliños','un',0),
    // Bebidas
    p('Agua','Bebidas','lt',3),p('Jugo','Bebidas','lt',2),
    p('Cerveza','Bebidas','pack',0),p('Vino','Bebidas','un',0),
    p('Coca Cola','Bebidas','lt',0),p('Jugo en polvo','Bebidas','un',0),
    // Desayuno y dulces
    p('Cereal','Desayuno y dulces','un',1),p('Mermelada','Desayuno y dulces','un',1),
    p('Miel','Desayuno y dulces','un',0),p('Cafe','Desayuno y dulces','un',1),
    p('Te','Desayuno y dulces','caja',1),p('Chocolate','Desayuno y dulces','un',0),
    p('Azucar','Desayuno y dulces','kg',1),p('Galletas dulces','Desayuno y dulces','pack',0),
    // Panaderia
    p('Pan molde','Panaderia','un',1),p('Galletas','Panaderia','pack',0),
    // Reposteria
    p('Harina repost.','Reposteria','kg',0),p('Polvo hornear','Reposteria','un',1),
    p('Esencia vainilla','Reposteria','un',0),
    // Aperitivo
    p('Papas fritas','Aperitivo','pack',0),p('Nachos','Aperitivo','pack',0),
    p('Mani','Aperitivo','un',0),
    // Despensa
    p('Confort','Despensa','pack',1),p('Servilletas','Despensa','pack',1),
    p('Bolsas basura','Despensa','pack',1),p('Papel aluminio','Despensa','un',0),
    p('Film plastico','Despensa','un',0),
    // Congelados
    p('Helado','Congelados','un',0),p('Pizza cong.','Congelados','un',0),
    p('Nuggets','Congelados','pack',0),
    // Frutas y Verduras
    p('Tomate','Verduras','kg',0,f),p('Lechuga','Verduras','un',1,f),
    p('Zanahoria','Verduras','kg',2,f),p('Cebolla','Verduras','kg',1,f),
    p('Palta','Frutas','un',0,f),p('Platano','Frutas','un',6,f),
    p('Manzana','Frutas','un',3,f),p('Limon','Frutas','un',0,f),
    p('Naranja','Frutas','un',0,f),p('Pepino','Verduras','un',0,f),
    p('Pimenton','Verduras','un',0,f),p('Brocoli','Verduras','un',0,f),
    p('Espinaca','Verduras','un',0,f),p('Papa','Verduras','kg',2,f),
    p('Choclo','Verduras','un',0,f),p('Apio','Verduras','un',0,f),
    p('Frutilla','Frutas','un',0,f),
    // Limpieza
    p('Detergente','Limpieza','un',0),p('Papel hig.','Limpieza','pack',1),
    p('Jabon liq.','Limpieza','un',2),p('Esponja lavap.','Limpieza','un',1),
    p('Cloro','Limpieza','un',1),p('Lavaloza','Limpieza','un',1),
    p('Suavizante','Limpieza','un',0),p('Desinfectante','Limpieza','un',0),
    // Higiene
    p('Shampoo','Higiene','un',1),p('Pasta dientes','Higiene','un',1),
    p('Desodorante','Higiene','un',1),p('Jabon barra','Higiene','un',0),
    // Vegano (Pupe)
    p('Leche almendra','Vegano','lt',1),p('Yogur vegano','Vegano','un',0),
    p('Granola','Vegano','un',1),p('Queso vegano','Vegano','un',0),
    // Mascotas
    p('Comida Manolo','Mascotas','kg',2),p('Comida Guaipe','Mascotas','kg',1),
    p('Arena gato','Mascotas','kg',0)
  ];
  // Fix Pupe products author
  for(var i=0;i<S.productos.length;i++){if(S.productos[i].categoria==='Vegano')S.productos[i].by='Pupe';}

  S.pedidos = [
    {id:1,texto:'Chorizo',cantidad:2,por:'Papa',com:'',fecha:n,estado:'pendiente'},
    {id:2,texto:'Pescado',cantidad:1,por:'Papa',com:'',fecha:n,estado:'pendiente'},
    {id:3,texto:'Prietas',cantidad:1,por:'Papa',com:'',fecha:n,estado:'pendiente'},
    {id:4,texto:'Galletas dulces',cantidad:2,por:'Chichi',com:'chocolate',fecha:n,estado:'pendiente'},
    {id:5,texto:'Arroz Basmati',cantidad:1,por:'Papa',com:'',fecha:n,estado:'pendiente'},
    {id:6,texto:'Shampoo',cantidad:1,por:'Pablo',com:'anticaspa',fecha:n,estado:'pendiente'},
    {id:7,texto:'Yogur griego',cantidad:2,por:'Mama',com:'Colun',fecha:n,estado:'pendiente'}
  ];
  S.config = {
    familia:['Papa','Mama','Pablo','Pupe','Chichi','Ester'],
    proxyUrl:'https://desmensa-proxy.pguzmanbeza.workers.dev',activeUser:'Pablo',
    categorias:['Carnes','Lacteos y huevos','Abarrotes','Condimentos','Salsas y aliños','Bebidas','Desayuno y dulces','Panaderia','Reposteria','Aperitivo','Despensa','Congelados','Frutas y Verduras','Limpieza','Higiene','Vegano','Mascotas','Otro']
  };
}

// === TABS ===
var activeTab = 'despensa';
function switchTab(t) {
  activeTab = t;
  var tabs = document.querySelectorAll('.tb');
  for (var i=0; i<tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-t')===t);
  var views = document.querySelectorAll('.vw');
  for (var j=0; j<views.length; j++) views[j].classList.toggle('on', views[j].id==='v-'+t);
  document.getElementById('addP').style.display = t==='despensa'?'':'none';
  document.getElementById('addPed').style.display = t==='pedidos'?'':'none';
  renderAll();
}
var tabBtns = document.querySelectorAll('.tb');
for (var ti=0; ti<tabBtns.length; ti++) {
  (function(btn){ btn.addEventListener('click', function(){ switchTab(btn.getAttribute('data-t')); }); })(tabBtns[ti]);
}

// === RENDER ALL ===
function renderAll() {
  renderDesp();
  renderPed();
  badges();
  if (activeTab === 'config') renderConf();
}

// === RENDER DESPENSA ===
var searchQ = '';
function renderDesp() {
  // Missing banner
  var missingCount = 0;
  for (var mi=0; mi<S.productos.length; mi++) { if (st(S.productos[mi])!=='ok') missingCount++; }
  var banner = document.getElementById('missingBanner');
  var bannerNum = document.getElementById('missingNum');
  if (missingCount > 0) {
    banner.classList.remove('hidden');
    bannerNum.textContent = missingCount;
  } else {
    banner.classList.add('hidden');
  }

  // Filter
  var ps = [];
  for (var i=0; i<S.productos.length; i++) {
    if (!searchQ || S.productos[i].nombre.toLowerCase().indexOf(searchQ.toLowerCase())>=0) {
      ps.push(S.productos[i]);
    }
  }

  // Group by section
  var groups = {};
  for (var k=0; k<ps.length; k++) {
    var sec = dSec(ps[k].categoria);
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(ps[k]);
  }
  // Sort: empty first, then low, then ok; then alphabetical within same status
  var stOrd = {empty:0, ok:1};
  for (var g in groups) {
    groups[g].sort(function(a,b){ var d=stOrd[st(a)]-stOrd[st(b)]; if(d!==0)return d; return a.nombre.localeCompare(b.nombre,'es'); });
  }

  var el = document.getElementById('dList');
  if (!ps.length) { el.innerHTML='<div class="es">No hay productos</div>'; return; }

  var h = '';
  var activeSections = getSections();
  for (var si=0; si<activeSections.length; si++) {
    var sec = activeSections[si];
    if (!groups[sec] || !groups[sec].length) continue;
    var isFV = sec==='Frutas y Verduras';
    var emoji = catEmoji(sec);
    h += '<div class="shdr '+(isFV?'sh-fv':'')+'" data-sec="'+sec+'">';
    h += '<span class="sd" style="background:'+(isFV?'var(--fe)':'var(--g3)')+'"></span>';
    h += emoji+' '+sec+'<span class="collapse-arrow">\u25BC</span></div>';

    for (var pi=0; pi<groups[sec].length; pi++) {
      var p = groups[sec][pi];
      var s = st(p);
      h += '<div class="pc s-'+s+(isFV?' s-feria':'')+'" data-id="'+p.id+'" data-sec="'+sec+'">';
      if(p.desc) h += '<span class="pi" data-desc="'+p.desc.replace(/"/g,'&quot;')+'">i</span>';
      h += '<div class="pn">'+p.nombre+'</div>';
      h += '<div class="prow">';
      h += '<span class="pq q-'+s+'">'+p.cantidadActual+'</span>';
      h += '<span class="pu">'+p.unidad+'</span>';
      h += '<div class="pb">';
      h += '<button class="pbtn" data-a="m" data-id="'+p.id+'">-</button>';
      h += '<button class="pbtn" data-a="p" data-id="'+p.id+'">+</button>';
      h += '</div></div></div>';
    }
  }
  el.innerHTML = h;

  // Bind events
  var btns = el.querySelectorAll('.pbtn');
  for (var bi=0; bi<btns.length; bi++) {
    (function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var pid = parseInt(btn.getAttribute('data-id'));
        for (var x=0; x<S.productos.length; x++) {
          if (S.productos[x].id===pid) {
            if (btn.getAttribute('data-a')==='p') S.productos[x].cantidadActual++;
            else if (S.productos[x].cantidadActual>0) S.productos[x].cantidadActual--;
            S.productos[x].upd=now(); S.productos[x].by=S.config.activeUser;
            // Auto-create pedido when stock reaches 0
            if (S.productos[x].cantidadActual===0) {
              var pName=S.productos[x].nombre;
              var exists=false;
              for(var ep=0;ep<S.pedidos.length;ep++){if(S.pedidos[ep].estado==='pendiente'&&S.pedidos[ep].texto.toLowerCase()===pName.toLowerCase()){exists=true;break;}}
              if(!exists){S.pedidos.push({id:nid(S.pedidos),texto:pName,cantidad:S.productos[x].stockMinimo||1,por:S.config.activeUser,com:'Auto: stock en 0',fecha:now(),estado:'pendiente'});showToast(pName+' agregado a pedidos','ok');}
            }
            break;
          }
        }
        save(); renderAll();
      });
    })(btns[bi]);
  }
  var cards = el.querySelectorAll('.pc');
  for (var ci=0; ci<cards.length; ci++) {
    (function(card){ card.addEventListener('click', function(){ openProdModal(parseInt(card.getAttribute('data-id'))); }); })(cards[ci]);
  }
  // Info icons
  var infos = el.querySelectorAll('.pi');
  for (var ii=0; ii<infos.length; ii++) {
    (function(icon){
      icon.addEventListener('click', function(e){
        e.stopPropagation();
        var tip=document.getElementById('descTip');
        tip.textContent=icon.getAttribute('data-desc');
        tip.classList.add('show');
        setTimeout(function(){tip.classList.remove('show');},3000);
      });
    })(infos[ii]);
  }
  // Collapsible section headers
  var hdrs = el.querySelectorAll('.shdr');
  for (var hi=0; hi<hdrs.length; hi++) {
    (function(hdr){
      hdr.addEventListener('click', function(){
        hdr.classList.toggle('collapsed');
        var secName = hdr.getAttribute('data-sec');
        var cards = el.querySelectorAll('.pc[data-sec="'+secName+'"]');
        for (var ci=0; ci<cards.length; ci++) {
          cards[ci].style.display = hdr.classList.contains('collapsed') ? 'none' : '';
        }
      });
    })(hdrs[hi]);
  }
}

// === RENDER PEDIDOS ===
var pedSubTab = 'despensa';
function isFVCategory(texto) {
  // Check if a pedido's text matches a product in the Frutas y Verduras category
  for (var i=0; i<S.productos.length; i++) {
    if (S.productos[i].nombre.toLowerCase() === texto.toLowerCase()) {
      return dSec(S.productos[i].categoria) === 'Frutas y Verduras';
    }
  }
  return false;
}
function renderPed() {
  // Update sub-tab active states
  var ptabs = document.querySelectorAll('.ped-tab');
  for (var ti=0; ti<ptabs.length; ti++) ptabs[ti].classList.toggle('on', ptabs[ti].getAttribute('data-pt')===pedSubTab);

  var pds = [];
  for (var j=0; j<S.pedidos.length; j++) {
    var isFV = isFVCategory(S.pedidos[j].texto);
    if (pedSubTab==='fv' && isFV) pds.push(S.pedidos[j]);
    else if (pedSubTab==='despensa' && !isFV) pds.push(S.pedidos[j]);
  }

  var el = document.getElementById('pList');
  if (!pds.length) { el.innerHTML='<div class="es">No hay pedidos</div>'; return; }

  // Sort: pending first, then by category order, then alphabetical
  var catOrder = getSections();
  function pedCatIdx(ped) {
    // Find matching product to get category
    var prod = findProduct(ped.texto);
    var cat = prod ? dSec(prod.categoria) : (ped.categoria ? dSec(ped.categoria) : 'Otro');
    var idx = catOrder.indexOf(cat);
    return idx >= 0 ? idx : 999;
  }
  pds.sort(function(a,b){
    var sa = a.estado==='comprado'?1:0, sb = b.estado==='comprado'?1:0;
    if (sa !== sb) return sa - sb;
    var ca = pedCatIdx(a), cb = pedCatIdx(b);
    if (ca !== cb) return ca - cb;
    return a.texto.localeCompare(b.texto);
  });

  var h = '';
  for (var m=0; m<pds.length; m++) {
    var p = pds[m];
    var dn = p.estado==='comprado';
    h += '<div class="pdc '+(dn?'done':'')+'">';
    h += '<button class="pck '+(dn?'ckd':'')+'" data-id="'+p.id+'">';
    if (dn) h += '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    h += '</button>';
    h += '<div style="flex:1;min-width:0"><div class="pdt">'+p.texto+(p.cantidad>1?' x'+p.cantidad:'');
    h += ' <span class="ped-who">\u2014 '+p.por+'</span>';
    h += '</div>';
    h += '<div class="pdm">'+(p.com||'')+'</div></div>';
    h += '<button class="pdx" data-d="'+p.id+'">&times;</button></div>';
  }
  el.innerHTML = h;

  // Bind
  var pks = el.querySelectorAll('.pck');
  for (var pi=0; pi<pks.length; pi++) {
    (function(btn){ btn.addEventListener('click', function(){
      var pid=parseInt(btn.getAttribute('data-id'));
      for(var x=0;x<S.pedidos.length;x++){ if(S.pedidos[x].id===pid){ S.pedidos[x].estado=S.pedidos[x].estado==='comprado'?'pendiente':'comprado'; break; }}
      save(); renderAll();
    }); })(pks[pi]);
  }
  var dls = el.querySelectorAll('.pdx');
  for (var di=0; di<dls.length; di++) {
    (function(btn){ btn.addEventListener('click', function(){
      var did=parseInt(btn.getAttribute('data-d'));
      S.pedidos=S.pedidos.filter(function(x){return x.id!==did;});
      save(); renderAll();
    }); })(dls[di]);
  }
}

// === RENDER CONFIG ===
function renderConf() {
  document.getElementById('proxyUrl').value = S.config.proxyUrl || '';

  var h='';
  for (var i=0; i<S.config.familia.length; i++) {
    var m=S.config.familia[i]; var a=av(m);
    var isDefault = DEFAULT_FAMILY.indexOf(m) !== -1;
    h+='<span class="fchip">'+(a?'<img src="'+a+'">':'')+m;
    if (!isDefault) h+='<button class="fd" data-n="'+m+'">&times;</button>';
    h+='</span>';
  }
  document.getElementById('famC').innerHTML=h;
  var dels=document.querySelectorAll('.fd');
  for(var d=0;d<dels.length;d++){
    (function(btn){btn.addEventListener('click',function(){
      S.config.familia=S.config.familia.filter(function(x){return x!==btn.getAttribute('data-n');});
      save();renderConf();
    });})(dels[d]);
  }

  var sel=document.getElementById('actUser'); var opts='';
  for(var j=0;j<S.config.familia.length;j++){
    opts+='<option'+(S.config.familia[j]===S.config.activeUser?' selected':'')+'>'+S.config.familia[j]+'</option>';
  }
  sel.innerHTML=opts;
  sel.onchange=function(){S.config.activeUser=sel.value;save();updateUserBtn();};

  var lsEl=document.getElementById('lastSaved');
  if(S.lastSaved){var dt=new Date(S.lastSaved);lsEl.textContent='(guardado: '+dt.toLocaleDateString('es-CL')+' '+dt.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+')';}

  renderCatList();
}

function renderCatList() {
  var cats = getCatList();
  var el = document.getElementById('catList');
  if (!el) return;
  var h = '';
  for (var i = 0; i < cats.length; i++) {
    var c = cats[i];
    var isOtro = c === 'Otro';
    h += '<div class="cat-item" data-idx="' + i + '">';
    var emoji = catEmoji(c);
    h += '<button class="cat-up" data-dir="up" data-idx="' + i + '">▲</button>';
    h += '<button class="cat-dn" data-dir="dn" data-idx="' + i + '">▼</button>';
    h += '<span style="font-size:18px">' + emoji + '</span>';
    h += '<input class="cat-name" value="' + c + '" data-idx="' + i + '" data-orig="' + c + '">';
    if (!isOtro) h += '<button class="cat-del" data-idx="' + i + '" data-cat="' + c + '">&times;</button>';
    h += '</div>';
  }
  el.innerHTML = h;

  // Move up/down
  var btns = el.querySelectorAll('.cat-up, .cat-dn');
  for (var b = 0; b < btns.length; b++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-idx'));
        var dir = btn.getAttribute('data-dir');
        var arr = getCatList();
        if (dir === 'up' && idx > 0) { var tmp = arr[idx]; arr[idx] = arr[idx-1]; arr[idx-1] = tmp; }
        if (dir === 'dn' && idx < arr.length-1) { var tmp = arr[idx]; arr[idx] = arr[idx+1]; arr[idx+1] = tmp; }
        S.config.categorias = arr;
        save(); renderCatList();
      });
    })(btns[b]);
  }

  // Rename on blur
  var inputs = el.querySelectorAll('.cat-name');
  for (var n = 0; n < inputs.length; n++) {
    (function(inp) {
      inp.addEventListener('blur', function() {
        var idx = parseInt(inp.getAttribute('data-idx'));
        var orig = inp.getAttribute('data-orig');
        var newName = inp.value.trim();
        if (!newName || newName === orig) { inp.value = orig; return; }
        var arr = getCatList();
        arr[idx] = newName;
        S.config.categorias = arr;
        // Update all products with old category name
        for (var p = 0; p < S.productos.length; p++) {
          if (S.productos[p].categoria === orig) S.productos[p].categoria = newName;
          if (dSec(S.productos[p].categoria) === orig) S.productos[p].categoria = newName;
        }
        save(); renderCatList(); renderDesp();
      });
    })(inputs[n]);
  }

  // Delete category - reassign products to closest match or "Otro"
  var dels = el.querySelectorAll('.cat-del');
  for (var d = 0; d < dels.length; d++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-idx'));
        var catName = btn.getAttribute('data-cat');
        if (!confirm('Eliminar categoria "' + catName + '"?\nLos productos se moveran a otra categoria.')) return;
        var arr = getCatList();
        arr.splice(idx, 1);
        S.config.categorias = arr;
        // Reassign products: try to find best match via simple heuristic
        var remaining = arr.filter(function(c) { return c !== 'Otro'; });
        for (var p = 0; p < S.productos.length; p++) {
          var prod = S.productos[p];
          if (prod.categoria === catName || dSec(prod.categoria) === catName) {
            prod.categoria = 'Otro'; // default fallback
          }
        }
        save(); renderCatList(); renderDesp();
        showToast('Categoria eliminada. Productos movidos a Otro.', 'ok');
      });
    })(dels[d]);
  }

}

function badges() {
  var pc=0;
  for(var j=0;j<S.pedidos.length;j++){if(S.pedidos[j].estado==='pendiente')pc++;}
  var pb=document.getElementById('pBdg');pb.textContent=pc;pb.style.display=pc?'':'none';
}

function updateUserBtn() {
  var b=document.getElementById('curUser');var a=av(S.config.activeUser);
  b.innerHTML=(a?'<img src="'+a+'">':'')+S.config.activeUser;
}

// === PRODUCT MODAL ===
function openProdModal(id) {
  var p=null;
  if(id){for(var i=0;i<S.productos.length;i++){if(S.productos[i].id===id){p=S.productos[i];break;}}}
  document.getElementById('mT').textContent=p?'Editar':'Nuevo Producto';
  document.getElementById('mId').value=p?p.id:'';
  document.getElementById('mNom').value=p?p.nombre:'';
  // Update category dropdown with dynamic categories
  var catSel=document.getElementById('mCat');
  var allCats=getSections();
  catSel.innerHTML='';
  for(var ci=0;ci<allCats.length;ci++){var o=document.createElement('option');o.value=allCats[ci];o.textContent=allCats[ci];catSel.appendChild(o);}
  catSel.value=p?p.categoria:'Abarrotes';
  document.getElementById('mUni').value=p?p.unidad:'un';
  document.getElementById('mQty').value=p?p.cantidadActual:0;
  document.getElementById('mDesc').value=p&&p.desc?p.desc:'';
  document.getElementById('mDel').style.display=p?'':'none';
  document.getElementById('mProd').classList.add('show');
}
document.getElementById('addP').addEventListener('click',function(){openProdModal(null);});
document.getElementById('mCnc').addEventListener('click',function(){document.getElementById('mProd').classList.remove('show');});
document.getElementById('mDel').addEventListener('click',function(){
  var id=parseInt(document.getElementById('mId').value);
  S.productos=S.productos.filter(function(x){return x.id!==id;});
  save();document.getElementById('mProd').classList.remove('show');renderAll();
});
document.getElementById('mSav').addEventListener('click',function(){
  var id=document.getElementById('mId').value;
  var nm=document.getElementById('mNom').value.trim();
  if(!nm)return;
  var descVal=document.getElementById('mDesc').value.trim();
  var d={
    nombre:nm, categoria:document.getElementById('mCat').value,
    unidad:document.getElementById('mUni').value,
    cantidadActual:parseInt(document.getElementById('mQty').value)||0,
    canal:dCan(document.getElementById('mCat').value),
    desc:descVal||'',
    upd:now(), by:S.config.activeUser
  };
  if(id){
    for(var i=0;i<S.productos.length;i++){if(S.productos[i].id===parseInt(id)){Object.assign(S.productos[i],d);break;}}
  } else {
    d.id=nid(S.productos); S.productos.push(d);
  }
  save();document.getElementById('mProd').classList.remove('show');renderAll();
});

// === PEDIDO MODAL ===
document.getElementById('addPed').addEventListener('click',function(){
  document.getElementById('peT').value='';document.getElementById('peQ').value=1;document.getElementById('peC').value='';
  var opts='';
  for(var i=0;i<S.config.familia.length;i++){opts+='<option'+(S.config.familia[i]===S.config.activeUser?' selected':'')+'>'+S.config.familia[i]+'</option>';}
  document.getElementById('peP').innerHTML=opts;
  document.getElementById('mPed').classList.add('show');
});
document.getElementById('peCn').addEventListener('click',function(){document.getElementById('mPed').classList.remove('show');});
document.getElementById('peSv').addEventListener('click',function(){
  var t=document.getElementById('peT').value.trim(); if(!t)return;
  var qty=parseInt(document.getElementById('peQ').value)||1;
  // Check duplicate pending pedido
  var existing=null;
  for(var e=0;e<S.pedidos.length;e++){
    if(S.pedidos[e].estado==='pendiente'&&S.pedidos[e].texto.toLowerCase()===t.toLowerCase()){existing=S.pedidos[e];break;}
  }
  if(existing){existing.cantidad=qty;existing.por=document.getElementById('peP').value;existing.fecha=now();}
  else{S.pedidos.push({id:nid(S.pedidos),texto:t,cantidad:qty,por:document.getElementById('peP').value,com:document.getElementById('peC').value.trim(),fecha:now(),estado:'pendiente'});}
  // Ensure product in despensa
  if(!findProduct(t)){S.productos.push({id:nid(S.productos),nombre:t,categoria:'Otro',unidad:'un',cantidadActual:0,stockMinimo:qty,canal:'uber_eats',upd:now(),by:S.config.activeUser});}
  save();document.getElementById('mPed').classList.remove('show');renderAll();
});

// === USER SELECT ===
document.getElementById('curUser').addEventListener('click',function(){
  var h='';
  for(var i=0;i<S.config.familia.length;i++){
    var m=S.config.familia[i];var a=av(m);var cls=m===S.config.activeUser?'pri':'sec';
    h+='<button class="cbtn '+cls+'" data-u="'+m+'" style="display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:4px">';
    if(a)h+='<img src="'+a+'" style="width:26px;height:26px;border-radius:50%;object-fit:contain;object-position:center top;background:var(--g1)">';
    h+=m+'</button>';
  }
  document.getElementById('usrL').innerHTML=h;
  var bs=document.querySelectorAll('#usrL button');
  for(var j=0;j<bs.length;j++){
    (function(btn){btn.addEventListener('click',function(){S.config.activeUser=btn.getAttribute('data-u');save();updateUserBtn();document.getElementById('mUsr').classList.remove('show');});})(bs[j]);
  }
  document.getElementById('mUsr').classList.add('show');
});

// Modal close
var modals=['mProd','mPed','mUsr'];
for(var mi=0;mi<modals.length;mi++){
  (function(id){document.getElementById(id).addEventListener('click',function(e){if(e.target===e.currentTarget)e.currentTarget.classList.remove('show');});})(modals[mi]);
}

// === CONFIG EVENTS ===
document.getElementById('proxyUrl').addEventListener('change',function(){S.config.proxyUrl=this.value.trim();save();renderConf();});
document.getElementById('addMem').addEventListener('click',function(){var inp=document.getElementById('newMem');var n=inp.value.trim();if(n&&S.config.familia.indexOf(n)<0){S.config.familia.push(n);inp.value='';save();renderConf();}});
document.getElementById('addCat').addEventListener('click',function(){var inp=document.getElementById('newCat');var n=inp.value.trim();if(!n)return;var arr=getCatList();if(arr.indexOf(n)>=0){showToast('Categoria ya existe','err');return;}arr.splice(arr.length-1,0,n);S.config.categorias=arr;inp.value='';save();renderCatList();renderDesp();showToast('Categoria "'+n+'" creada','ok');});
document.getElementById('expB').addEventListener('click',function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='despensa_respaldo.json';a.click();});
document.getElementById('impB').addEventListener('click',function(){document.getElementById('impF').click();});
document.getElementById('impF').addEventListener('change',function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{S=JSON.parse(ev.target.result);save();renderAll();updateUserBtn();showToast('Datos importados','ok');}catch(err){showToast('Error al importar','err');}};r.readAsText(f);});
// === TEST OPENAI ===
document.getElementById('testApi').addEventListener('click',function(){
  S.config.proxyUrl=document.getElementById('proxyUrl').value.trim();save();renderConf();
  var res=document.getElementById('testRes');
  if(!S.config.proxyUrl){res.className='tres terr';res.textContent='Ingresa la URL del proxy';return;}
  res.className='tres';res.textContent='Probando...';res.style.background='var(--acb)';res.style.color='var(--ac)';
  callOpenAI({model:'gpt-4o-mini',messages:[{role:'user',content:'Responde exactamente: OK'}],max_tokens:10})
  .then(function(d){var txt=d.choices&&d.choices[0]?d.choices[0].message.content:'OK';res.className='tres tok';res.textContent='CONEXION OK: '+txt;res.style.background='';res.style.color='';})
  .catch(function(err){res.className='tres terr';res.textContent='ERROR: '+err.message;res.style.background='';res.style.color='';});
});

// === VOICE ===
var isRec=false, mediaRec=null, chunks=[], recStream=null, recTimeout=null;
var hasSpeech=!!(window.SpeechRecognition||window.webkitSpeechRecognition);

function startVoice(){if(isRec){stopVoice();return;}if(hasSpeech)startWebSpeech();else startWhisper();}

function stopVoice(){
  var mic=document.getElementById('uMic');var stat=document.getElementById('uStat');
  clearTimeout(recTimeout);
  try{if(mic._rec){mic._rec.abort();mic._rec=null;}}catch(e){}
  try{if(mediaRec&&mediaRec.state==='recording')mediaRec.stop();}catch(e){}
  try{if(recStream){recStream.getTracks().forEach(function(t){t.stop();});recStream=null;}}catch(e){}
  isRec=false;mic.classList.remove('rec','proc');stat.classList.remove('show');
}

function startWebSpeech(){
  var SRC=window.SpeechRecognition||window.webkitSpeechRecognition;
  var rec=new SRC();rec.lang='es-CL';rec.continuous=false;rec.interimResults=false;
  var mic=document.getElementById('uMic');var stat=document.getElementById('uStat');
  var done=false;
  function cleanup(){done=true;clearTimeout(recTimeout);try{rec.abort();}catch(e){}mic._rec=null;isRec=false;mic.classList.remove('rec');stat.classList.remove('show');}
  rec.onstart=function(){isRec=true;mic.classList.add('rec');stat.textContent='Escuchando...';stat.classList.add('show');
    recTimeout=setTimeout(function(){if(!done){cleanup();showToast('Tiempo agotado, intenta de nuevo','err');}},10000);};
  rec.onresult=function(e){if(done)return;var text=e.results[0][0].transcript;cleanup();if(text){document.getElementById('uInput').value=text;processCommand(text);}};
  rec.onerror=function(e){if(done)return;cleanup();if(e.error==='not-allowed')alert('Permite acceso al microfono');else startWhisper();};
  rec.onend=function(){if(!done)cleanup();};
  mic._rec=rec;rec.start();
}

function startWhisper(){
  if(!S.config.proxyUrl){showToast('Configura proxy en Config','err');return;}
  var mic=document.getElementById('uMic');var stat=document.getElementById('uStat');
  navigator.mediaDevices.getUserMedia({audio:true})
  .then(function(stream){
    recStream=stream;
    var mime=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
    mediaRec=new MediaRecorder(stream,{mimeType:mime});chunks=[];
    mediaRec.ondataavailable=function(e){if(e.data.size>0)chunks.push(e.data);};
    mediaRec.onstop=function(){
      stream.getTracks().forEach(function(t){t.stop();});recStream=null;
      clearTimeout(recTimeout);
      mic.classList.remove('rec');mic.classList.add('proc');stat.textContent='Procesando...';stat.classList.add('show');
      var blob=new Blob(chunks,{type:mime});
      var reader=new FileReader();
      reader.onload=function(ev){
        var base64=ev.target.result.split(',')[1];
        callOpenAI({_whisper:true,_audioBase64:base64,_mimeType:mime})
        .then(function(d){mic.classList.remove('proc');stat.classList.remove('show');isRec=false;if(d.text){document.getElementById('uInput').value=d.text;processCommand(d.text);}else{showToast('No se entendio, intenta de nuevo','err');}})
        .catch(function(){mic.classList.remove('proc');stat.classList.remove('show');isRec=false;showToast('Error al transcribir','err');});
      };
      reader.readAsDataURL(blob);
    };
    mediaRec.start();isRec=true;mic.classList.add('rec');stat.textContent='Escuchando...';stat.classList.add('show');
    // Auto-stop after 10 seconds
    recTimeout=setTimeout(function(){if(mediaRec&&mediaRec.state==='recording')mediaRec.stop();},10000);
  })
  .catch(function(){alert('Permite acceso al microfono');});
}
document.getElementById('uMic').addEventListener('click',startVoice);

// === PROCESS COMMAND (OpenAI as central engine) ===
function processCommand(text) {
  if (!S.config.proxyUrl) { showToast('Configura el proxy en Config', 'err'); return; }
  showToast('Procesando...', 'info');

  var inv = '';
  for (var i=0; i<S.productos.length; i++) {
    var p = S.productos[i];
    inv += p.nombre+':'+p.cantidadActual+p.unidad+'; ';
  }

  var pedidos = '';
  for (var j=0; j<S.pedidos.length; j++) {
    if (S.pedidos[j].estado==='pendiente') {
      pedidos += S.pedidos[j].texto+' x'+S.pedidos[j].cantidad+' ('+S.pedidos[j].por+'); ';
    }
  }

  var sysMsg = 'Eres el asistente de la despensa familiar Guzman Cox en Chile. ' +
    'Familia: '+S.config.familia.join(', ')+'. Usuario activo: '+S.config.activeUser+'. ' +
    'Pupe es intolerante a lactosa.\n' +
    'INVENTARIO ACTUAL: '+inv+'\n' +
    'PEDIDOS PENDIENTES: '+(pedidos||'ninguno')+'\n\n' +
    'RESPONDE SOLO JSON VALIDO: {"acciones":[...],"respuesta":"texto breve confirmando"}\n\n' +
    'ACCIONES:\n' +
    '1. {"tipo":"actualizar","producto":"Nombre","cantidad":N} - Cambia stock\n' +
    '2. {"tipo":"crear","nombre":"X","categoria":"Cat","unidad":"un","cantidad":N,"stockMinimo":1} - Producto nuevo\n' +
    '3. {"tipo":"pedido","texto":"X","solicitadoPor":"Persona","cantidad":N,"comentario":"","categoria":"Cat","soloP":false} - Pedido de compra. soloP:true = solo pedido, no agregar a despensa\n' +
    '4. {"tipo":"eliminar","producto":"X"} - Eliminar producto de la despensa\n\n' +
    'CATEGORIAS DISPONIBLES (usa EXACTAMENTE estos nombres, elige la correcta SIEMPRE, NUNCA uses "Otro" si puedes categorizar):\n' +
    getCatList().join(', ') + '\n' +
    'Ejemplos de productos por categoria:\n' +
    '- Lacteos: leche, yogur, queso, mantequilla, crema, manjar, huevos\n' +
    '- Carnes: pollo, carne, cerdo, salmon, pescado, jamon, vienesas, tocino, chorizo\n' +
    '- Verduras: tomate, lechuga, cebolla, zanahoria, pepino, pimenton, apio, brocoli, espinaca, zapallo, choclo, papa\n' +
    '- Frutas: manzana, platano, palta, naranja, limon, uva, frutilla, kiwi, durazno, sandia\n' +
    '- Abarrotes: arroz, pasta, fideos, aceite, atun, lentejas, harina, azucar, sal, pimienta, comino, oregano, garam masala, curry, mostaza, ketchup, mayo, mayonesa, salsa soya, salsa, vinagre, mermelada, miel, cafe, te, cacao, chocolate, cereal, avena, granola, especias, condimentos\n' +
    '- Limpieza: detergente, jabon, cloro, esponja, bolsas basura, desinfectante, shampoo, pasta dientes, escobilla, lavaloza, suavizante, limpiador, confort, papel higienico, servilletas\n' +
    '- Bebidas: agua, jugo, cerveza, vino, coca cola, bebida, gaseosa, sprite, fanta\n' +
    '- Congelados: helado, pizza congelada, papas fritas congeladas, nuggets\n' +
    '- Panaderia: pan, pan molde, galletas, queque, torta, bizcocho\n' +
    '- Vegano: leche almendra, yogur vegano, queso vegano, todo lo vegano o sin lactosa\n' +
    '- Si la familia creo categorias personalizadas, USA ESAS categorias cuando el producto encaje.\n' +
    '- Otro: SOLO si realmente no encaja en NINGUNA categoria. Piensa bien antes de usar "Otro".\n\n' +
    'REGLAS DE INTERPRETACION:\n' +
    '- "hay X" / "tengo X" / "quedan X" = ACTUALIZAR stock\n' +
    '- "se acabo X" / "no hay X" / "no queda X" = ACTUALIZAR a 0\n' +
    '- "falta X" / "faltan X" = PEDIDO + CREAR si no existe (cantidad 0)\n' +
    '- "pedir X" / "comprar X" / "necesito X" / "quiero X" / "traer X" / "conseguir X" = PEDIDO\n' +
    '- "agregar X" / "nuevo producto X" = CREAR producto nuevo con cantidad 1\n' +
    '- "pedido especial X" / "solo pedido X" / "pedir sin agregar X" = SOLO PEDIDO (no crear en despensa). Usa tipo:"pedido" con campo "soloP":true\n' +
    '- "eliminar X" / "borrar X" / "quitar X" / "sacar X" = tipo ELIMINAR (NO actualizar a 0, sino ELIMINAR completamente con tipo:"eliminar")\n' +
    '- Nombre de persona + quiere/necesita/pide = PEDIDO para esa persona\n' +
    '- Si ya existe pedido pendiente del mismo producto, ACTUALIZA cantidad (no duplicar)\n' +
    '- Si "falta" un producto que YA EXISTE en despensa, pon stock en 0 Y crea pedido\n' +
    '- SIEMPRE asigna la categoria correcta al crear productos o pedidos. Usa tu conocimiento para categorizar.\n' +
    '- Ejemplos: garam masala=Abarrotes, cerveza=Bebidas, confort=Abarrotes, shampoo=Limpieza, kefir=Lacteos\n' +
    '- IMPORTANTE: "eliminar/borrar/quitar" SIEMPRE usa tipo:"eliminar", NUNCA tipo:"actualizar". Son cosas distintas.\n' +
    '- NOMBRES CORTOS: usa nombres cortos para productos (max 15 caracteres). Ej: "Papel higienico" -> "Papel hig.", "Escobilla dientes" -> "Esc. dientes", "Leche almendra" -> "Leche alm."\n' +
    '- CATEGORIAS NUEVAS: si el usuario pide crear una categoria (ej: "crear categoria Botanas"), usa esa categoria para los productos que correspondan. Categorias personalizadas son validas.\n' +
    '- NO uses markdown. SOLO JSON puro.';

  callOpenAI({
    model:'gpt-4o-mini',
    messages:[{role:'system',content:sysMsg},{role:'user',content:text}],
    temperature:0.2, max_tokens:600
  })
  .then(function(data) {
    if (!data||!data.choices||!data.choices[0]||!data.choices[0].message) {
      showToast('Respuesta inesperada de OpenAI','err'); return;
    }
    var raw = data.choices[0].message.content;
    var clean = raw.replace(/```json?\n?/g,'').replace(/```/g,'').trim();
    var parsed;
    try { parsed = JSON.parse(clean); }
    catch(e) { showToast('IA no respondio JSON: '+raw.substring(0,60),'err'); return; }

    var msgs = [];
    var acciones = parsed.acciones || parsed.actions || [];
    if (!acciones.length && parsed.tipo) acciones = [parsed];

    for (var i=0; i<acciones.length; i++) {
      var a = acciones[i];

      if (a.tipo === 'actualizar') {
        var p = findProduct(a.producto);
        if (p) {
          p.cantidadActual = Math.max(0, typeof a.cantidad==='number'?a.cantidad:0);
          p.upd=now(); p.by=S.config.activeUser;
          msgs.push(p.nombre+' -> '+p.cantidadActual);
        } else {
          S.productos.push({id:nid(S.productos),nombre:cap(a.producto)||'Nuevo',categoria:'Otro',unidad:'un',cantidadActual:typeof a.cantidad==='number'?a.cantidad:0,stockMinimo:1,canal:'uber_eats',upd:now(),by:S.config.activeUser});
          msgs.push('Creado: '+a.producto);
        }
      }
      else if (a.tipo === 'pedido') {
        var pedText = cap(a.texto||a.producto||a.nombre||'Pedido');
        var pedQty = a.cantidad||1;
        var pedPor = a.solicitadoPor||a.por||S.config.activeUser;
        // Check for existing pending pedido
        var existPed = null;
        for (var ep=0; ep<S.pedidos.length; ep++) {
          if (S.pedidos[ep].estado==='pendiente' && S.pedidos[ep].texto.toLowerCase()===pedText.toLowerCase()) { existPed=S.pedidos[ep]; break; }
        }
        if (existPed) { existPed.cantidad=pedQty; existPed.por=pedPor; existPed.fecha=now(); msgs.push('Pedido actualizado: '+pedText+' x'+pedQty); }
        else { S.pedidos.push({id:nid(S.pedidos),texto:pedText,cantidad:pedQty,por:pedPor,com:a.comentario||'',fecha:now(),estado:'pendiente'}); msgs.push('Pedido: '+pedText+' x'+pedQty); }
        // Ensure in despensa (unless soloP=true)
        if (!a.soloP) {
          var pedProd = findProduct(pedText);
          if (!pedProd) {
            var pedCat = a.categoria||'Otro';
            S.productos.push({id:nid(S.productos),nombre:cap(pedText),categoria:pedCat,unidad:a.unidad||'un',cantidadActual:0,stockMinimo:pedQty,canal:dCan(pedCat),upd:now(),by:S.config.activeUser});
          } else if (a.categoria && a.categoria!=='Otro' && pedProd.categoria==='Otro') {
            pedProd.categoria = a.categoria;
          }
        }
      }
      else if (a.tipo === 'crear') {
        var nombre = cap(a.nombre||a.producto||'Nuevo');
        var categ = a.categoria||'Otro';
        var existing = findProduct(nombre);
        if (existing) { existing.cantidadActual+=(a.cantidad||1); if(categ!=='Otro')existing.categoria=categ; existing.upd=now(); existing.by=S.config.activeUser; msgs.push(existing.nombre+' +'+( a.cantidad||1)); }
        else { S.productos.push({id:nid(S.productos),nombre:nombre,categoria:categ,unidad:a.unidad||'un',cantidadActual:typeof a.cantidad==='number'?a.cantidad:1,stockMinimo:a.stockMinimo||1,canal:a.canal||dCan(categ),upd:now(),by:S.config.activeUser}); msgs.push('Nuevo: '+nombre+' ('+categ+')'); }
      }
      else if (a.tipo === 'eliminar') {
        var delName = a.producto||a.nombre||'';
        var delP = findProduct(delName);
        if (delP) {
          S.productos = S.productos.filter(function(x){return x.id!==delP.id;});
          msgs.push('Eliminado: '+delP.nombre);
        } else {
          msgs.push('No encontrado: '+delName);
        }
      }
    }

    save(); renderAll();
    var toastMsg = parsed.respuesta||'Listo!';
    if (msgs.length) toastMsg += ' | '+msgs.join(', ');
    showToast(toastMsg, msgs.length?'ok':'err');
  })
  .catch(function(err) { showToast('Error: '+err.message, 'err'); });
}

// Send
document.getElementById('uSend').addEventListener('click',function(){var inp=document.getElementById('uInput');var t=inp.value.trim();if(!t)return;inp.value='';processCommand(t);});
document.getElementById('uInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();document.getElementById('uSend').click();}});

// === INIT ===
load();
updateUserBtn();
renderAll();

// Load from cloud on startup (if proxy configured)
if (S.config.proxyUrl) {
  loadFromCloud().then(function(updated) {
    if (updated) {
      renderAll();
      showToast('Datos sincronizados', 'ok');
    }
  });
}

// Also sync when tab becomes visible (user switches back to app)
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && S.config.proxyUrl) {
    loadFromCloud().then(function(updated) {
      if (updated) { renderAll(); }
    });
  }
});
