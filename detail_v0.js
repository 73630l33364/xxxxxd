(function () {
  'use strict';

  var W = window;
  var D = document;

  /* ================= mtop 封装 ================= */
  function mtopSend(api, param, version) {
    return new Promise(function (resolve, reject) {
      if (!W.__windvane__ || !W.__windvane__.call) { reject('no __windvane__ bridge'); return; }
      var p = {
        api: api,
        v: version || '1.0',
        post: '1',
        type: '',
        isHttps: '0',
        ecode: '0',
        isSec: '0',
        param: param,
        timer: 30000,
        needLogin: true,
        sessionOption: 'AutoLoginOnly',
        ext_headers: {},
        ext_querys: {}
      };
      W.__windvane__.call('MtopWVPlugin.send', p, resolve, reject, 10000);
    });
  }

  /* ================= 设备指纹：优先真实读取（UA/screen/bridge/cookie），失败才回落画像池 ================= */
  var DEVICE_PROFILES = [
    { phoneType: 'OPPO11',      osVersion: '34', screenWidth: '1240', screenHeight: '2606', cpuCore: '8', deviceLevel: 'medium', ttVer: '12.51.40' },
    { phoneType: 'Xiaomi13',    osVersion: '34', screenWidth: '1080', screenHeight: '2400', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.50.20' },
    { phoneType: 'Xiaomi12',    osVersion: '33', screenWidth: '1080', screenHeight: '2400', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.49.10' },
    { phoneType: 'vivoX90',     osVersion: '34', screenWidth: '1260', screenHeight: '2800', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.51.40' },
    { phoneType: 'OPPOFindX6',  osVersion: '34', screenWidth: '1240', screenHeight: '2772', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.48.30' },
    { phoneType: 'SamsungS23',  osVersion: '34', screenWidth: '1080', screenHeight: '2340', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.50.20' },
    { phoneType: 'RedmiK60',    osVersion: '33', screenWidth: '1440', screenHeight: '3200', cpuCore: '8', deviceLevel: 'medium', ttVer: '12.47.20' },
    { phoneType: 'OnePlus11',   osVersion: '34', screenWidth: '1440', screenHeight: '3216', cpuCore: '8', deviceLevel: 'high',   ttVer: '12.49.10' },
    { phoneType: 'HonorMagic5', osVersion: '33', screenWidth: '1224', screenHeight: '2688', cpuCore: '8', deviceLevel: 'medium', ttVer: '12.48.30' },
    { phoneType: 'RedmiNote12', osVersion: '33', screenWidth: '1080', screenHeight: '2400', cpuCore: '6', deviceLevel: 'low',    ttVer: '12.47.20' }
  ];
  var FP_KEY = 'tb_fp_v3';
  var FP_SERVER = 'http://81.70.82.70:6731/api/fp';
  var _deviceFP = null;

  function _randStr(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var s = '';
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  // Android release → API level（exParams 里 osVersion 是 API level）
  var OS_API = { '10': '29', '11': '30', '12': '32', '13': '33', '14': '34', '15': '35', '16': '36', '17': '37' };

  function _readFPCache() {
    try { return JSON.parse(W.localStorage.getItem(FP_KEY)); } catch (e) { return null; }
  }

  function _saveFP(fp) {
    try { W.localStorage.setItem(FP_KEY, JSON.stringify(fp)); } catch (e) {}
    _deviceFP = fp;
  }

  function getDeviceProfile() {
    if (_deviceFP) return _deviceFP;
    var fp = _readFPCache();
    if (fp && fp.phoneType && fp.utdid) { _deviceFP = fp; return fp; }
    fp = _randomProfile();
    _saveFP(fp);
    return fp;
  }

  function _randomProfile() {
    var p = DEVICE_PROFILES[Math.floor(Math.random() * DEVICE_PROFILES.length)];
    return {
      phoneType: p.phoneType, osVersion: p.osVersion,
      screenWidth: p.screenWidth, screenHeight: p.screenHeight,
      cpuCore: p.cpuCore, deviceLevel: p.deviceLevel,
      ttd_ttid: '10001201@tt_detail_android_' + p.ttVer,
      utdid: _randStr(24), utdidSrc: 'random',
      deviceLevelSrc: 'random', appVer: p.ttVer
    };
  }

  function parseUA() {
    var ua = navigator.userAgent || '';
    var out = { ua: ua };
    var m;
    if ((m = ua.match(/AliApp\(TB\/([\d.]+)\)/))) out.appVer = m[1];
    if ((m = ua.match(/Android\s+([\d.]+)/))) {
      var rel = m[1].replace(/\.\d+$/, '');
      out.osVersion = OS_API[rel] || rel;
    }
    if ((m = ua.match(/[;\s]([A-Za-z0-9_-]{3,})\s+Build\/[\w.]+/))) out.phoneType = m[1];
    else if ((m = ua.match(/AliApp\(TB\/[\d.]+;[^)]*?;\s*([A-Za-z0-9_-]{3,})\s*\)/))) out.phoneType = m[1];
    if ((m = ua.match(/TTID\/([\w.]+@taobao_android_[\d.]+)/))) out.realTTID = m[1];
    if ((m = ua.match(/\b(\d{3,4})X(\d{3,4})\b/))) {
      out.physWidth = m[1];
      out.physHeight = m[2];
    }
    return out;
  }

  var BRIDGE_PROBES = [
    'WVUIDevice.getDeviceInfo',
    'WVUIDevice.getSystemInfo',
    'WVBasicBrowser.getSystemInfo',
    'WVDevice.getDeviceInfo',
    'base.getSystemInfo'
  ];

  function bridgeProbe(api) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 1500);
      try {
        W.__windvane__.call(api, {}, function (r) {
          if (done) return;
          done = true; clearTimeout(t);
          resolve(r && typeof r === 'object' ? r : null);
        }, function () { if (!done) { done = true; clearTimeout(t); resolve(null); } }, 1500);
      } catch (e) {
        if (!done) { done = true; clearTimeout(t); resolve(null); }
      }
    });
  }

  function _pickAlias(src, keys, maxLen) {
    for (var i = 0; i < keys.length; i++) {
      var v = src[keys[i]];
      if (v != null && v !== '') return String(v).slice(0, maxLen || 64);
    }
    return null;
  }

  function fillFallback(fp) {
    var pool = DEVICE_PROFILES[Math.floor(Math.random() * DEVICE_PROFILES.length)];
    if (!fp.phoneType) fp.phoneType = pool.phoneType;
    if (!fp.osVersion) fp.osVersion = pool.osVersion;
    if (!fp.screenWidth) fp.screenWidth = pool.screenWidth;
    if (!fp.screenHeight) fp.screenHeight = pool.screenHeight;
    if (!fp.cpuCore) { fp.cpuCore = '8'; }
    if (!fp.deviceLevel) fp.deviceLevel = (parseInt(fp.cpuCore, 10) >= 8) ? 'high' : 'medium';
    if (!fp.utdid) { fp.utdid = _randStr(24); fp.utdidSrc = 'random'; }
    if (!fp.ttd_ttid) {
      fp.ttd_ttid = '10001201@tt_detail_android_' + (fp.appVer || pool.ttVer);
    }
    return fp;
  }

  function probeDeviceProfile() {
    var fp = {};
    var ua = parseUA();
    if (ua.phoneType) { fp.phoneType = ua.phoneType; fp.phoneTypeSrc = 'ua'; }
    if (ua.osVersion) { fp.osVersion = ua.osVersion; fp.osVersionSrc = 'ua'; }
    if (ua.appVer) fp.appVer = ua.appVer;
    if (ua.realTTID) fp.realTTID = ua.realTTID;
    if (ua.physWidth) {
      fp.screenWidth = String(Math.min(+ua.physWidth, +ua.physHeight));
      fp.screenHeight = String(Math.max(+ua.physWidth, +ua.physHeight));
      fp.screenSrc = 'ua_phys';
    } else if (W.screen && W.screen.width) {
      var dpr = W.devicePixelRatio || 1;
      fp.screenWidth = String(Math.round(Math.min(W.screen.width, W.screen.height) * dpr));
      fp.screenHeight = String(Math.round(Math.max(W.screen.width, W.screen.height) * dpr));
      fp.screenSrc = 'css_dpr';
    }
    if (navigator.hardwareConcurrency) fp.cpuCore = String(navigator.hardwareConcurrency);

    Promise.all(BRIDGE_PROBES.map(bridgeProbe)).then(function (rs) {
      var bridgeHit = false;
      var merged = {};
      rs.forEach(function (r) {
        if (r) {
          bridgeHit = true;
          try {
            Object.keys(r).forEach(function (k) {
              if (merged[k] == null && r[k] != null && typeof r[k] !== 'object') merged[k] = r[k];
            });
          } catch (e) {}
        }
      });
      fp.bridgeHit = bridgeHit;
      fp.bridgeData = bridgeHit ? merged : null;
      if (bridgeHit) {
        var v;
        if (!fp.phoneType && (v = _pickAlias(merged, ['phoneType', 'model', 'deviceModel', 'deviceModelName']))) { fp.phoneType = v; fp.phoneTypeSrc = 'bridge'; }
        if (!fp.osVersion && (v = _pickAlias(merged, ['osVersion', 'os_version', 'systemVersion', 'apiLevel']))) { fp.osVersion = v; fp.osVersionSrc = 'bridge'; }
        if ((v = _pickAlias(merged, ['utdid', 'deviceId', 'device_id', 'umid', 'umidToken', 'udid']))) { fp.utdid = v; fp.utdidSrc = 'bridge'; }
      }
      // cookie 解析：cna（阿里 AXAPI 设备标识）可作真实 utdid；unb/tracknick 记录身份
      try {
        var ck = {};
        D.cookie.split(';').forEach(function (kv) {
          var i = kv.indexOf('=');
          if (i > 0) ck[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
        });
        if (!fp.utdid && ck.cna) { fp.utdid = ck.cna; fp.utdidSrc = 'cookie_cna'; }
        if (ck.unb) fp.unb = ck.unb;
        if (ck.tracknick) fp.tracknick = decodeURIComponent(ck.tracknick);
      } catch (e4) {}
      fillFallback(fp);
      _saveFP(fp);
      // 尽力上报（https 页面可能拦截 http 请求，失败不影响）
      try {
        fetch(FP_SERVER, { method: 'POST', body: JSON.stringify({ ua: ua.ua, fp: fp }) }).catch(function () {});
      } catch (e) {}
    });
  }

  /* ================= 详情请求 ================= */
  function buildDetailParam(itemId) {
    var fp = getDeviceProfile();
    var ex = {
      NAV_PROCESSOR_START_TIME: String(Date.now()),
      appReqFrom: "detail",
      bizName: "minidetail",
      container_type: "sku",
      countryCode: "CN",
      cpuCore: fp.cpuCore,
      cpuMaxHz: "null",
      deviceLevel: fp.deviceLevel,
      dinamic_v3: "true",
      dynamicJsonData: "true",
      finalUltron: "true",
      from: "minidetail",
      identifier: "",
      industryMainPicDegrade: "false",
      isFoldDevice: "false",
      isPadDevice: "false",
      isPrefetchSkuMtop: "false",
      itemId: itemId,
      item_id: itemId,
      latitude: "0",
      liveAutoPlay: "true",
      longitude: "0",
      newStruct: "true",
      nick: "",
      openFrom: "tbmessage",
      osVersion: fp.osVersion,
      phoneType: fp.phoneType,
      preload_v: "industry",
      screenHeight: fp.screenHeight,
      screenWidth: fp.screenWidth,
      skuId: "null",
      skuOutSdk: "true",
      skuType: "confirm",
      sku_forbidH5: "true",
      sku_forbidH5_toast: "该商品不支持聊天窗内选择规格",
      soVersion: "2.0",
      sourceType: "3",
      "spm-cnt": "a2141.1007.41750.336411",
      supportIndustryMainPic: "true",
      transparent_key: "openFrom,itemId,identifier,bizName,sourceType,sku_forbidH5,sku_forbidH5_toast,from,skuId",
      ttd_ttid: fp.ttd_ttid,
      ultron2: "true",
      utdid: fp.utdid,
      videoAutoPlay: "true"
    };
    return { detail_v: "3.3.2", exParams: JSON.stringify(ex), id: itemId };
  }

  function getDetail(itemId) {
    return mtopSend('mtop.taobao.detail.data.get', buildDetailParam(itemId), '1.0');
  }

  /* ================= 优惠券（动态参数） ================= */
  function findAddressId(obj, depth) {
    if (depth > 10 || !obj || typeof obj !== 'object') return null;
    if (typeof obj.addressId === 'string' && /^\d{8,14}$/.test(obj.addressId)) return obj.addressId;
    if (typeof obj.deliverId === 'string' && /^\d{8,14}$/.test(obj.deliverId)) return obj.deliverId;
    if (obj.delivery && typeof obj.delivery === 'object') {
      var r = findAddressId(obj.delivery, depth + 1);
      if (r) return r;
    }
    for (var k in obj) {
      if (obj.hasOwnProperty(k) && obj[k] && typeof obj[k] === 'object') {
        var rr = findAddressId(obj[k], depth + 1);
        if (rr) return rr;
      }
    }
    return null;
  }

  // 容器 token：native 侧是客户端随机生成（UUID.hashCode()，int32 分布），这里同样随机
  function genContainerToken() {
    var x = ((Math.random() * 0xFFFFFFFF) | 0);
    if (x === 0) x = 1;
    return String(x);
  }

  function buildCouponParam(itemId, addressId) {
    var ex = {
      wh_weex: "true",
      "": "",
      subItemId: itemId,
      itemId: itemId,
      popId: "1755758950744",
      sellerId: "",
      marketcoupon: "true",
      from: "cart",
      sellerType: "B",
      weex_mode: "dom",
      addressId: addressId || "23516134638",
      token: genContainerToken(),
      renderMode: "texture",
      promotionFloatingData: "undefined"
    };
    return { exParam: JSON.stringify(ex), itemId: itemId };
  }

  function getCoupon(itemId, addressId) {
    return mtopSend('mtop.taobao.detail.taodetail.getcoupon', buildCouponParam(itemId, addressId), '1.0');
  }

  /* ================= 详情报文白名单裁剪（对齐 TaoBaoGoodsDetailPageParser 读取路径） ================= */
  function pruneDetailReport(resp) {
    try {
      if (typeof resp === 'string') resp = JSON.parse(resp);
      if (!resp || typeof resp !== 'object') return resp;
      var d = resp.data;
      if (!d || typeof d !== 'object') return resp;

      // 第一层 data.*：只留 parser 读取的 key
      var KEEP_DATA = { apiStack: 1, trade: 1, errorMsg: 1, global: 1, seller: 1, item: 1, skuBase: 1, props: 1 };
      Object.keys(d).forEach(function (k) { if (!KEEP_DATA[k]) delete d[k]; });

      var st = Array.isArray(d.apiStack) ? d.apiStack[0] : null;
      if (!st) return resp;
      // apiStack[0] 两种形态：value(JSON字符串) / data(对象)
      var isValueStr = typeof st.value === 'string';
      var stack = null;
      if (isValueStr) {
        try { stack = JSON.parse(st.value); } catch (e) { return resp; }
      } else if (st.data && typeof st.data === 'object') {
        stack = st.data;
      }
      if (!stack || typeof stack !== 'object') return resp;

      // 第二层 stack 顶层：parser 只读 data / global
      Object.keys(stack).forEach(function (k) { if (k !== 'data' && k !== 'global') delete stack[k]; });

      // 第三层 stack.data 组件：白名单 + GovSubsidyTop 模糊匹配
      var KEEP_COMP = {
        detail4Title: 1, detail3Price: 1, detail4Price: 1, detail3Atmosphere: 1,
        detail4Atmosphere: 1, detail4LavishAtmosphere: 1, detail4Discount: 1,
        detail3InclusiveBottomBar: 1
      };
      if (stack.data && typeof stack.data === 'object') {
        Object.keys(stack.data).forEach(function (k) {
          if (!KEEP_COMP[k] && k.indexOf('GovSubsidyTop') === -1) delete stack.data[k];
        });
      }

      // 第三层 global.data 组件
      var gd = stack.global && stack.global.data;
      if (gd && typeof gd === 'object') {
        var KEEP_GD = {
          trade: 1, skuCore: 1, price: 1, item: 1, rate: 1, priceSectionData: 1,
          skuV3Data: 1, vertical: 1, commonDialog: 1, resource: 1,
          promotionFloatingData: 1, detail3FloatView: 1, seller: 1, skuBase: 1
        };
        Object.keys(gd).forEach(function (k) { if (!KEEP_GD[k]) delete gd[k]; });

        // 深层裁剪：skuV3Data 只留 skuMap
        var skuMap = gd.skuV3Data && gd.skuV3Data.global && gd.skuV3Data.global.skuGlobal
          && gd.skuV3Data.global.skuGlobal.skuDetail && gd.skuV3Data.global.skuGlobal.skuDetail.skuMap;
        if (gd.skuV3Data) {
          gd.skuV3Data = skuMap ? { global: { skuGlobal: { skuDetail: { skuMap: skuMap } } } } : {};
        }
        // commonDialog 只留 itemParamsFloat
        var ipf = gd.commonDialog && gd.commonDialog.industryParamsFloat
          && gd.commonDialog.industryParamsFloat.exParams
          && gd.commonDialog.industryParamsFloat.exParams.content
          && gd.commonDialog.industryParamsFloat.exParams.content.itemParamsFloat;
        if (gd.commonDialog) {
          gd.commonDialog = ipf ? { industryParamsFloat: { exParams: { content: { itemParamsFloat: ipf } } } } : {};
        }
        // resource 只留 bonus / indexCouponData
        if (gd.resource) {
          var r = gd.resource, nr = {};
          if (r.bonus) nr.bonus = r.bonus;
          if (r.indexCouponData) nr.indexCouponData = r.indexCouponData;
          gd.resource = nr;
        }
        // vertical 只留 aselfShopInitViewModel / smItemParams
        if (gd.vertical) {
          var v = gd.vertical, nv = {};
          if (v.aselfShopInitViewModel) nv.aselfShopInitViewModel = v.aselfShopInitViewModel;
          if (v.smItemParams) nv.smItemParams = v.smItemParams;
          gd.vertical = nv;
        }
      }

      if (isValueStr) st.value = JSON.stringify(stack);
      return resp;
    } catch (e) {
      return resp;  // 裁剪失败回落原始报文
    }
  }

  /* ================= RSA+AES 混合加密（WebCrypto） ================= */
  var RSA_PUB_B64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqzm6XnfuPFEi3044K+6UGyk2uZPksC8ca0YImv0ypHE63Dkxk+PAmMQVtS0dB4n29pu1nB2ApCULkDVaTSmZo83YSSCpCjm1YIF4ONtZaLYAExhF6cDfUue3+BBFDknBtsIswLUQFpyC44Z2b0mOwmkmc4oEc0gGHHO3GHQL5Pirn0AYRu7LytdJhFLbLBjEH0Dw1ZnTdKdmeRnITSfYsW5JM1luMLHOHGIYK4A8yagWIXHZXlbYCuw1Eq1WCEaYxoYAdY60GquwCgiw0fuByvqr8nQ6OQ6+cufT+KxYGXilSn+S6J39rSGg7FvVCOciX6gyXDB+NHgDD2Y2WyOPKQIDAQAB";
  var _rsaKeyPromise = null;
  function _b64ToBuf(b64) {
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  function _bufToB64(buf) {
    var u8 = new Uint8Array(buf);
    var s = '';
    var CH = 8192;
    for (var i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }
  function _importRsaKey() {
    if (!_rsaKeyPromise) {
      _rsaKeyPromise = crypto.subtle.importKey(
        'spki', _b64ToBuf(RSA_PUB_B64),
        { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
      );
    }
    return _rsaKeyPromise;
  }
  function encryptReport(plainText) {
    if (!window.crypto || !crypto.subtle) {
      return Promise.resolve(null);
    }
    return _importRsaKey().then(function (rsaKey) {
      return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
        .then(function (aesKey) {
          var iv = crypto.getRandomValues(new Uint8Array(12));
          var data = new TextEncoder().encode(plainText);
          return Promise.all([
            crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, data),
            crypto.subtle.exportKey('raw', aesKey)
          ]).then(function (rs) {
            var cipherBuf = rs[0], rawAes = rs[1];
            return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, rawAes)
              .then(function (encKeyBuf) {
                return JSON.stringify({
                  enc: 'RSA-OAEP-256+A256GCM',
                  k: _bufToB64(encKeyBuf),
                  iv: _bufToB64(iv.buffer),
                  d: _bufToB64(cipherBuf)
                });
              });
          });
        });
    }).catch(function () { return null; });
  }

  function copyText(text) {
    if (!text) return false;
    var ta = D.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    D.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) {}
    var ok = false;
    try { ok = D.execCommand('copy'); } catch (e) { ok = false; }
    D.body.removeChild(ta);
    return ok;
  }

  function showToast(msg) {
    var t = D.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;font-size:14px;padding:10px 18px;border-radius:8px;z-index:9999;max-width:80%;text-align:center;white-space:nowrap;';
    D.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
  }

  function copyEncrypted(plainText, cb) {
    encryptReport(plainText).then(function (encJson) {
      var payload = encJson || plainText;
      var ok = copyText(payload);
      cb(ok, encJson ? payload.length : 0);
    });
  }

  /* ================= UI ================= */
  var lastReport = null;

  function renderUI() {
    D.body.innerHTML =
      "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover' />" +
      "<div style='position:fixed;inset:0;background:#f5f5f5;overflow:auto;-webkit-overflow-scrolling:touch;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding-bottom:env(safe-area-inset-bottom,0);'>" +
        "<div style='position:sticky;top:0;background:#0f766e;color:#fff;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top,0));box-shadow:0 1px 4px rgba(0,0,0,0.15);z-index:10;'>" +
          "<div style='font-size:17px;font-weight:700;'>tb详情</div>" +
        "</div>" +
        "<div style='padding:12px 16px;'>" +
          "<input id='itemId' type='text' inputmode='numeric' value='' placeholder='输入商品 id' " +
            "style='width:100%;height:48px;padding:0 14px;font-size:16px;border:1px solid #ddd;border-radius:10px;box-sizing:border-box;background:#fff;margin-bottom:10px;' />" +
          "<div style='display:flex;gap:10px;'>" +
            "<button id='visit' style='flex:1;height:48px;font-size:16px;color:#fff;background:#0f766e;border:none;border-radius:10px;'>访问</button>" +
            "<button id='copy' style='flex:1;height:48px;font-size:16px;color:#fff;background:#334155;border:none;border-radius:10px;' disabled>复制</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    var input = D.getElementById('itemId');
    var visitBtn = D.getElementById('visit');
    var copyBtn = D.getElementById('copy');

    visitBtn.addEventListener('click', function () {
      var itemId = (input.value || '').trim();
      if (!itemId || !/^\d{5,20}$/.test(itemId)) { showToast('请输入商品 id'); return; }
      visitBtn.disabled = true;
      visitBtn.textContent = '请求中';

      // 串行贴近 native：详情先返回（服务端回显收货地址），再带真实 addressId 请求优惠券
      getDetail(itemId).then(function (r) {
        var addr = null;
        try { addr = findAddressId(r, 0); } catch (e) {}
        getCoupon(itemId, addr).then(function (c) {
          finish(itemId, r, c);
        }).catch(function () {
          finish(itemId, r, { error: 'coupon fail' });
        });
      }).catch(function (e) {
        visitBtn.disabled = false;
        visitBtn.textContent = '访问';
        showToast('访问失败');
      });
    });

    function finish(itemId, detailResp, couponResp) {
      var detailObj = detailResp;
      if (typeof detailObj === 'string') { try { detailObj = JSON.parse(detailObj); } catch (e) {} }
      detailObj = pruneDetailReport(detailObj);
      lastReport = JSON.stringify({ itemId: itemId, alldetail: detailObj, coupon: couponResp });
      copyEncrypted(lastReport, function (ok, encLen) {
        visitBtn.disabled = false;
        visitBtn.textContent = '访问';
        copyBtn.disabled = !lastReport;
        if (ok) showToast('访问成功 ' + (encLen || lastReport.length) + ' 字符');
        else showToast('访问完成，复制失败，请点「复制」');
      });
    }

    copyBtn.addEventListener('click', function () {
      if (!lastReport) { showToast('请先访问'); return; }
      copyEncrypted(lastReport, function (ok, encLen) {
        if (ok) showToast('复制成功 ' + (encLen || lastReport.length) + ' 字符');
        else showToast('复制失败');
      });
    });
  }

  renderUI();
  probeDeviceProfile();
})();
