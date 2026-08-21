#!/usr/bin/env node
// api_start2 のマスタから、クエリビルダーが使う項目だけを抜き出す。
// .repositories/ はコミットされないので、再生成にはローカルのクローンが要る。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, ".repositories/api_start2/parsed");
const out = resolve(root, "src/master/master.json");

const read = (name) => JSON.parse(readFileSync(resolve(src, name), "utf-8"));

const master = {
  generatedAt: new Date().toISOString(),
  equips: read("api_mst_slotitem.json").map((x) => ({
    id: x.api_id,
    name: x.api_name,
    type2: x.api_type[2],
  })),
  equipTypes: read("api_mst_slotitem_equiptype.json").map((x) => ({
    id: x.api_id,
    name: x.api_name,
  })),
  ships: read("api_mst_ship.json").map((x) => ({
    id: x.api_id,
    name: x.api_name,
    yomi: x.api_yomi ?? "",
    stype: x.api_stype,
  })),
  shipTypes: read("api_mst_stype.json").map((x) => ({
    id: x.api_id,
    name: x.api_name,
  })),
  maps: read("api_mst_mapinfo.json").map((x) => ({
    area: x.api_maparea_id,
    no: x.api_no,
    name: x.api_name,
  })),
  mapAreas: read("api_mst_maparea.json").map((x) => ({
    id: x.api_id,
    name: x.api_name,
  })),
};

writeFileSync(out, JSON.stringify(master) + "\n", "utf-8");
console.log(
  `装備 ${master.equips.length} / カテゴリ ${master.equipTypes.length} / ` +
    `艦 ${master.ships.length} / 艦種 ${master.shipTypes.length} / ` +
    `海域 ${master.maps.length} / 海域エリア ${master.mapAreas.length}`,
);
