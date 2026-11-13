/* 行政区划 2.5D 科技地图渲染器 —— 纯前端，无外部依赖，离线可用 */
(function () {
  "use strict";

  var VIEW_W = 1200, VIEW_H = 900;
  var PAD_X = 150, PAD_Y = 120; // 地图四周留白

  // 省级行政区名称（adcode -> 名称）
  var NAMES = {
    "110000": "北京市", "120000": "天津市", "130000": "河北省", "140000": "山西省",
    "150000": "内蒙古自治区", "210000": "辽宁省", "220000": "吉林省", "230000": "黑龙江省",
    "310000": "上海市", "320000": "江苏省", "330000": "浙江省", "340000": "安徽省",
    "350000": "福建省", "360000": "江西省", "370000": "山东省", "410000": "河南省",
    "420000": "湖北省", "430000": "湖南省", "440000": "广东省", "450000": "广西壮族自治区",
    "460000": "海南省", "500000": "重庆市", "510000": "四川省", "520000": "贵州省",
    "530000": "云南省", "540000": "西藏自治区", "610000": "陕西省", "620000": "甘肃省",
    "630000": "青海省", "640000": "宁夏回族自治区", "650000": "新疆维吾尔自治区",
    "710000": "台湾省", "810000": "香港特别行政区", "820000": "澳门特别行政区"
  };

  var svg = document.getElementById("map");
  var SVGNS = "http://www.w3.org/2000/svg";

  // ---- 配色系统 ----
  // 每个调色板：stops=顶面渐变停靠点; solid=纯色模式主色; bg=非透明模式背景主色
  var PALETTES = {
    "tech-blue":   { label: "科技蓝", stops: [[0, "#143a72"], [0.32, "#1f5aa0"], [0.66, "#3f86c8"], [1, "#82bcec"]], solid: "#2f6fb0", bg: "#0c2c54" },
    "indigo":      { label: "靛紫",   stops: [[0, "#241163"], [0.4, "#4326a8"], [1, "#a07bf0"]], solid: "#5a3bbf", bg: "#160a3a" },
    "emerald":     { label: "翠绿",   stops: [[0, "#0a4a32"], [0.4, "#0f7a52"], [1, "#5fe0a6"]], solid: "#14895c", bg: "#06281c" },
    "crimson-gold":{ label: "赤金",   stops: [[0, "#5e1320"], [0.4, "#a8283a"], [1, "#f4b24c"]], solid: "#c23a3a", bg: "#2a0a10" },
    "teal-orange": { label: "青橙",   stops: [[0, "#0c4f5e"], [0.45, "#138a8f"], [1, "#ff9d5c"]], solid: "#12808f", bg: "#06262e" },
    "magenta":     { label: "玫红",   stops: [[0, "#5a1140"], [0.45, "#a51e6e"], [1, "#ff8fc0"]], solid: "#c12a82", bg: "#2a0820" },
    "graphite":    { label: "石墨灰", stops: [[0, "#2a2f3a"], [0.5, "#5b6678"], [1, "#aab6c8"]], solid: "#5b6678", bg: "#0e1218" },
    "sunset":      { label: "霞光",   stops: [[0, "#3a1c5e"], [0.4, "#b5346b"], [1, "#ffb14a"]], solid: "#c23a6b", bg: "#1e0e34" }
  };

  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgbToHex(r) {
    return "#" + r.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }
  function darken(hex, amt) {
    var c = hexToRgb(hex);
    return rgbToHex(c.map(function (v) { return v * (1 - amt); }));
  }
  function lighten(hex, amt) {
    var c = hexToRgb(hex);
    return rgbToHex(c.map(function (v) { return v + (255 - v) * amt; }));
  }
  function luminance(hex) {
    var c = hexToRgb(hex);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  }
  function strokeFor(palette) {
    // 浅色面板用深色描边，深色面板用白色描边，保证分界/轮廓可见
    return luminance(palette.solid) > 0.55 ? "#10202f" : "#eaf4ff";
  }

  function el(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---- 投影：等距圆柱 + 纬度余弦修正，整体缩放并居中 ----
  function buildProjection(features) {
    var minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
    function scan(geom) {
      if (!geom) return;
      var polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      for (var i = 0; i < polys.length; i++) {
        for (var j = 0; j < polys[i].length; j++) {
          for (var k = 0; k < polys[i][j].length; k++) {
            var lon = polys[i][j][k][0], lat = polys[i][j][k][1];
            if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          }
        }
      }
    }
    features.forEach(function (f) { scan(f.geometry); });

    var lat0 = (minLat + maxLat) / 2 * Math.PI / 180;
    var cos0 = Math.cos(lat0);
    var spanLon = (maxLon - minLon) * cos0 || 1;
    var spanLat = (maxLat - minLat) || 1;
    var availW = VIEW_W - 2 * PAD_X, availH = VIEW_H - 2 * PAD_Y;
    var scale = Math.min(availW / spanLon, availH / spanLat);
    var mapW = spanLon * scale, mapH = spanLat * scale;
    var offX = (VIEW_W - mapW) / 2, offY = (VIEW_H - mapH) / 2;

    function proj(lon, lat) {
      return [ (lon - minLon) * cos0 * scale + offX,
               (maxLat - lat) * scale + offY ];
    }
    return {
      proj: proj,
      bbox: { minX: offX, minY: offY, maxX: offX + mapW, maxY: offY + mapH,
              cx: offX + mapW / 2, cy: offY + mapH / 2 }
    };
  }

  // 投影后的几何（环数组）
  function projectGeom(geom, proj) {
    var polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    var out = [];
    for (var i = 0; i < polys.length; i++) {
      var rings = [];
      for (var j = 0; j < polys[i].length; j++) {
        var r = [];
        for (var k = 0; k < polys[i][j].length; k++) {
          r.push(proj(polys[i][j][k][0], polys[i][j][k][1]));
        }
        rings.push(r);
      }
      out.push(rings);
    }
    return out;
  }

  function ringsToPath(polys) {
    var d = "";
    for (var i = 0; i < polys.length; i++) {
      for (var j = 0; j < polys[i].length; j++) {
        var r = polys[i][j];
        for (var k = 0; k < r.length; k++) {
          d += (k === 0 ? "M" : "L") + r[k][0].toFixed(1) + " " + r[k][1].toFixed(1);
        }
        d += "Z";
      }
    }
    return d;
  }

  // 带符号面积（用于选最大多边形与质心）
  function polyArea(ring) {
    var s = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var a = ring[i], b = ring[(i + 1) % n];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  function ringCentroid(ring) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      var f = p[0] * q[1] - q[0] * p[1];
      a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) { // 退化：取平均
      var sx = 0, sy = 0;
      for (var t = 0; t < ring.length; t++) { sx += ring[t][0]; sy += ring[t][1]; }
      return [sx / ring.length, sy / ring.length];
    }
    return [cx / (6 * a), cy / (6 * a)];
  }

  function buildDefs(bbox, palette, colorMode) {
    var defs = el("defs");
    // 背景径向渐变（跟随调色板）
    var bg = el("radialGradient", { id: "bgGrad", cx: "50%", cy: "42%", r: "78%" });
    bg.appendChild(el("stop", { offset: "0%", "stop-color": palette.bg }));
    bg.appendChild(el("stop", { offset: "55%", "stop-color": darken(palette.bg, 0.3) }));
    bg.appendChild(el("stop", { offset: "100%", "stop-color": darken(palette.bg, 0.6) }));
    defs.appendChild(bg);
    // 顶面渐变 / 纯色
    if (colorMode === "s") {
      var flat = el("linearGradient", {
        id: "topGrad", gradientUnits: "userSpaceOnUse",
        x1: bbox.minX, y1: bbox.minY, x2: bbox.minX, y2: bbox.minY
      });
      // 纯色：用 solid 单色（轻微自顶向下的明暗，避免死板）
      flat.appendChild(el("stop", { offset: "0%", "stop-color": lighten(palette.solid, 0.12) }));
      flat.appendChild(el("stop", { offset: "100%", "stop-color": palette.solid }));
      defs.appendChild(flat);
    } else if (colorMode === "r") {
      var rcx = (bbox.minX + bbox.maxX) / 2, rcy = (bbox.minY + bbox.maxY) / 2;
      var rrad = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 2;
      var rad = el("radialGradient", {
        id: "topGrad", gradientUnits: "userSpaceOnUse",
        cx: rcx, cy: rcy, r: rrad, fx: rcx, fy: rcy
      });
      palette.stops.forEach(function (s) {
        rad.appendChild(el("stop", { offset: (s[0] * 100).toFixed(0) + "%", "stop-color": s[1] }));
      });
      defs.appendChild(rad);
    } else {
      var horiz = colorMode !== "d"; // 'h' 水平；'d' 对角
      var lin = el("linearGradient", {
        id: "topGrad", gradientUnits: "userSpaceOnUse",
        x1: horiz ? bbox.minX : bbox.minX, y1: horiz ? bbox.minY : bbox.minY,
        x2: bbox.maxX, y2: horiz ? bbox.minY : bbox.maxY
      });
      palette.stops.forEach(function (s) {
        lin.appendChild(el("stop", { offset: (s[0] * 100).toFixed(0) + "%", "stop-color": s[1] }));
      });
      defs.appendChild(lin);
    }
    // 侧面渐变（上亮下暗，制造厚度，跟随调色板）
    var side = el("linearGradient", { id: "sideGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    side.appendChild(el("stop", { offset: "0%", "stop-color": darken(palette.solid, 0.18) }));
    side.appendChild(el("stop", { offset: "100%", "stop-color": darken(palette.solid, 0.5) }));
    defs.appendChild(side);
    // 地图发光
    var glow = el("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    glow.appendChild(el("feDropShadow", { dx: "0", dy: "6", stdDeviation: "10", "flood-color": "#001022", "flood-opacity": "0.55" }));
    defs.appendChild(glow);
    // 顶部高光（柔和椭圆，叠加在地图上制造受光面）
    var sheen = el("radialGradient", { id: "sheen", cx: "38%", cy: "30%", r: "60%" });
    sheen.appendChild(el("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": "0.14" }));
    sheen.appendChild(el("stop", { offset: "60%", "stop-color": "#ffffff", "stop-opacity": "0.03" }));
    sheen.appendChild(el("stop", { offset: "100%", "stop-color": "#ffffff", "stop-opacity": "0" }));
    defs.appendChild(sheen);
    return defs;
  }

  function buildDecor(bbox) {
    var g = el("g", { opacity: "0.5" });
    var cx = bbox.cx, cy = bbox.cy;
    var maxR = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.62;
    // 同心圆
    for (var i = 1; i <= 6; i++) {
      var r = maxR * i / 6;
      g.appendChild(el("circle", {
        cx: cx, cy: cy, r: r, fill: "none",
        stroke: "#3f74b5", "stroke-width": "1",
        "stroke-opacity": (0.18 * (1 - i / 8)).toFixed(3)
      }));
    }
    // 放射线
    for (var a = 0; a < 360; a += 30) {
      var rad = a * Math.PI / 180;
      g.appendChild(el("line", {
        x1: cx, y1: cy,
        x2: cx + Math.cos(rad) * maxR, y2: cy + Math.sin(rad) * maxR,
        stroke: "#3f74b5", "stroke-width": "1", "stroke-opacity": "0.10"
      }));
    }
    // 底部水波纹
    var baseY = VIEW_H * 0.86;
    for (var w = 0; w < 4; w++) {
      var yy = baseY + w * 14;
      var d = "M0 " + yy;
      for (var x = 0; x <= VIEW_W; x += 40) {
        d += " Q" + (x + 20) + " " + (yy - 7) + " " + (x + 40) + " " + yy;
      }
      g.appendChild(el("path", { d: d, fill: "none", stroke: "#4f86c4", "stroke-width": "1", "stroke-opacity": (0.16 - w * 0.03).toFixed(3) }));
    }
    return g;
  }

  function render(code) {
    var provOnly = !!document.getElementById("provOnly") && document.getElementById("provOnly").checked;
    var palKey = document.getElementById("palette").value || "tech-blue";
    var palette = PALETTES[palKey] || PALETTES["tech-blue"];
    var colorMode = document.getElementById("colorMode").value || "h";
    var fc = provOnly ? (window.GEO_OUTLINE[code] || window.GEO[code]) : window.GEO[code];
    if (!fc) { alert("暂无该行政区数据"); return; }
    var features = fc.features;
    var projInfo = buildProjection(features);
    var proj = projInfo.proj, bbox = projInfo.bbox;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(buildDefs(bbox, palette, colorMode));

    // 背景（仅省份模式下透明，不绘制背景与装饰）
    if (!provOnly) {
      svg.appendChild(el("rect", { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: "url(#bgGrad)" }));
      if (document.getElementById("showDeco").checked) {
        svg.appendChild(buildDecor(bbox));
      }
    }

    var H = parseInt(document.getElementById("thick").value, 10); // 立体厚度

    // 投影所有要素
    var items = features.map(function (f) {
      var pg = projectGeom(f.geometry, proj);
      // 最大多边形（用于标注与面积）
      var best = 0, bestArea = -1;
      for (var i = 0; i < pg.length; i++) {
        var ar = Math.abs(polyArea(pg[i][0]));
        if (ar > bestArea) { bestArea = ar; best = i; }
      }
      return {
        name: f.properties.name,
        pg: pg,
        d: ringsToPath(pg),
        centroid: ringCentroid(pg[best][0]),
        area: bestArea
      };
    });

    var mapG = el("g", { filter: "url(#glow)" });

    // 侧面（厚度）
    if (H > 0) {
      items.forEach(function (it) {
        var dd = it.d;
        // 向下偏移复制
        var side = el("path", { d: dd, fill: "url(#sideGrad)", transform: "translate(0," + H + ")", "fill-opacity": "0.95" });
        mapG.appendChild(side);
      });
    }

    // 顶面
    var topG = el("g", {});
    var edge = strokeFor(palette);
    items.forEach(function (it) {
      topG.appendChild(el("path", {
        d: it.d, fill: "url(#topGrad)", stroke: edge,
        "stroke-width": "1.4", "stroke-opacity": "0.9", "fill-rule": "evenodd"
      }));
    });
    // 顶部受光高光
    topG.appendChild(el("ellipse", {
      cx: bbox.cx, cy: bbox.minY + (bbox.maxY - bbox.minY) * 0.32,
      rx: (bbox.maxX - bbox.minX) * 0.5, ry: (bbox.maxY - bbox.minY) * 0.4,
      fill: "url(#sheen)"
    }));
    mapG.appendChild(topG);
    svg.appendChild(mapG);

    // 标注（带碰撞避让 + 描边光晕）——仅省份模式不显示市区名
    if (!provOnly) {
      var labelG = el("g", { "font-family": '"Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif',
        "font-weight": "500", fill: "#ffffff", "text-anchor": "middle",
        stroke: "#0a2540", "stroke-width": "2.2", "stroke-opacity": "0.55",
        "paint-order": "stroke", "stroke-linejoin": "round" });
      // 大区优先放置，重叠则隐藏，避免直辖市中心城区拥挤
      var ordered = items.slice().sort(function (a, b) { return b.area - a.area; });
      var maxArea = ordered.length ? ordered[0].area : 1;
      var thr = Math.max(320, maxArea * 0.045); // 相对阈值：小于最大区划4.5%的省略
      var boxes = [];
      function overlap(b) {
        var m = 4; // 避让间距
        for (var i = 0; i < boxes.length; i++) {
          var p = boxes[i];
          if (b.x - m < p.x + p.w + m && b.x + b.w + m > p.x - m && b.y - m < p.y + p.h + m && b.y + b.h + m > p.y - m) return true;
        }
        return false;
      }
      ordered.forEach(function (it) {
        if (it.area < thr) return; // 太小不标（直辖市中心城区过密时自动省略）
        var fs = Math.max(11, Math.min(26, Math.sqrt(it.area) / 5.5));
        var w = it.name.length * fs * 1.02 + 6;
        var h = fs * 1.3 + 4;
        var x = it.centroid[0] - w / 2, y = it.centroid[1] - h / 2;
        if (overlap({ x: x, y: y, w: w, h: h })) return; // 碰撞则跳过
        boxes.push({ x: x, y: y, w: w, h: h });
        var t = el("text", { x: it.centroid[0].toFixed(1), y: (it.centroid[1] + fs * 0.35).toFixed(1),
          "font-size": fs.toFixed(1) });
        t.textContent = it.name;
        labelG.appendChild(t);
      });
      svg.appendChild(labelG);
    }

    // 省名
    var nameText = NAMES[code] || code;
    if (provOnly) {
      // 仅省份模式：省名居中放大，作为唯一文字内容（按包围盒中心定位）
      var c0 = [bbox.cx, bbox.cy];
      var fs2 = Math.max(34, Math.min(70, Math.min(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.16));
      var cap = el("text", {
        x: c0[0].toFixed(1), y: (c0[1] + fs2 * 0.35).toFixed(1),
        fill: "#ffffff", "text-anchor": "middle",
        "font-family": '"Microsoft YaHei","PingFang SC",sans-serif',
        "font-size": fs2.toFixed(1), "font-weight": "700", "letter-spacing": "4",
        stroke: "#0a2540", "stroke-width": "3", "stroke-opacity": "0.5",
        "paint-order": "stroke", "stroke-linejoin": "round"
      });
      cap.textContent = nameText;
      svg.appendChild(cap);
    } else if (document.getElementById("showName").checked) {
      var cap2 = el("text", {
        x: 40, y: VIEW_H - 36, fill: "#eaf4ff", "fill-opacity": "0.85",
        "font-family": '"Microsoft YaHei","PingFang SC",sans-serif',
        "font-size": "30", "letter-spacing": "6", "font-weight": "600"
      });
      cap2.textContent = nameText;
      svg.appendChild(cap2);
    }
  }

  // ---- 导出 PNG ----
  function exportPNG(scale) {
    // 克隆并显式设置宽高，避免序列化后丢失尺寸导致画成缩略图；透明底可正确导出
    var clone = svg.cloneNode(true);
    clone.setAttribute("width", VIEW_W);
    clone.setAttribute("height", VIEW_H);
    var xml = new XMLSerializer().serializeToString(clone);
    var src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = VIEW_W * scale; canvas.height = VIEW_H * scale;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // 按比例放大铺满
      canvas.toBlob(function (b) {
        var a = document.createElement("a");
        var code = document.getElementById("prov").value;
        a.href = URL.createObjectURL(b);
        a.download = (NAMES[code] || code) + "_2.5D.png";
        a.click();
      });
    };
    img.src = src;
  }

  // ---- 初始化 ----
  function init() {
    var sel = document.getElementById("prov");
    Object.keys(NAMES).forEach(function (code) {
      if (!window.GEO[code]) return;
      var o = document.createElement("option");
      o.value = code; o.textContent = NAMES[code];
      sel.appendChild(o);
    });
    // 默认选辽宁省（参考图）
    sel.value = "210000";

    // 配色下拉
    var palSel = document.getElementById("palette");
    Object.keys(PALETTES).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key; o.textContent = PALETTES[key].label;
      palSel.appendChild(o);
    });
    palSel.value = "tech-blue";

    document.getElementById("exportBtn").onclick = function () { exportPNG(2); };
    document.getElementById("export4").onclick = function () { exportPNG(4); };
    sel.onchange = function () { render(sel.value); };
    ["showName", "showDeco", "thick", "provOnly", "palette", "colorMode"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { render(sel.value); });
    });

    render(sel.value);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
