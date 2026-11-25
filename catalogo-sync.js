/* catalogo-sync.js - Sincroniza el catálogo con Google Sheets (Inventario, Mayor, Categorias) */
(function () {
  var BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTnIxShBMRhOYPdlLhfik4Lz9vfCm3Aw_hpEgtGJNAmuD4fjEjbxEcHa4BMZBGQ642e0Nqx2LSM9cfV/pub';
  var URL_INV = BASE + '?gid=0&single=true&output=csv';
  var URL_MAYOR = BASE + '?gid=1972859874&single=true&output=csv';
  var URL_CAT = BASE + '?gid=1495544104&single=true&output=csv';
  var MAYOR = 'PRECIO AL MAYOR', NUEVOS = 'NUEVOS';

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function num(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = s.replace(',', '.');
    return parseFloat(s);
  }
  function hid(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 100000 + (Math.abs(h) % 900000);
  }
  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function find(hs) {
    for (var k = 1; k < arguments.length; k++) {
      for (var j = 0; j < hs.length; j++) if (hs[j].indexOf(arguments[k]) > -1) return j;
    }
    return -1;
  }
  function table(rows, need) {
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var c = need(rows[i].map(norm));
      if (c) return { c: c, data: rows.slice(i + 1) };
    }
    return null;
  }
  function get(url) {
    return fetch(url + '&t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(parseCSV);
  }
  function needPrecio(hs) {
    var n = find(hs, 'NOMBRE', 'PRODUCTO', 'DESCRIP'), p = find(hs, 'MAXIMO', 'VENTA', 'PRECIO');
    return n > -1 && p > -1 ? { n: n, p: p, e: find(hs, 'EXISTENCIA', 'STOCK', 'CANTIDAD') } : null;
  }

  function sync() {
    var grid = document.getElementById('categories-grid');
    grid.innerHTML = '<p class="col-span-2 text-center text-slate-400 text-sm py-10">Cargando catálogo...</p>';

    Promise.all([
      get(URL_INV),
      get(URL_MAYOR).catch(function () { return null; }),
      get(URL_CAT).catch(function () { return null; })
    ]).then(function (res) {
      var inv = res[0], may = res[1], cat = res[2];

      // Memoria de categorías: el catálogo anterior (por nombre)
      var byName = {}, idByName = {}, catKeys = {};
      initialProducts.forEach(function (p) {
        idByName[norm(p.name)] = p.id;
        if (p.cat !== MAYOR) byName[norm(p.name)] = p.cat;
      });
      Object.keys(categoriesData).forEach(function (k) { catKeys[norm(k)] = k; });

      // Pestaña Categorias: Producto | Categoria | Peso
      var pesoNames = {};
      var tc = cat && table(cat, function (hs) {
        var n = find(hs, 'PRODUCTO', 'NOMBRE'), k = find(hs, 'CATEGORIA');
        return n > -1 && k > -1 ? { n: n, k: k, w: find(hs, 'PESO', 'KILO') } : null;
      });
      if (tc) tc.data.forEach(function (r) {
        var key = norm(r[tc.c.n]);
        if (!key) return;
        var k = catKeys[norm(r[tc.c.k])];
        if (k) byName[key] = k;
        if (tc.c.w > -1 && /^(SI|S|1|X|KG|PESO)$/.test(norm(r[tc.c.w]))) pesoNames[key] = true;
      });

      // Pestaña Inventario: solo existencia mayor que 0
      var prods = [], seen = {};
      var ti = table(inv, needPrecio);
      if (ti) ti.data.forEach(function (r) {
        var name = String(r[ti.c.n] || '').trim(), price = num(r[ti.c.p]);
        if (!name || !(price > 0)) return;
        if (ti.c.e > -1 && !(num(r[ti.c.e]) > 0)) return;
        var key = norm(name);
        if (seen[key]) return;
        seen[key] = true;
        var id = idByName[key] || hid(key);
        if (pesoNames[key]) KG_IDS.add(id);
        prods.push({ id: id, cat: byName[key] || NUEVOS, name: name, price: price });
      });
      if (!prods.length) throw new Error('Inventario vacío o sin columnas Nombre / Precio');

      // Pestaña Mayor: Nombre | Precio
      var mayor = null;
      var tm = may && table(may, needPrecio);
      if (tm) {
        mayor = [];
        tm.data.forEach(function (r) {
          var name = String(r[tm.c.n] || '').trim(), price = num(r[tm.c.p]);
          if (!name || !(price > 0)) return;
          mayor.push({ id: idByName[norm(name)] || hid(norm(name)), cat: MAYOR, name: name, price: price });
        });
      } else {
        mayor = rawProducts.filter(function (p) { return p.cat === MAYOR; });
      }

      rawProducts = mayor.concat(prods);
      if (prods.some(function (p) { return p.cat === NUEVOS; })) categoriesData[NUEVOS] = { icon: 'fa-star' };
      else delete categoriesData[NUEVOS];

      Object.keys(cart).forEach(function (id) {
        var p = rawProducts.find(function (x) { return x.id === +id; });
        if (p) cart[id].product = p; else delete cart[id];
      });
      populateAdminCategories();
      renderCategoriesGrid();
      updateCartUI();
      if (currentCategory && categoriesData[currentCategory]) selectCategory(currentCategory);
      else if (currentCategory) showCategoriesView();
      console.log('Catálogo sincronizado:', prods.length, 'productos +', mayor.length, 'al mayor');
    }).catch(function (e) {
      console.warn('No se pudo sincronizar, se usa la lista guardada:', e);
      renderCategoriesGrid();
    });
  }

  function start() { setTimeout(sync, 0); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
