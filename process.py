#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 精简 GeoJSON：坐标四舍五入到 3 位小数、剔除极小岛屿、保留 name 属性，
# 输出为 geo-data.js（window.GEO），用 <script> 加载，离线可用。
import json, os, glob

DATA = os.path.join(os.path.dirname(__file__), "data")
OUT = os.path.join(os.path.dirname(__file__), "geo-data.js")

def round_ring(ring, prec=3):
    out = []
    last = None
    for x, y in ring:
        p = [round(x, prec), round(y, prec)]
        if p != last:
            out.append(p)
            last = p
    # 闭合
    if len(out) >= 2 and out[0] != out[-1]:
        out.append(out[0])
    return out

def ring_area(ring):
    # 鞋带公式（度^2，仅用于阈值判断）
    s = 0.0
    n = len(ring)
    for i in range(n - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2.0

def simplify_polygon(poly, min_area=2e-4):
    # poly: [ring0(outer), ring1..(holes)]
    if not poly:
        return None
    outer = round_ring(poly[0])
    if ring_area(outer) < min_area:
        return None
    holes = []
    for h in poly[1:]:
        rh = round_ring(h)
        if len(rh) >= 4 and ring_area(rh) >= min_area:
            holes.append(rh)
    return [outer] + holes

def simplify_geom(geom):
    t = geom.get("type")
    if t == "Polygon":
        poly = simplify_polygon(geom["coordinates"])
        if not poly:
            return None
        return {"type": "Polygon", "coordinates": poly}
    if t == "MultiPolygon":
        polys = []
        for p in geom["coordinates"]:
            sp = simplify_polygon(p)
            if sp:
                polys.append(sp)
        if not polys:
            return None
        return {"type": "MultiPolygon", "coordinates": polys}
    return None

def process_feature(f):
    g = simplify_geom(f.get("geometry") or {})
    if not g:
        return None
    props = f.get("properties") or {}
    newp = {
        "name": props.get("name", ""),
        "adcode": props.get("adcode"),
        "center": props.get("center"),
        "centroid": props.get("centroid"),
        "level": props.get("level"),
    }
    return {"type": "Feature", "properties": newp, "geometry": g}

def main():
    files = sorted(glob.glob(os.path.join(DATA, "*.json")))
    geo = {}
    for fp in files:
        code = os.path.splitext(os.path.basename(fp))[0]
        try:
            with open(fp, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            print("跳过无法解析的文件:", fp, e)
            continue
        feats = []
        for f in data.get("features", []):
            nf = process_feature(f)
            if nf:
                feats.append(nf)
        geo[code] = {"type": "FeatureCollection", "features": feats}

    # 从全国总数据抽取台湾省（DataV 无独立 710000_full）
    tw_path = os.path.join(DATA, "100000.json")
    geo_outline = {}
    if os.path.exists(tw_path):
        with open(tw_path, "r", encoding="utf-8") as fh:
            cn = json.load(fh)
        for f in cn.get("features", []):
            adcode = str(f.get("properties", {}).get("adcode"))
            if adcode == "710000" and "710000" not in geo:
                nf = process_feature(f)
                if nf:
                    geo["710000"] = {"type": "FeatureCollection", "features": [nf]}
            # 省份单轮廓（无市区线，用于“仅省份”透明模式）
            nf = process_feature(f)
            if nf:
                geo_outline[adcode] = {"type": "FeatureCollection", "features": [nf]}

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// 自动生成：全国省级行政区边界（精简版，离线可用）\n")
        fh.write("window.GEO = ")
        json.dump(geo, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
        fh.write("// 省份单轮廓（无市区划分，用于仅省份/透明底模式）\n")
        fh.write("window.GEO_OUTLINE = ")
        json.dump(geo_outline, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print("生成", OUT)
    print("省份数量(含市区):", len(geo))
    print("省份轮廓数量:", len(geo_outline))
    total = sum(len(v["features"]) for v in geo.values())
    print("要素总数:", total)
    print("文件大小(KB):", round(os.path.getsize(OUT) / 1024, 1))

if __name__ == "__main__":
    main()
