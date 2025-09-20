# GeoReferencer出力GeoJSONファイル データ分類仕様書

## 概要

このドキュメントは、GeoReferencerから出力されるGeoJSONファイルの構造と、他のアプリケーションで読み込む際のデータ分類方法について説明します。GeoReferencerは精密アフィン変換により地理的に正確な座標データを生成し、データの由来（GPS/画像変換）を明確に区別して出力します。

## 基本構造

### ファイル形式
- **フォーマット**: GeoJSON FeatureCollection
- **座標系**: WGS84（EPSG:4326）
- **精度**: 小数点以下5桁（約1m精度）
- **文字エンコーディング**: UTF-8

### 全体構造
```json
{
  "type": "FeatureCollection",
  "features": [
    // Feature オブジェクトの配列
  ]
}
```

## データ分類

GeoReferencerの出力データは、データの由来と種別により以下のように分類されます：

### 1. ジオリファレンス制御点（元GPS値）
**識別方法**: `properties.source === "gps_original"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "J-04",
    "name": "J-04",
    "type": "matched_point",
    "source": "gps_original",
    "description": "ジオリファレンス制御点（元GPS値）"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.49457, 34.87521, 580.2]
  }
}
```

**特徴**:
- **データソース**: 元のGPS測位データ
- **精度**: GPS測位精度に依存（通常3-10m）
- **標高**: GPS測位で取得された標高値を含む場合がある
- **用途**: 基準点、制御点として使用
- **識別子**: `properties.type === "matched_point"`

### 2. ジオリファレンス変換済みルートポイント
**識別方法**: `properties.source === "image_transformed" && properties.type === "route_point"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "route_MAP01_route_C-03_to_J-01_開始点",
    "name": "開始点",
    "type": "route_point",
    "source": "image_transformed",
    "route_id": "MAP01_route_C-03_to_J-01",
    "description": "ジオリファレンス変換済みルートポイント"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.49353, 34.86449]
  }
}
```

**特徴**:
- **データソース**: 画像座標から精密アフィン変換により生成
- **精度**: アフィン変換精度に依存（通常1-10m）
- **ルート情報**: `route_id`でルートを識別
- **ポイント種別**: 開始点、中間点、終了点
- **標高**: 含まれない（2D座標のみ）

### 3. ジオリファレンス変換済みスポット
**識別方法**: `properties.source === "image_transformed" && properties.type === "spot"`

```json
{
  "type": "Feature",
  "properties": {
    "id": "spot_WC",
    "name": "WC",
    "type": "spot",
    "source": "image_transformed",
    "description": "ジオリファレンス変換済みスポット"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.49155, 34.87397]
  }
}
```

**特徴**:
- **データソース**: 画像座標から精密アフィン変換により生成
- **精度**: アフィン変換精度に依存（通常1-10m）
- **識別**: 施設名、地名などで識別
- **標高**: 含まれない（2D座標のみ）

## プロパティ詳細

### 共通プロパティ

| プロパティ名 | 型 | 必須 | 説明 |
|------------|---|-----|-----|
| `id` | string | ○ | 一意識別子 |
| `name` | string | ○ | 表示名 |
| `type` | string | ○ | データ種別（matched_point/route_point/spot）|
| `source` | string | ○ | データ由来（gps_original/image_transformed）|
| `description` | string | ○ | データの説明 |

### データ種別固有プロパティ

#### ルートポイント専用
| プロパティ名 | 型 | 必須 | 説明 |
|------------|---|-----|-----|
| `route_id` | string | ○ | ルート識別子（例: MAP01_route_C-03_to_J-01）|

## 他のアプリケーションでの活用方法

### GISソフトウェア（QGIS、ArcGIS等）

#### レイヤー分割による表示
```sql
-- GPS制御点レイヤー
SELECT * FROM geojson_data
WHERE properties->>'source' = 'gps_original';

-- ルートポイントレイヤー
SELECT * FROM geojson_data
WHERE properties->>'type' = 'route_point';

-- スポットレイヤー
SELECT * FROM geojson_data
WHERE properties->>'type' = 'spot';
```

#### シンボル分類
- **GPS制御点**: 緑色円形、サイズ大
- **ルート開始点**: 緑色三角形
- **ルート中間点**: オレンジ色小円
- **ルート終了点**: 赤色三角形
- **スポット**: 青色正方形

### Web地図アプリケーション（Leaflet、OpenLayers等）

#### JavaScript例（Leaflet）
```javascript
// GeoJSONデータの読み込みと分類
L.geoJSON(geojsonData, {
  pointToLayer: function (feature, latlng) {
    const props = feature.properties;

    // データ種別による分類
    if (props.source === 'gps_original') {
      return L.circleMarker(latlng, {
        radius: 8,
        fillColor: '#28a745',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.8
      });
    } else if (props.type === 'route_point') {
      const color = props.name.includes('開始') ? '#28a745' :
                   props.name.includes('終了') ? '#dc3545' : '#fd7e14';
      return L.circleMarker(latlng, {
        radius: 4,
        fillColor: color,
        color: '#ffffff',
        weight: 1,
        fillOpacity: 0.7
      });
    } else if (props.type === 'spot') {
      return L.marker(latlng, {
        icon: L.divIcon({
          className: 'spot-marker',
          html: '⬜',
          iconSize: [16, 16]
        })
      });
    }
  },
  onEachFeature: function (feature, layer) {
    // ポップアップ設定
    layer.bindPopup(`
      <b>${feature.properties.name}</b><br>
      種別: ${feature.properties.type}<br>
      由来: ${feature.properties.source}<br>
      ${feature.properties.route_id ? 'ルート: ' + feature.properties.route_id : ''}
    `);
  }
});
```

### データベース（PostGIS等）

#### テーブル作成例
```sql
CREATE TABLE georeferencer_data (
  id SERIAL PRIMARY KEY,
  feature_id VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  data_type VARCHAR(50),
  data_source VARCHAR(50),
  route_id VARCHAR(255),
  description TEXT,
  geom GEOMETRY(POINT, 4326),
  elevation FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### データインポート例
```sql
INSERT INTO georeferencer_data (
  feature_id, name, data_type, data_source, route_id,
  description, geom, elevation
)
SELECT
  properties->>'id',
  properties->>'name',
  properties->>'type',
  properties->>'source',
  properties->>'route_id',
  properties->>'description',
  ST_SetSRID(ST_MakePoint(
    (geometry->'coordinates'->>0)::float,
    (geometry->'coordinates'->>1)::float
  ), 4326),
  CASE
    WHEN jsonb_array_length(geometry->'coordinates') > 2
    THEN (geometry->'coordinates'->>2)::float
    ELSE NULL
  END
FROM (
  SELECT jsonb_array_elements(geojson_data->'features') as feature
) AS features;
```

### ルート解析

#### ルートの再構築
```javascript
// ルートIDごとにポイントをグループ化
function reconstructRoutes(geojsonData) {
  const routes = {};

  geojsonData.features.forEach(feature => {
    const props = feature.properties;
    if (props.type === 'route_point' && props.route_id) {
      if (!routes[props.route_id]) {
        routes[props.route_id] = [];
      }
      routes[props.route_id].push({
        coordinates: feature.geometry.coordinates,
        name: props.name,
        order: getPointOrder(props.name) // 開始点=0, 中間点=1-n, 終了点=最大
      });
    }
  });

  // 各ルートのポイントを順序でソート
  Object.keys(routes).forEach(routeId => {
    routes[routeId].sort((a, b) => a.order - b.order);
  });

  return routes;
}

function getPointOrder(pointName) {
  if (pointName.includes('開始')) return 0;
  if (pointName.includes('終了')) return 9999;
  return 1; // 中間点
}
```

## データ品質情報

### 精度情報
- **GPS制御点**: 元GPS測位精度（通常3-10m）
- **変換済みポイント**: アフィン変換精度（制御点数と分散に依存）
- **座標精度**: 小数点以下5桁（約1m精度）

### メタデータ活用
- **data_source**: データの信頼性評価に使用
- **route_id**: ルート連続性の確認に使用
- **description**: データの用途・制約の理解に使用

### 注意事項
- **標高データ**: GPS制御点のみに含まれ、変換済みポイントには含まれない
- **重複データ**: 同一スポットが複数回読み込まれた場合の重複に注意
- **座標系**: 必ずWGS84（EPSG:4326）で出力される

## サンプルデータ統計

### MAP01-GPS-2.geojson の構成
- **総Feature数**: 53件
- **GPS制御点**: 15件（標高付き）
- **ルートポイント**: 33件（6ルート）
- **スポット**: 5件

### ルート情報
| ルートID | ポイント数 | 説明 |
|---------|----------|------|
| MAP01_route_C-03_to_J-01 | 16件 | C-03からJ-01への経路 |
| MAP01_route_F-11_to_J-05 | 9件 | F-11からJ-05への経路 |
| MAP01_route_J-02_to_J-03 | 9件 | J-02からJ-03への経路 |
| MAP01_route_J-03_to_J-04 | 9件 | J-03からJ-04への経路 |
| MAP01_route_J-05_to_J-12 | 8件 | J-05からJ-12への経路 |
| MAP01_route_J-12_to_J-04 | 5件 | J-12からJ-04への経路 |

## 関連ドキュメント

- **機能仕様書**: `docs/funcspec.md` - GeoReferencer技術詳細
- **利用者の手引**: `docs/UsersGuide-202509.md` - 操作方法・ファイル準備
- **GeoJSON仕様**: [RFC 7946](https://tools.ietf.org/html/rfc7946)

---

## 改訂履歴
- **v1.0** (2025-09-20): 初版作成、MAP01-GPS-2.geojson分析に基づく仕様策定

*この仕様書は、GeoReferencer v1.1から出力される実際のGeoJSONファイルの分析に基づいて作成されています。*